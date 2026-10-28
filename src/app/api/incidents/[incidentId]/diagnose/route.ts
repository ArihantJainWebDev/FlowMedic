import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hasValidRunToken } from "@/lib/auth";
import {
  getIncident,
  getTargetColumns,
  saveRepairProposal,
  transitionIncident,
  type IncidentStatus,
} from "@/lib/database";
import { requestRepairProposal, ProposalModelError } from "@/lib/llm";
import { validateRepairProposal } from "@/lib/repair-validation";

type RouteContext = { params: Promise<{ incidentId: string }> };

function responseError(message: string, status: number, correlationId: string) {
  return NextResponse.json(
    { error: { message }, correlationId },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const correlationId = crypto.randomUUID();
  if (!process.env.FLOWMEDIC_RUN_TOKEN?.trim()) {
    return responseError("Diagnosis is not configured.", 503, correlationId);
  }
  if (!hasValidRunToken(request)) return responseError("Unauthorized.", 401, correlationId);

  const { incidentId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incidentId)) {
    return responseError("Incident not found.", 404, correlationId);
  }
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!owner || !repo) return responseError("Repository configuration is missing.", 503, correlationId);
  const repository = `${owner}/${repo}`.toLowerCase();

  let incident;
  try {
    incident = await getIncident(incidentId, repository);
  } catch {
    return responseError("Could not read the incident. Confirm migrations 0001 and 0002 are applied.", 503, correlationId);
  }
  if (!incident) return responseError("Incident not found.", 404, correlationId);
  if (incident.error_class !== "schema_drift" || incident.error_code !== "42703") {
    return responseError("This incident is outside the supported Phase 03 schema-drift case.", 422, correlationId);
  }
  if (incident.status !== "detected") {
    return responseError(`Incident is ${incident.status}; diagnosis can only start from detected.`, 409, correlationId);
  }

  const claimed = await transitionIncident({
    incidentId,
    expectedStatus: "detected",
    expectedVersion: Number(incident.version),
    nextStatus: "diagnosing",
    correlationId,
  });
  if (!claimed.updated) return responseError("Incident changed; reload its latest status and retry if eligible.", 409, correlationId);

  try {
    const columns = await getTargetColumns();
    const evidence = incident.evidence && typeof incident.evidence === "object"
      ? incident.evidence as Record<string, unknown>
      : {};
    const safeEvidence = {
      sqlState: evidence.sqlState === "42703" ? "42703" : "unknown",
      relation: evidence.relation === "github_issues" ? "github_issues" : "unknown",
      expectedColumn: evidence.expectedColumn === "issue_title" ? "issue_title" : "unknown",
      fetchedIssueCount: Number.isInteger(evidence.fetchedIssueCount) ? Math.max(0, Math.min(100, Number(evidence.fetchedIssueCount))) : 0,
    };
    const modelResult = await requestRepairProposal({
      incident: {
        errorCode: "42703",
        errorClass: "schema_drift",
        safeSummary: String(incident.safe_summary).slice(0, 500),
        evidence: safeEvidence,
      },
      columns,
    });
    const validation = validateRepairProposal(modelResult.proposal, columns);
    const proposalHash = createHash("sha256").update(JSON.stringify(modelResult.proposal)).digest("hex");
    const incidentVersion = claimed.version + 1;
    const proposalStatus = validation.passed ? "validated" : "validation_failed";
    const incidentStatus: IncidentStatus = validation.passed ? "proposal_ready" : "validation_failed";

    await saveRepairProposal({
      incidentId,
      incidentVersion,
      correlationId,
      provider: modelResult.provider,
      model: modelResult.model,
      promptVersion: "phase-03-v1",
      schemaVersion: "repair-proposal-v1",
      proposal: modelResult.proposal,
      validation,
      status: proposalStatus,
      proposalHash,
      latencyMs: modelResult.latencyMs,
      inputTokens: modelResult.inputTokens,
      outputTokens: modelResult.outputTokens,
    });

    const transitioned = await transitionIncident({
      incidentId,
      expectedStatus: "diagnosing",
      expectedVersion: claimed.version,
      nextStatus: incidentStatus,
      correlationId,
    });
    if (!transitioned.updated) return responseError("Incident changed while saving the proposal; inspect the latest incident state.", 409, correlationId);

    return NextResponse.json(
      {
        incidentId,
        incidentStatus,
        proposal: modelResult.proposal,
        validation,
        proposalHash,
        provider: modelResult.provider,
        model: modelResult.model,
        latencyMs: modelResult.latencyMs,
        usage: { inputTokens: modelResult.inputTokens, outputTokens: modelResult.outputTokens },
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await transitionIncident({
      incidentId,
      expectedStatus: "diagnosing",
      expectedVersion: claimed.version,
      nextStatus: "detected",
      correlationId,
    }).catch(() => ({ updated: false as const }));
    if (error instanceof ProposalModelError) return responseError(error.message, error.status === 429 ? 429 : 502, correlationId);
    return responseError("Could not save or validate the proposal. The incident was returned to detected when possible.", 503, correlationId);
  }
}
