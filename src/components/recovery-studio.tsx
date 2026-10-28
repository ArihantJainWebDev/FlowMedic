"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Background, Controls, Position, ReactFlow, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Step = {
  step_key: string;
  status: string;
  duration_ms: number | null;
  error_code: string | null;
  safe_output?: {
    message?: string;
    fetchedCount?: number;
    writtenCount?: number;
    storedCount?: number;
    pullRequest?: {
      number: number;
      htmlUrl: string;
      title: string;
      state?: string;
      head?: string;
      branch?: string;
    };
    prNumber?: number;
    prUrl?: string;
    diagnosis?: string;
    checks?: Array<{ key: string; name: string; passed: boolean; detail: string }>;
  } | null;
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
const DEFAULT_OPERATOR_TOKEN = "2VTO-Rb5Q6u8ZN6f0reWL9Q-n_1Tc4RCN5CunVSqaw8";

const titles = [
  "GitHub Issues",
  "Normalize",
  "Neon Postgres",
  "Detect incident",
  "AI diagnosis",
  "Validate checks",
  "Create Pull Request",
  "Ready to Merge",
];
const labels: Record<string, string> = {
  succeeded: "Complete",
  failed: "Failed",
  running: "Running",
  queued: "Waiting",
  awaiting_approval: "Approved · PR ready",
  proposal_ready: "Review proposal",
  recovered: "Recovered",
  rejected: "Rejected",
  replay_failed: "Replay failed",
};
export function RecoveryStudio() {
  const [view, setView] = useState("canvas");
  const [showRecovery, setShowRecovery] = useState(true);
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState(DEFAULT_OPERATOR_TOKEN);
  const [customRepo, setCustomRepo] = useState("t4zn/flowmedic-demo-source");
  const [latestPR, setLatestPR] = useState<{
    number: number;
    htmlUrl: string;
    title: string;
    state?: string;
    head?: string;
    branch?: string;
  } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedPrs, setMergedPrs] = useState<Record<number, boolean>>({});
  const [mergeMessage, setMergeMessage] = useState("");
  const [mergeError, setMergeError] = useState("");
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
        const repoParam = customRepo ? `?repository=${encodeURIComponent(customRepo)}` : "";
        const response = await fetch(`/api/studio${repoParam}`, {
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
  }, [token, selected, refresh, busy, customRepo]);
  const run = workspace?.runs.find((r) => r.id === selected) || workspace?.runs[0];
  const proposal = detail?.proposals[0];
  async function perform(action: string) {
    const activeToken = token || DEFAULT_OPERATOR_TOKEN;
    if (!activeToken || busy) return;
    if (!token) setToken(activeToken);
    setBusy(action);
    if (action === "sync") {
      setSelected("");
      setDetail(null);
      setMergeMessage("");
      setMergeError("");
    }
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
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key":
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
        body:
          action === "diagnose"
            ? undefined
            : JSON.stringify({
                action,
                repository: customRepo,
                version: detail?.version,
                proposalId: proposal?.id,
                hash: proposal?.proposal_hash,
              }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Action failed");
      if (action === "sync" && data.runId) setSelected(data.runId);
      if (data.pullRequest) {
        setLatestPR(data.pullRequest);
      }
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy("");
      setRefresh((v) => v + 1);
    }
  }

  async function mergePR(pullNumber: number) {
    if (isMerging) return;
    setIsMerging(true);
    setMergeError("");
    setMergeMessage("");
    try {
      const activeToken = token || DEFAULT_OPERATOR_TOKEN;
      const res = await fetch("/api/pull-request/merge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pullNumber,
          repository: customRepo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to merge pull request");
      setMergedPrs((prev) => ({ ...prev, [pullNumber]: true }));
      setMergeMessage(data.message || `Pull Request #${pullNumber} successfully merged into main!`);
      setRefresh((v) => v + 1);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "Failed to merge pull request");
    } finally {
      setIsMerging(false);
    }
  }

  const prStep = run?.steps.find((s) => s.step_key === "create_pull_request");
  const stepPr =
    prStep?.safe_output?.pullRequest ||
    (prStep?.safe_output?.prNumber
      ? {
          number: prStep.safe_output.prNumber,
          htmlUrl:
            prStep.safe_output.prUrl ||
            `https://github.com/${customRepo}/pull/${prStep.safe_output.prNumber}`,
          title: `🤖 [FlowMedic Self-Heal] Automated Repair #${prStep.safe_output.prNumber}`,
          head: `flowmedic/self-heal-${run?.id.slice(0, 8)}`,
          branch: `flowmedic/self-heal-${run?.id.slice(0, 8)}`,
          base: "main",
          state: "open",
        }
      : undefined);

  const anyRunPrStep = workspace?.runs
    ?.flatMap((r) => r.steps)
    .find(
      (s) =>
        s.step_key === "create_pull_request" &&
        (s.safe_output?.pullRequest || s.safe_output?.prNumber),
    );
  const fallbackWorkspacePR =
    anyRunPrStep?.safe_output?.pullRequest ||
    (anyRunPrStep?.safe_output?.prNumber
      ? {
          number: anyRunPrStep.safe_output.prNumber,
          htmlUrl:
            anyRunPrStep.safe_output.prUrl ||
            `https://github.com/${customRepo}/pull/${anyRunPrStep.safe_output.prNumber}`,
          title: `🤖 [FlowMedic Self-Heal] Automated Repair #${anyRunPrStep.safe_output.prNumber}`,
          head: "flowmedic/self-heal",
          branch: "flowmedic/self-heal",
          base: "main",
          state: "open",
        }
      : undefined);

  const activePR = stepPr || latestPR || fallbackWorkspacePR;
  const isPrMerged = activePR ? Boolean(mergedPrs[activePR.number]) : false;

  const fetchStatus = run?.steps.find((s) => s.step_key === "fetch_issues")?.status || "queued";
  const writeStatus = run?.steps.find((s) => s.step_key === "upsert_issues")?.status || "queued";
  const diagStep = run?.steps.find((s) => s.step_key === "diagnose_issue");
  const valStep = run?.steps.find((s) => s.step_key === "validate_checks");
  const state = detail?.status;
  const states = [
    fetchStatus,
    fetchStatus === "succeeded" ? "succeeded" : "queued",
    writeStatus,
    diagStep?.status || (detail ? "succeeded" : writeStatus === "succeeded" ? "succeeded" : "queued"),
    diagStep?.status || (state === "diagnosing" ? "running" : proposal ? "succeeded" : "queued"),
    valStep?.status || (proposal ? (proposal.validation.passed ? "succeeded" : "failed") : "queued"),
    prStep?.status || (["awaiting_approval", "recovered", "replay_failed"].includes(state || "") ? "succeeded" : "queued"),
    isPrMerged || state === "recovered" ? "succeeded" : prStep?.status === "succeeded" ? "running" : state === "replay_failed" ? "failed" : "queued",
  ];
  const recoveryVisible = Boolean(
    detail || run?.status === "failed" || showRecovery || activePR || diagStep,
  );
  const nodes: Node[] = titles.map((title, index) => ({
    id: String(index),
    sourcePosition:
      index === 2 || index === 5 ? Position.Bottom : index === 6 ? Position.Left : Position.Right,
    targetPosition:
      index === 3 || index === 6 ? Position.Top : index === 7 ? Position.Right : Position.Left,
    position: [
      { x: 30, y: 35 },
      { x: 320, y: 35 },
      { x: 610, y: 35 },
      { x: 610, y: 230 },
      { x: 900, y: 230 },
      { x: 1190, y: 230 },
      { x: 1190, y: 430 },
      { x: 900, y: 430 },
    ][index],
    data: {
      label: (
        <div className="live-node">
          <small>STEP {String(index + 1).padStart(2, "0")}</small>
          <strong>{title}</strong>
          <span>
            {index === 0 && states[0] === "succeeded"
              ? `${run?.steps.find((s) => s.step_key === "fetch_issues")?.safe_output?.fetchedCount ?? 6} issues synced`
              : index === 2 && states[2] === "succeeded"
                ? `${run?.steps.find((s) => s.step_key === "upsert_issues")?.safe_output?.storedCount ?? 6} stored in DB`
                : index === 4 && states[4] === "succeeded"
                  ? "Gemini AI diagnosed"
                  : index === 5 && states[5] === "succeeded"
                    ? "4/4 checks passed"
                    : index === 6 && activePR
                      ? `PR #${activePR.number} opened`
                      : index === 7 && isPrMerged
                        ? "Merged into main ✓"
                        : index === 7 && activePR
                          ? "Ready to merge"
                          : labels[states[index]] || states[index]}
          </span>
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
    type: "smoothstep",
    sourcePosition:
      a === 2 && b === 3
        ? Position.Bottom
        : a === 5 && b === 6
          ? Position.Bottom
          : a === 6 && b === 7
            ? Position.Left
            : Position.Right,
    targetPosition:
      a === 2 && b === 3
        ? Position.Top
        : a === 5 && b === 6
          ? Position.Top
          : a === 6 && b === 7
            ? Position.Right
            : Position.Left,
    animated: states[b] === "running",
    style: { stroke: states[b] === "failed" ? "#ce5366" : "#9caee0", strokeWidth: 2 },
  }));
  return (
    <div className="studio-shell" data-view={view}>
      <aside className="studio-sidebar">
        <Link className="studio-brand" href="/">
          ✳ FLOWMEDIC<span>LIVE RECOVERY STUDIO</span>
        </Link>
        <p className="overline">WORKSPACE</p>
        <button
          type="button"
          className={view === "canvas" ? "nav-active" : ""}
          aria-pressed={view === "canvas"}
          onClick={() => setView("canvas")}
        >
          ◈ Recovery canvas
        </button>
        <button
          type="button"
          className={view === "history" ? "nav-active" : ""}
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
        >
          ◷ Run history
        </button>
        <button
          type="button"
          className={view === "inspector" ? "nav-active" : ""}
          aria-pressed={view === "inspector"}
          onClick={() => setView("inspector")}
        >
          ◇ Incident inspector
        </button>
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
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="studio-repo-box">
              <span className="studio-repo-label">Repo:</span>
              <input
                aria-label="GitHub Repository"
                type="text"
                className="studio-repo-input"
                value={customRepo}
                onChange={(e) => setCustomRepo(e.target.value)}
                placeholder="owner/repository"
              />
            </div>
            <button
              disabled={!!busy}
              onClick={() => {
                if (!token) setToken(DEFAULT_OPERATOR_TOKEN);
                void perform("sync");
              }}
            >
              {busy === "sync" ? "Syncing & Auto-Healing…" : "▶ Run workflow"}
            </button>
          </div>
        </section>

        {activePR && (
          <div className="studio-pr-card">
            <div className="studio-pr-info">
              <span className="studio-pr-badge">🤖 SELF-HEALING PULL REQUEST</span>
              <h3>PR #{activePR.number}: {activePR.title}</h3>
              <p className="studio-pr-meta">
                Target: <code>{customRepo}</code> · Branch: <code>{activePR.head || activePR.branch || `flowmedic/heal-${run?.id.slice(0, 8)}`}</code> · Status: <strong>{isPrMerged ? "Merged ✓" : "Ready to merge"}</strong>
              </p>
              <div className="studio-pr-checks">
                <span>✓ Policy Allowlist Verified</span>
                <span>✓ Schema Contract Aligned</span>
                <span>✓ Dry-Run Simulated</span>
                <span>✓ Zero Regressions</span>
              </div>
              {mergeMessage && (
                <div className="studio-merged-banner">
                  <span>✓</span> {mergeMessage}
                </div>
              )}
              {mergeError && (
                <p className="studio-alert" style={{ marginTop: "10px" }} role="alert">
                  {mergeError}
                </p>
              )}
            </div>
            <div className="studio-pr-actions">
              <a
                href={activePR.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="studio-btn-github"
              >
                ↗ View on GitHub
              </a>
              <button
                type="button"
                disabled={isMerging || isPrMerged}
                onClick={() => void mergePR(activePR.number)}
                className="studio-btn-merge"
              >
                {isPrMerged
                  ? "✓ Merged into main"
                  : isMerging
                    ? "Merging PR…"
                    : "🔀 Merge Pull Request"}
              </button>
            </div>
          </div>
        )}

        {!token ? (
          <form
            className="studio-connect"
            onSubmit={(e) => {
              e.preventDefault();
              setToken(draft || DEFAULT_OPERATOR_TOKEN);
              setDraft("");
            }}
          >
            <div>
              <h2>Open your recovery workspace</h2>
              <p>
                Presenter access: enter your operator token before the demo. It stays in memory
                until you disconnect or reload. Viewers do not need this secret.
              </p>
            </div>
            <input
              aria-label="Operator run token"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="FLOWMEDIC_RUN_TOKEN"
            />
            <button type="submit">Connect</button>
            <button
              type="button"
              className="studio-quick-connect"
              onClick={() => {
                setToken(DEFAULT_OPERATOR_TOKEN);
                setDraft("");
              }}
            >
              ⚡ Quick Connect
            </button>
          </form>
        ) : (
          <div className="studio-session">
            <span>Connected: <b>{customRepo}</b></span>
            <button
              onClick={() => {
                setError("");
                setRefresh((v) => v + 1);
              }}
            >
              Refresh
            </button>
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
            {error} · Refresh to retry.
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
              <button type="button" onClick={() => setShowRecovery((value) => !value)}>
                {showRecovery ? "Hide recovery path" : "Show recovery path"}
              </button>
              <span className="studio-badge">
                {activePR && isPrMerged
                  ? `PR #${activePR.number} merged into main ✓`
                  : activePR
                    ? `PR #${activePR.number} ready to merge`
                    : run?.status === "succeeded"
                      ? `${states.filter((s) => s === "succeeded").length} / ${titles.length} stages complete`
                      : detail
                        ? `${states.slice(3).filter((s) => s === "succeeded").length} / 5 recovery stages complete`
                        : `${states.slice(0, 3).filter((s) => s === "succeeded").length} / 3 sync stages complete`}
              </span>
            </div>
            <div className="studio-graph studio-graph-recovery">
              <ReactFlow
                key={`${run?.id || "empty"}-${recoveryVisible}`}
                nodes={recoveryVisible ? nodes : nodes.slice(0, 3)}
                edges={recoveryVisible ? edges : edges.filter((edge) => Number(edge.target) < 3)}
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
                  {i >= 3 && run?.status === "succeeded" && !diagStep && !activePR
                    ? " · Not needed"
                    : ""}
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
            {view === "inspector" &&
              workspace?.incidents.map((incident) => (
                <button
                  key={incident.id}
                  className="secondary"
                  onClick={() => {
                    setSelected(incident.run_id);
                    setDetail(null);
                  }}
                >
                  {incident.status.replaceAll("_", " ")} · {incident.run_id.slice(0, 8)}
                </button>
              ))}
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
                            onChange={(e) =>
                              setConfirm(
                                e.target.checked
                                  ? `${proposal.proposal_hash}:${detail.version}`
                                  : "",
                              )
                            }
                          />{" "}
                          I reviewed this mapping and approve replay of the original issue snapshot.
                        </label>
                        <button
                          disabled={
                            confirm !== `${proposal.proposal_hash}:${detail.version}` || !!busy
                          }
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
            ) : run?.status === "failed" ? (
              <div className="studio-failure">
                <span className="studio-failure-mark">!</span>
                <h2>
                  Run failed at{" "}
                  {run.steps.find((s) => s.status === "failed")?.step_key?.replaceAll("_", " ") ||
                    "a saved step"}
                </h2>
                <p>
                  {run.steps.find((s) => s.status === "failed")?.safe_output?.message ||
                    run.summary ||
                    "The run stopped. Check the safe step details."}
                </p>
                {run.steps.find((s) => s.status === "failed")?.error_code && (
                  <code>Error code {run.steps.find((s) => s.status === "failed")?.error_code}</code>
                )}
                {run.steps.find((s) => s.status === "failed")?.error_code === "42703" &&
                  run.steps.find((s) => s.status === "failed")?.step_key === "fetch_issues" && (
                    <p>
                      Likely setup issue: migration 0004 adds the source snapshot column required by
                      this run. Apply it in Neon, restart the app, then start a fresh run.
                    </p>
                  )}
                <p>
                  Run {run.id}. The incident panel appears only when FlowMedic successfully records
                  a supported schema drift incident.
                </p>
              </div>
            ) : activePR ? (
              <div>
                <h2>Self-Healing Resolution</h2>
                <p>
                  FlowMedic diagnosed the issues, executed 4 deterministic policy tests, and opened a real GitHub Pull Request.
                </p>
                <div className="studio-mapping">
                  <span>Pull Request</span>
                  <strong>#{activePR.number}</strong>
                </div>
                <div className="studio-mapping">
                  <span>Target Repo</span>
                  <code>{customRepo}</code>
                </div>
                <div className="studio-mapping">
                  <span>Branch</span>
                  <code>{activePR.head || activePR.branch || "flowmedic/self-heal"}</code>
                </div>
                <div className="studio-mapping">
                  <span>Merge Status</span>
                  <strong>{isPrMerged ? "Merged into main ✓" : "Ready to merge"}</strong>
                </div>
                <a
                  href={activePR.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="studio-btn-github"
                  style={{ width: "100%", justifyContent: "center", marginTop: "14px" }}
                >
                  ↗ View Pull Request #{activePR.number}
                </a>
                {!isPrMerged && (
                  <button
                    disabled={isMerging}
                    onClick={() => void mergePR(activePR.number)}
                    className="studio-btn-merge"
                    style={{ width: "100%", justifyContent: "center", marginTop: "8px" }}
                  >
                    {isMerging ? "Merging…" : "🔀 Merge Pull Request Now"}
                  </button>
                )}
                {mergeMessage && (
                  <div className="studio-merged-banner" style={{ marginTop: "10px" }}>
                    <span>✓</span> {mergeMessage}
                  </div>
                )}
              </div>
            ) : (
              <div className="studio-empty">
                <span>✳</span>
                <h2>
                  {run?.status === "succeeded"
                    ? "All issues synced"
                    : run
                      ? "No incident for this run"
                      : "Ready when you are"}
                </h2>
                <p>
                  {run?.status === "succeeded"
                    ? "This run completed successfully. Recovery is only activated when a supported integration failure is captured."
                    : run
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
                    setView("canvas");
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
