import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hasValidRunToken } from "@/lib/auth";
import {
  captureSchemaDriftIncident,
  createRun,
  finishRun,
  finishStep,
  getIssueCount,
  startStep,
  upsertIssues,
} from "@/lib/database";
import { fetchRepositoryIssues, GitHubRequestError } from "@/lib/github";

export const maxDuration = 30;

function errorResponse(
  message: string,
  status: number,
  correlationId: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { message }, correlationId, ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  if (!process.env.FLOWMEDIC_RUN_TOKEN?.trim()) {
    return errorResponse(
      "Manual runs are disabled until FLOWMEDIC_RUN_TOKEN is configured.",
      503,
      correlationId,
    );
  }
  if (!hasValidRunToken(request)) {
    return errorResponse("Unauthorized.", 401, correlationId);
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length > 120 ||
    !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey)
  ) {
    return errorResponse(
      "Send a valid Idempotency-Key header (1–120 letters, digits, . _ : or -).",
      400,
      correlationId,
    );
  }

  const owner = process.env.GITHUB_OWNER?.trim();
  const repositoryName = process.env.GITHUB_REPOSITORY?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!process.env.DATABASE_URL?.trim() || !owner || !repositoryName || !token) {
    return errorResponse(
      "Configure DATABASE_URL, GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPOSITORY first.",
      503,
      correlationId,
    );
  }

  const repository = `${owner}/${repositoryName}`.toLowerCase();
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const columns = await sql`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_runs' AND column_name='source_snapshot'`;
    if (!columns.length) return errorResponse("Database update required: apply db/migrations/0004_approval_replay.sql in Neon, then run again.", 503, correlationId);
  } catch { return errorResponse("Could not check database setup. Check Neon connectivity.", 503, correlationId); }

  let run: Awaited<ReturnType<typeof createRun>>;
  try {
    run = await createRun(idempotencyKey, repository, correlationId);
  } catch {
    return errorResponse(
      "Could not create a run. Confirm the Phase 01 database migration has been applied.",
      503,
      correlationId,
    );
  }

  if (!run.created) {
    return NextResponse.json(
      { runId: run.id, status: run.status, reused: true, correlationId },
      { status: run.status === "running" ? 202 : 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let activeStep = "fetch_issues";
  let fetchedIssueCount = 0;
  let issueNumbers: number[] = [];
  try {
    await startStep(run.id, 1, "fetch_issues", correlationId);
    const issues = await fetchRepositoryIssues(owner, repositoryName, token);
    const snapshotSql = neon(process.env.DATABASE_URL!);
    await snapshotSql`UPDATE workflow_runs SET source_snapshot = ${JSON.stringify(issues)}::jsonb WHERE id = ${run.id} AND source_snapshot IS NULL`;
    fetchedIssueCount = issues.length;
    issueNumbers = issues.slice(0, 10).map((issue) => issue.number);
    await finishStep(
      run.id,
      "fetch_issues",
      "succeeded",
      { fetchedCount: issues.length },
      correlationId,
    );

    activeStep = "upsert_issues";
    await startStep(run.id, 2, "upsert_issues", correlationId);
    const writtenCount = await upsertIssues(repository, issues);
    const storedCount = await getIssueCount(repository);
    await finishStep(
      run.id,
      "upsert_issues",
      "succeeded",
      { writtenCount, storedCount },
      correlationId,
    );
    await finishRun(
      run.id,
      "succeeded",
      `Fetched ${issues.length}; upserted ${writtenCount}; ${storedCount} stored.`,
      correlationId,
    );

    return NextResponse.json(
      {
        runId: run.id,
        status: "succeeded",
        fetchedCount: issues.length,
        upsertedCount: writtenCount,
        storedCount,
        repository,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const pgCode =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "";
    const schemaDrift = activeStep === "upsert_issues" && pgCode === "42703";
    console.error("FlowMedic sync failed", {
      correlationId,
      step: activeStep,
      sqlState: /^[0-9A-Z]{5}$/.test(pgCode) ? pgCode : undefined,
      githubStatus: error instanceof GitHubRequestError ? error.status : undefined,
    });
    let safeMessage = schemaDrift
      ? "The destination schema is missing the expected issue_title field."
      : error instanceof GitHubRequestError
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? "The GitHub request timed out. Retry with a new idempotency key."
          : "The sync failed. Check server logs using the correlation ID.";
    const errorCode =
      error instanceof GitHubRequestError
        ? `github_${error.status}`
        : error instanceof Error && error.name === "TimeoutError"
          ? "github_timeout"
          : pgCode || "sync_failed";
    let incidentId: string | undefined;
    let incidentCaptureFailed = false;
    try {
      await finishStep(
        run.id,
        activeStep,
        "failed",
        schemaDrift
          ? {
              sqlState: "42703",
              relation: "github_issues",
              expectedColumn: "issue_title",
              fetchedIssueCount,
              sampleIssueNumbers: issueNumbers,
            }
          : { message: safeMessage },
        correlationId,
        schemaDrift ? "42703" : errorCode,
        schemaDrift ? "schema_drift" : undefined,
      );
      if (schemaDrift) {
        const fingerprint = createHash("sha256")
          .update(`postgres|${repository}|github_issues|issue_title|42703`)
          .digest("hex");
        try {
          const incident = await captureSchemaDriftIncident({
            runId: run.id,
            stepKey: activeStep,
            repository,
            correlationId,
            fingerprint,
            safeSummary:
              "Postgres rejected the issue upsert because the expected issue_title column is unavailable.",
            evidence: {
              sqlState: "42703",
              relation: "github_issues",
              expectedColumn: "issue_title",
              fetchedIssueCount,
              sampleIssueNumbers: issueNumbers,
            },
          });
          incidentId = incident.id;
        } catch {
          incidentCaptureFailed = true;
        }
      }
      if (incidentCaptureFailed) {
        safeMessage =
          "A schema-drift failure was detected, but its incident record could not be persisted.";
      } else if (schemaDrift && incidentId) {
        safeMessage =
          "The destination schema is missing the expected issue_title field. A schema-drift incident was recorded.";
      }
      await finishRun(run.id, "failed", safeMessage, correlationId);
    } catch {
      // Preserve the original safe failure response if persistence is unavailable.
    }
    return errorResponse(safeMessage, 502, correlationId, incidentId ? { incidentId } : undefined);
  }
}
