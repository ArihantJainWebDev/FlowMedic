import { getConfiguration } from "@/lib/configuration";

export function GET(request: Request) {
  const incomingId = request.headers.get("x-correlation-id");
  const correlationId =
    incomingId && /^[a-zA-Z0-9._:-]{1,80}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const configuration = getConfiguration();

  return Response.json(
    {
      status: "ok",
      readiness: configuration.missing.length ? "setup_required" : "configured",
      integrations: configuration.integrations,
      missingConfiguration: configuration.missing,
      correlationId,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
