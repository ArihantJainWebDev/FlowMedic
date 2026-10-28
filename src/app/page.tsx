import { connection } from "next/server";
import { getConfiguration } from "@/lib/configuration";

const mainNavigation = [
  { icon: "⌂", label: "Overview", active: true },
  { icon: "◷", label: "Run history" },
  { icon: "◇", label: "Incidents" },
  { icon: "↻", label: "Repair memory" },
];

const recoverySteps = [
  { number: "04", title: "Capture incident", detail: "Save real failure evidence" },
  { number: "05", title: "AI diagnosis", detail: "Structured repair proposal" },
  { number: "06", title: "Validate mapping", detail: "Allowlist and dry run" },
  { number: "07", title: "Approve and replay", detail: "Human approval required" },
];

const executionSteps = [
  "Fetch issues",
  "Normalize",
  "Write to Postgres",
  "Capture incident",
  "Diagnose",
  "Validate",
  "Approve",
  "Replay and verify",
];

function Brand() {
  return (
    <div className="brand" aria-label="FlowMedic Live">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      <span className="brand-copy">
        <span className="brand-name">FLOWMEDIC</span>
        <span className="brand-sub">LIVE · RECOVERY STUDIO</span>
      </span>
    </div>
  );
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? "mobile-nav" : "nav-list"} aria-label="Main navigation">
      {mainNavigation.map((item) => {
        const className = `${mobile ? "" : "nav-link "}${item.active ? "active" : ""}`;
        const content = (
          <>
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className={mobile ? "" : "nav-copy"}>{item.label}</span>
          </>
        );

        return item.active ? (
          <a className={className} href="#overview" key={item.label} aria-current="page">
            {content}
          </a>
        ) : (
          <span className={`${className} nav-disabled`} key={item.label} aria-disabled="true">
            {content}
          </span>
        );
      })}
    </nav>
  );
}

