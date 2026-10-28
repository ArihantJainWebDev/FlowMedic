"use client";
import { useEffect, useState } from "react";
import { Background, Controls, ReactFlow, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Step = {
  step_key: string;
  status: string;
  duration_ms: number | null;
  error_code: string | null;
};
type Run = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  steps: Step[];
};
type Incident = {
  id: string;
  run_id: string;
  status: string;
  safe_summary: string;
  version: number;
};
type Proposal = {
  id: string;
  proposal_hash: string;
  status: string;
  proposal: {
    diagnosis: string;
    mappings: { sourceField: string; targetField: string; rationale: string }[];
  };
  validation: { passed: boolean; checks: { key: string; passed: boolean; detail: string }[] };
};
type Detail = Incident & {
  error_code: string;
  timeline: { id: string; action: string; created_at: string }[];
  proposals: Proposal[];
};
type Workspace = { runs: Run[]; incidents: Incident[]; repository: string };
const titles = [
  "GitHub Issues",
  "Normalize",
  "Neon Postgres",
  "Capture incident",
  "AI diagnosis",
  "Validate mapping",
  "Human approval",
  "Replay & verify",
];
const labels: Record<string, string> = {
  succeeded: "Complete",
  failed: "Failed",
  running: "Running",
  queued: "Waiting",
  awaiting_approval: "Approved · replay ready",
  proposal_ready: "Review proposal",
  recovered: "Recovered",
  rejected: "Rejected",
  replay_failed: "Replay failed",
};
export function RecoveryStudio() {
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState("");
  const [confirm, setConfirm] = useState("");
  const [settings, setSettings] = useState<{
    missingConfiguration: string[];
    integrations: { llm: boolean };
  } | null>(null);
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let polls = 0;
    async function poll() {
      try {
        const response = await fetch("/api/studio", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "Workspace unavailable");
        if (cancelled) return;
        setWorkspace(payload);
        setUpdated(new Date().toLocaleTimeString());
        failures = 0;
        const runId = selected || payload.runs[0]?.id;
        const incident = payload.incidents.find((i: Incident) => i.run_id === runId);
        let current: Detail | null = null;
        if (incident) {
          const r = await fetch(`/api/incidents/${incident.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message || "Incident unavailable");
          current = d.incident;
        }
        if (cancelled) return;
        setDetail(current);
        const activeRun = payload.runs.find((r: Run) => r.id === runId);
        if (busy || activeRun?.status === "running" || current?.status === "diagnosing") {
          if (++polls < 60) timer = setTimeout(poll, 2000);
          else
            setError("Live updates paused after two minutes. Refresh to check the latest state.");
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Connection failed");
        if (++failures < 3) timer = setTimeout(poll, 2000 * 2 ** failures);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, selected, refresh, busy]);
  const run = workspace?.runs.find((r) => r.id === selected) || workspace?.runs[0];
  const proposal = detail?.proposals[0];
  async function perform(action: string) {
    if (!token || busy) return;
    setBusy(action);
    if (action === "sync") { setSelected(""); setDetail(null); }
    setError("");
    try {
      const endpoint =
        action === "sync"
          ? "/api/runs"
          : action === "diagnose"
            ? `/api/incidents/${detail?.id}/diagnose`
            : `/api/incidents/${detail?.id}/action`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body:
          action === "sync" || action === "diagnose"
            ? undefined
            : JSON.stringify({
                action,
                version: detail?.version,
                proposalId: proposal?.id,
                hash: proposal?.proposal_hash,
              }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Action failed");
      if (action === "sync" && data.runId) setSelected(data.runId);
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy("");
      setRefresh((v) => v + 1);
    }
  }
  const fetchStatus = run?.steps.find((s) => s.step_key === "fetch_issues")?.status || "queued";
  const writeStatus = run?.steps.find((s) => s.step_key === "upsert_issues")?.status || "queued";
  const state = detail?.status;
  const states = [
    fetchStatus,
    fetchStatus === "succeeded" ? "succeeded" : "queued",
    writeStatus,
    detail ? "succeeded" : "queued",
    state === "diagnosing" ? "running" : proposal ? "succeeded" : "queued",
    proposal ? (proposal.validation.passed ? "succeeded" : "failed") : "queued",
    state === "rejected"
      ? "failed"
      : ["awaiting_approval", "recovered", "replay_failed"].includes(state || "")
        ? "succeeded"
        : "queued",
    state === "recovered" ? "succeeded" : state === "replay_failed" ? "failed" : "queued",
  ];
  const nodes: Node[] = titles.map((title, index) => ({
    id: String(index),
    position: { x: index < 3 ? index * 250 : (index - 3) * 235, y: index < 3 ? 20 : 230 },
    data: {
      label: (
        <div className="live-node">
          <small>STEP {String(index + 1).padStart(2, "0")}</small>
          <strong>{title}</strong>
          <span>{labels[states[index]] || states[index]}</span>
        </div>
      ),
    },
    className: `live-flow-node ${states[index]}`,
    style: { width: 205 },
  }));
  const edges: Edge[] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
  ].map(([a, b]) => ({
    id: `${a}-${b}`,
    source: String(a),
    target: String(b),
    animated: states[b] === "running",
    style: { stroke: states[b] === "failed" ? "#ce5366" : "#9caee0", strokeWidth: 2 },
  }));
  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <a className="studio-brand" href="/">
          ✳ FLOWMEDIC<span>LIVE RECOVERY STUDIO</span>
        </a>
        <p className="overline">WORKSPACE</p>
        <a href="#canvas">◈ Recovery canvas</a>
        <a href="#history">◷ Run history</a>
        <a href="#inspector">◇ Incident inspector</a>
        <div className="studio-sidebar-bottom">
          Demo workspace
          <br />
          <small>Single operator · Neon + GitHub</small>
        </div>
      </aside>
      <main className="studio-main">
        <header className="studio-top">
          <span>
            FlowMedic / <b>Recovery Studio</b>
          </span>
          <span>{updated ? `Updated ${updated}` : "Operator workspace"}</span>
        </header>
        <section className="studio-heading">
          <div>
            <p className="overline">YOUR AUTOMATION RECOVERY CENTER</p>
            <h1>Every failure. A way forward.</h1>
            <p>Trace the break. Review the repair. Recover with confidence.</p>
          </div>
          <button disabled={!token || !!busy} onClick={() => void perform("sync")}>
            {busy === "sync" ? "Syncing…" : "▶ Run workflow"}
          </button>
        </section>
        {!token ? (
          <form
            className="studio-connect"
            onSubmit={(e) => {
              e.preventDefault();
              setToken(draft);
              setDraft("");
            }}
          >
            <div>
              <h2>Open your recovery workspace</h2>
              <p>
                Enter your operator run token. It stays in memory until you disconnect or reload.
              </p>
            </div>
            <input
              aria-label="Operator run token"
              type="password"
              autoComplete="off"
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="FLOWMEDIC_RUN_TOKEN"
            />
            <button>Connect</button>
          </form>
        ) : (
          <div className="studio-session">
            <span>{workspace?.repository || "Loading repository…"}</span>
            <button onClick={() => setRefresh((v) => v + 1)}>Refresh</button>
            <button
              onClick={() => {
                setToken("");
                setWorkspace(null);
                setDetail(null);
                setSelected("");
                setError("");
              }}
            >
              Disconnect
            </button>
          </div>
        )}
        {settings?.missingConfiguration?.length ? (
          <p className="studio-alert">Setup needed: {settings.missingConfiguration.join(", ")}</p>
        ) : null}
        {error && (
          <p className="studio-alert" role="alert">
            {error} · Displayed data may be stale. Refresh to retry.
          </p>
        )}
        <div className="studio-workspace">
          <section id="canvas" className="studio-card">
            <div className="studio-card-head">
              <div>
                <h2>Workflow canvas</h2>
                <p>
                  {run
                    ? `Run ${run.id.slice(0, 8)} · ${labels[run.status] || run.status}`
                    : "Your real workflow will appear here"}
                </p>
              </div>
              <span className="studio-badge">
                {states.filter((s) => s === "succeeded").length} / 8 stages complete
              </span>
            </div>
            <div className="studio-graph">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                minZoom={0.25}
                maxZoom={1.5}
              >
                <Background gap={22} color="#d5ddeb" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            <div className="studio-rail">
              {titles.map((title, i) => (
                <div key={title} className={states[i]}>
                  <span>
                    {states[i] === "succeeded" ? "✓" : states[i] === "failed" ? "!" : i + 1}
                  </span>
                  {title}
                </div>
              ))}
            </div>
            <p className="studio-footnote">
              {run?.summary || "Waiting for a run. Progress follows saved checkpoints."}{" "}
              {run?.finished_at &&
                `Duration: ${Math.max(0, Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000))}s`}
            </p>
          </section>
          <aside id="inspector" className="studio-card studio-inspector">
            <p className="overline">RUN INSPECTOR</p>
            {detail ? (
              <>
                <h2>{labels[detail.status] || detail.status.replaceAll("_", " ")}</h2>
                <p>{detail.safe_summary}</p>
                <code>SQLSTATE {detail.error_code}</code>
                {detail.status === "detected" && (
                  <button
                    disabled={!!busy || !settings?.integrations.llm}
                    onClick={() => void perform("diagnose")}
                  >
                    Generate repair proposal
                  </button>
                )}
                {!settings?.integrations.llm && (
                  <p>Configure LLM_API_KEY and LLM_MODEL to enable diagnosis.</p>
                )}
                {proposal && (
                  <>
                    <h3>Proposed mapping</h3>
                    <p>{proposal.proposal.diagnosis}</p>
                    {proposal.proposal.mappings.map((m) => (
                      <div className="studio-mapping" key={m.sourceField}>
                        <del>{m.sourceField}</del>
                        <span>→</span>
                        <strong>{m.targetField}</strong>
                      </div>
                    ))}
                    <details>
                      <summary>Validation evidence</summary>
                      {proposal.validation.checks.map((c) => (
                        <p key={c.key}>
                          {c.passed ? "✓" : "!"} {c.detail}
                        </p>
                      ))}
                    </details>
                    {detail.status === "proposal_ready" && proposal.validation.passed && (
                      <>
                        <label className="studio-confirm">
                          <input
                            type="checkbox"
                            checked={confirm === `${proposal.proposal_hash}:${detail.version}`}
                            onChange={(e) => setConfirm(e.target.checked ? `${proposal.proposal_hash}:${detail.version}` : "")}
                          />{" "}
                          I reviewed this mapping and approve replay of the original issue snapshot.
                        </label>
                        <button
                          disabled={confirm !== `${proposal.proposal_hash}:${detail.version}` || !!busy}
                          onClick={() => void perform("approve")}
                        >
                          Approve this proposal
                        </button>
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => void perform("reject")}
                        >
                          Reject proposal
                        </button>
                      </>
                    )}
                    {detail.status === "awaiting_approval" && (
                      <button disabled={!!busy} onClick={() => void perform("replay")}>
                        Replay approved repair
                      </button>
                    )}
                  </>
                )}
                <h3>Audit timeline</h3>
                <ol className="studio-timeline">
                  {detail.timeline.map((e) => (
                    <li key={e.id}>
                      <strong>{e.action.replaceAll("_", " ")}</strong>
                      <small>{new Date(e.created_at).toLocaleTimeString()}</small>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="studio-empty">
                <span>✳</span>
                <h2>{run ? "No incident for this run" : "Ready when you are"}</h2>
                <p>
                  {run
                    ? "Sync results and recovery evidence appear here."
                    : "Connect your operator session and run the workflow."}
                </p>
              </div>
            )}
            {busy && <p role="status">{busy} in progress…</p>}
          </aside>
        </div>
        <section id="history" className="studio-card studio-history">
          <div className="studio-card-head">
            <h2>Recent runs</h2>
            <span>Last 20 runs</span>
          </div>
          {workspace?.runs.length ? (
            <div className="studio-run-list">
              {workspace.runs.map((r) => (
                <button
                  className={run?.id === r.id ? "selected" : ""}
                  key={r.id}
                  onClick={() => {
                    setSelected(r.id);
                    setDetail(null);
                    setConfirm("");
                  }}
                >
                  <span>{r.id.slice(0, 8)}</span>
                  <strong>{labels[r.status] || r.status}</strong>
                  <span>{new Date(r.started_at).toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="studio-footnote">No runs loaded yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
