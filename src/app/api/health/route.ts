const requiredConfiguration = [
  "DATABASE_URL",
  "GITHUB_TOKEN",
  "GITHUB_OWNER",
  "GITHUB_REPOSITORY",
  "FLOWMEDIC_RUN_TOKEN",
] as const;

export function GET(request: Request) {
  const incomingId = request.headers.get("x-correlation-id");
  const correlationId =
    incomingId && /^[a-zA-Z0-9._:-]{1,80}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const configured = requiredConfiguration.every((name) => Boolean(process.env[name]?.trim()));

  return Response.json(
    {
      status: "ok",
      readiness: configured ? "configured" : "setup_required",
      integrations: {
        database: Boolean(process.env.DATABASE_URL?.trim()),
        githubToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
        repository: Boolean(process.env.GITHUB_OWNER?.trim() && process.env.GITHUB_REPOSITORY?.trim()),
        runToken: Boolean(process.env.FLOWMEDIC_RUN_TOKEN?.trim()),
        llm: Boolean(process.env.LLM_API_KEY?.trim() && process.env.LLM_MODEL?.trim()),
      },
      correlationId,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
