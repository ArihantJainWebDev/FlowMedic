import { NextResponse } from "next/server";
import { hasValidRunToken } from "@/lib/auth";
import { mergePullRequest, GitHubRequestError } from "@/lib/github";

export const maxDuration = 30;

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  if (!hasValidRunToken(request)) {
    return NextResponse.json(
      { error: { message: "Unauthorized." }, correlationId },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: { message: "GITHUB_TOKEN is not configured." }, correlationId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { pullNumber?: number; repository?: string; commitTitle?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body." }, correlationId },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const pullNumber = Number(body.pullNumber);
  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) {
    return NextResponse.json(
      { error: { message: "Send a valid pullNumber (positive integer)." }, correlationId },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let owner = process.env.GITHUB_OWNER?.trim() || "";
  let repositoryName = process.env.GITHUB_REPOSITORY?.trim() || "";
  if (body.repository && body.repository.includes("/")) {
    const [o, r] = body.repository.trim().split("/");
    if (o && r) {
      owner = o;
      repositoryName = r;
    }
  }

  if (!owner || !repositoryName) {
    return NextResponse.json(
      { error: { message: "Configure GITHUB_OWNER and GITHUB_REPOSITORY." }, correlationId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await mergePullRequest(
      owner,
      repositoryName,
      token,
      pullNumber,
      body.commitTitle || `Merge pull request #${pullNumber} (FlowMedic self-healing)`,
    );
    return NextResponse.json(
      {
        success: true,
        merged: result.merged,
        sha: result.sha,
        message: `Pull Request #${pullNumber} successfully merged into ${owner}/${repositoryName}!`,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof GitHubRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to merge pull request.";
    const status = error instanceof GitHubRequestError ? error.status : 500;
    return NextResponse.json(
      { error: { message }, correlationId },
      { status: status >= 400 && status < 600 ? status : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

