/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node acceptance runner */
/* Explicit opt-in: targets the disposable FlowMedic demo and restores the title column. */
require("@next/env").loadEnvConfig(process.cwd(), true);
const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const sql = neon(process.env.DATABASE_URL);
const base = "http://localhost:3000";
const headers = {
  Authorization: "Bearer " + process.env.FLOWMEDIC_RUN_TOKEN,
  "Content-Type": "application/json",
};
const report = { timestamp: new Date().toISOString(), checks: [], incidents: [], completed: false };
function check(ok, label) {
  report.checks.push({ label, passed: !!ok });
  console.log(ok ? "PASS" : "FAIL", label);
  if (!ok) throw new Error(label);
}
async function call(path, body, extra = {}) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...headers, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { code: r.status, data: await r.json() };
}
async function detail(id) {
  const r = await call("/api/incidents/" + id);
  check(r.code === 200, "Read incident detail");
  return r.data.incident;
}
async function fresh() {
  const r = await call(
    "/api/runs",
    {},
    { "Idempotency-Key": "acceptance-drift-" + crypto.randomUUID() },
  );
  check(r.code === 502 && r.data.incidentId, "Capture real drift incident");
  report.incidents.push(r.data.incidentId);
  const keyRow =
    await sql`SELECT r.idempotency_key FROM workflow_runs r JOIN incidents i ON i.run_id=r.id WHERE i.id=${r.data.incidentId}`;
  const retry = await call("/api/runs", {}, { "Idempotency-Key": keyRow[0].idempotency_key });
  const count =
    await sql`SELECT count(*)::integer AS count FROM incidents WHERE run_id=${retry.data.runId}`;
  check(
    retry.code === 200 && retry.data.reused && count[0].count === 1,
    "Repeated failed run key creates no duplicate incident",
  );
  return r.data.incidentId;
}
async function diagnose(id) {
  const r = await call("/api/incidents/" + id + "/diagnose", {});
  if (r.code !== 200) console.log("Diagnosis error:", r.data.error?.message);
  check(r.code === 200 && r.data.validation?.passed, "Live Gemini proposal validates");
  return detail(id);
}
function action(i, name, overrides = {}) {
  const p = i.proposals[0];
  return call("/api/incidents/" + i.id + "/action", {
    action: name,
    version: i.version,
    proposalId: p.id,
    hash: p.proposal_hash,
    ...overrides,
  });
}
(async () => {
  check(process.env.FLOWMEDIC_ACCEPTANCE_DEMO === "1", "Explicit acceptance opt-in");
  check(
    process.env.GITHUB_OWNER === "t4zn" &&
      process.env.GITHUB_REPOSITORY === "flowmedic-demo-source",
    "Dedicated demo repository",
  );
  let renamed = false;
  try {
    await sql`ALTER TABLE github_issues RENAME COLUMN issue_title TO title`;
    renamed = true;
    let id = await fresh();
    let i = await diagnose(id);
    check((await action(i, "replay")).code === 409, "Replay denied before approval");
    check(
      (await action(i, "approve", { hash: "0".repeat(64) })).code === 409,
      "Altered hash denied",
    );
    check(
      (await action(i, "approve", { version: i.version - 1 })).code === 409,
      "Stale version denied",
    );
    const denied = await fetch(base + "/api/incidents/" + id + "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    check(denied.status === 401, "Unauthenticated action denied");
    const origin = await call(
      "/api/incidents/" + id + "/action",
      {},
      { Origin: "https://untrusted.invalid" },
    );
    check(origin.code === 403, "Cross-origin action denied");
    const approvals = await Promise.all([action(i, "approve"), action(i, "approve")]);
    console.log(
      "Approval statuses",
      approvals.map((r) => r.code),
    );
    check(
      approvals.filter((r) => r.code === 200).length === 1 &&
        approvals.filter((r) => r.code === 409).length === 1,
      "Concurrent approval accepts exactly once",
    );
    i = await detail(id);
    const replays = await Promise.all([action(i, "replay"), action(i, "replay")]);
    console.log(
      "Replay statuses",
      replays.map((r) => ({ code: r.code, status: r.data.status, error: r.data.error?.message })),
    );
    check(
      replays.filter((r) => r.code === 200 && r.data.status === "recovered").length === 1 &&
        replays.filter((r) => r.code === 409).length === 1,
      "Concurrent replay recovers exactly once",
    );
    check((await action(i, "replay")).code === 409, "Duplicate replay denied");
    i = await detail(id);
    check(
      i.status === "recovered" && i.timeline.some((e) => e.action === "replay_verified"),
      "Recovered state and verified audit persist",
    );
    const counts =
      await sql`SELECT count(*)::integer AS count FROM github_issues WHERE repository='t4zn/flowmedic-demo-source'`;
    check(counts[0].count === 6, "Replay retains six unique issue rows");
    const attempts =
      await sql`SELECT status, verified_count FROM replay_attempts WHERE incident_id=${id}`;
    check(
      attempts.length === 1 &&
        attempts[0].status === "succeeded" &&
        attempts[0].verified_count === 6,
      "One verified replay attempt persisted",
    );
    id = await fresh();
    i = await diagnose(id);
    check((await action(i, "reject")).code === 200, "Proposal rejection accepted");
    i = await detail(id);
    check(
      i.status === "rejected" && (await action(i, "replay")).code === 409,
      "Rejected proposal cannot replay",
    );
    id = await fresh();
    i = await diagnose(id);
    check((await action(i, "approve")).code === 200, "Failure-case proposal approved");
    i = await detail(id);
    const before =
      await sql`SELECT md5(string_agg(row_to_json(g)::text,'|' ORDER BY external_id)) AS hash FROM github_issues g WHERE repository='t4zn/flowmedic-demo-source'`;
    let constrained = false;
    try {
      await sql`ALTER TABLE github_issues ADD CONSTRAINT flowmedic_acceptance_block CHECK (issue_number < 0) NOT VALID`;
      constrained = true;
      const failed = await action(i, "replay");
      check(
        failed.code === 200 && failed.data.status === "replay_failed",
        "Database failure produces terminal replay_failed",
      );
      const after =
        await sql`SELECT md5(string_agg(row_to_json(g)::text,'|' ORDER BY external_id)) AS hash FROM github_issues g WHERE repository='t4zn/flowmedic-demo-source'`;
      check(before[0].hash === after[0].hash, "Failed replay rolls back destination writes");
      i = await detail(id);
      check(
        i.status === "replay_failed" && i.timeline.some((e) => e.action === "replay_failed"),
        "Failure state and audit persist",
      );
      check((await action(i, "replay")).code === 409, "Terminal failed replay cannot repeat");
    } finally {
      if (constrained)
        await sql`ALTER TABLE github_issues DROP CONSTRAINT flowmedic_acceptance_block`;
    }

    report.completed = true;
  } finally {
    if (renamed) {
      await sql`ALTER TABLE github_issues RENAME COLUMN title TO issue_title`;
      console.log("RESTORED original schema");
    }
    fs.mkdirSync("docs/verification", { recursive: true });
    fs.writeFileSync(
      "docs/verification/recovery-acceptance.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  }
})().catch((e) => {
  console.log("Acceptance stopped:", e.code || e.message);
  process.exitCode = 1;
});