export default async function Home() {
  await connection();
  const { integrations, missing } = getConfiguration();
  const githubConfigured = integrations.githubToken && integrations.repository;
  return (
    <div className="app-frame" id="overview">
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">Workspace</div>
        <Navigation />
        <div className="nav-label" style={{ marginTop: 17 }}>
          Manage
        </div>
        <div className="nav-list">
          <a className="nav-link" href="#connections">
            <span className="nav-icon" aria-hidden="true">
              ⌘
            </span>
            <span className="nav-copy">Connections</span>
          </a>
        </div>
        <div className="sidebar-spacer" />
        <div className="workspace-chip">
          <span className="avatar" aria-hidden="true">
            FM
          </span>
          <div>
            <strong>Demo workspace</strong>
            <small>Single-operator setup</small>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            FlowMedic <span aria-hidden="true">/</span> <strong>Recovery Studio</strong>
          </div>
          <div className="topbar-right">
            <span className="connection-state">
              <i className="connection-dot" /> {githubConfigured ? "GitHub configured · sync to verify" : "GitHub setup needed"}
            </span>
            <ManualSyncControl />
          </div>
        </header>

        <main className="page-content">
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              <div className="overline">YOUR AUTOMATION RECOVERY CENTER</div>
              <h1 id="page-title">Recovery Studio</h1>
              <p className="heading-copy">
                See every real step as it happens. When an integration breaks, FlowMedic traces the
                failure, validates a safe repair, and waits for your approval before replay.
              </p>
            </div>
            <a className="setup-button" href="#connections">
              <span aria-hidden="true">＋</span> Review service setup
            </a>
          </section>

          <div className="workspace-grid">
            <section className="canvas-panel" aria-labelledby="workflow-title">
              <header className="panel-heading">
                <div>
                  <h2 id="workflow-title">Workflow canvas</h2>
                  <p>Your real workflow and recovery path will appear here.</p>
                </div>
                <span className="state-pill">
                  <i /> {missing.length ? "Setup required" : "Ready for manual sync"}
                </span>
              </header>

              <div className="canvas">
                <div
                  className="flow-row"
                  aria-label="Source-to-destination path; configuration does not verify connectivity"
                >
                  <article className="flow-node">
                    <div className="node-top">
                      <span className="node-icon">GH</span>
                      <div>
                        <div className="node-name">GitHub Issues</div>
                        <div className="node-type">Issue source</div>
                      </div>
                    </div>
                    <div className="node-status">
                      <b>{githubConfigured ? "Configured · not verified" : "Setup needed"}</b>
                      <span>01</span>
                    </div>
                  </article>
                  <span className="connector" aria-hidden="true" />
                  <article className="flow-node">
                    <div className="node-top">
                      <span className="node-icon teal">↗</span>
                      <div>
                        <div className="node-name">Normalize</div>
                        <div className="node-type">Safe field mapping</div>
                      </div>
                    </div>
                    <div className="node-status">
                      <b>Ready for sync</b>
                      <span>02</span>
                    </div>
                  </article>
                  <span className="connector" aria-hidden="true" />
                  <article className="flow-node">
                    <div className="node-top">
                      <span className="node-icon gray">DB</span>
                      <div>
                        <div className="node-name">Neon Postgres</div>
                        <div className="node-type">Managed destination</div>
                      </div>
                    </div>
                    <div className="node-status">
                      <b>{integrations.database ? "Configured · not verified" : "Setup needed"}</b>
                      <span>03</span>
                    </div>
                  </article>
                </div>

                <div>
                  <div className="recovery-heading">
                    Recovery path · approval stays in your hands
                  </div>
                  <div className="recovery-row" style={{ marginTop: 10 }}>
                    {recoverySteps.map((step) => (
                      <article className="recovery-step" key={step.number}>
                        <span className="step-number">STEP {step.number}</span>
                        <strong>{step.title}</strong>
                        <small>{step.detail}</small>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <section className="rail-panel" aria-labelledby="execution-title">
                <div className="rail-head">
                  <strong id="execution-title">Live execution rail</strong>
                  <span>Start a manual sync to see its result</span>
                </div>
                <div
                  className="progress-steps"
                  role="list"
                  aria-label="Eight workflow stages will show live status after the first run"
                >
                  {executionSteps.map((step) => (
                    <span
                      className="progress-step"
                      role="listitem"
                      aria-label={`${step}: waiting for first run`}
                      key={step}
                    />
                  ))}
                </div>
                <div className="rail-note">
                  <span aria-hidden="true">◷</span> Each checkpoint will update from saved run
                  events and show its real outcome.
                </div>
              </section>
            </section>

            <aside className="inspector-panel" aria-label="Workflow inspector">
              <header className="inspector-head">
                <h2>Run inspector</h2>
                <span className="inspector-icon" aria-hidden="true">
                  ⌕
                </span>
              </header>
              <div className="empty-state">
                <div className="empty-orbit" aria-hidden="true">
                  ✳
                </div>
                <h3>Nothing running yet</h3>
                <p>
                  Connect GitHub to see live step progress, failure evidence, and recovery details
                  here.
                </p>
              </div>
              <section className="inspector-section" id="connections">
                <h3>Connection setup</h3>
                <div className="connection-row">
                  <span>GitHub Issues</span>
                  <span>{githubConfigured ? "Configured" : "Setup needed"}</span>
                </div>
                <div className="connection-row">
                  <span>Neon Postgres</span>
                  <span>{integrations.database ? "Configured" : "Setup needed"}</span>
                </div>
                <div className="connection-row">
                  <span>AI diagnosis</span>
                  <span>{integrations.llm ? "Configured" : "Setup needed"}</span>
                </div>
              </section>
              <div className="lock-note">
                <span aria-hidden="true">◇</span>
                <span>
                  Secrets stay on the server. This screen never displays credential values.
                </span>
              </div>
            </aside>
          </div>

          <footer className="page-foot">
            <span>FlowMedic Live · Foundation setup</span>
            <span>Live statuses appear after a real run begins.</span>
          </footer>
        </main>
      </div>
      <Navigation mobile />
    </div>
  );
}
import { ManualSyncControl } from "@/components/manual-sync-control";

