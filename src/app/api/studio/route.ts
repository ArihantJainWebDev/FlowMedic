import { neon } from "@neondatabase/serverless";
import { hasValidRunToken } from "@/lib/auth";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!hasValidRunToken(request))
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401, headers });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const repository =
      `${process.env.GITHUB_OWNER?.trim()}/${process.env.GITHUB_REPOSITORY?.trim()}`.toLowerCase();
    const runs = await sql`SELECT r.id,r.status,r.started_at,r.finished_at,r.summary,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('step_key',s.step_key,'status',s.status,'duration_ms',s.duration_ms,'error_code',s.error_code) ORDER BY s.sequence) FROM workflow_steps s WHERE s.run_id=r.id),'[]'::jsonb) AS steps
 FROM workflow_runs r WHERE repository=${repository} ORDER BY started_at DESC LIMIT 20`;
    const incidents =
      await sql`SELECT id,run_id,status,safe_summary,version FROM incidents WHERE repository=${repository} ORDER BY last_seen_at DESC LIMIT 20`;
    return Response.json({ runs, incidents, repository }, { headers });
  } catch {
    return Response.json(
      { error: { message: "Cannot load workspace. Check database connectivity and migrations." } },
      { status: 503, headers },
    );
  }
}
