# FlowMedic Live — Demo Runbook & Judge Presentation Script

**Track:** Problem Statement 04 — The Self-Healing AI Automation System  
**Event:** Code-e-Fiesta 2026 (slowbroslabs)  
**Core Goal:** Reduce manual engineering intervention when APIs, data formats, or workflow integrations fail.

---

## 1. The 3-Minute Judge Presentation Script

Use this exact timing and narration during your presentation to stand out:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  0:00 - 0:30   The Enterprise Problem & Our Safety Philosophy               │
│  0:30 - 1:15   Healthy Execution: GitHub to Managed Postgres                │
│  1:15 - 1:55   The Real Integration Break: Schema Drift (SQLSTATE 42703)     │
│  1:55 - 2:35   AI Diagnosis + Deterministic Policy Validation                │
│  2:35 - 3:15   Cryptographic Human Approval & Idempotent Replay              │
│  3:15 - 3:30   Summary & Core Impact                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### [0:00 - 0:30] — The Hook
> *"Judges, integration failures are inevitable. When a third-party API changes or a database column is renamed, pipelines silently crash, requiring emergency manual engineering intervention.
> 
> Most AI approaches try to fix this naively by giving an LLM autonomous root permissions to run arbitrary SQL or edit production code. That is a security nightmare.
> 
> FlowMedic Live takes an enterprise-grade approach: **AI proposes, deterministic policy validates, humans approve, and the engine replays idempotently**."*

### [0:30 - 1:15] — Healthy Pipeline Execution
1. Open the **Recovery Studio** dashboard at `http://localhost:3000` (or deployed Vercel URL).
2. Enter your `FLOWMEDIC_RUN_TOKEN` and click **Connect**.
3. Point to the node canvas:
   > *"FlowMedic monitors live workflow runs. Let’s trigger a manual sync."*
4. Click **Run workflow**:
   > *"Watch the canvas: It fetches live issues from our real GitHub repository, normalizes the payload, and upserts them into Neon managed Postgres with zero duplicates."*
5. Show the step rail turn **green**: 6 issues fetched, 6 stored.

### [1:15 - 1:55] — The Break: Real Schema Drift
1. Switch to Neon SQL Console (or run `db/demo/controlled_schema_drift.sql`):
   ```sql
   ALTER TABLE github_issues RENAME COLUMN issue_title TO title;
   ```
2. Return to Recovery Studio and click **Run workflow**.
3. Point to the node turning **red**:
   > *"Look at that: The write step fails with genuine PostgreSQL `SQLSTATE 42703` (Undefined Column). FlowMedic intercepts the failure, freezes the run, and creates an immutable incident with the exact error fingerprint."*

### [1:55 - 2:35] — AI Diagnosis & Deterministic Validation
1. Click the failed node or select the incident in the **Incident Inspector**.
2. Click **Diagnose with AI**:
   > *"FlowMedic passes the redacted error and destination schema to our LLM. The AI pinpoints the exact cause and proposes mapping `issue_title` → `title`.*
   > 
   > *Crucially, our deterministic policy validator immediately checks that `title` is a real, compatible column in Postgres and ensures no arbitrary SQL or injection is accepted."*

### [2:35 - 3:15] — Human Approval & Idempotent Replay
1. Point to the proposal hash and approval confirmation checkbox:
   > *"No self-healing system should execute mutations without governance. An operator reviews the SHA-256 proposal hash, checks the confirmation box, and clicks **Approve**.*
   > 
   > *Now we click **Replay**. FlowMedic replays the original run using the approved mapping, verifies the destination row count in Postgres, and marks the incident **Recovered**!"*
2. Point to the node canvas turning **green** and the audit event trail.

### [3:15 - 3:30] — Closing
> *"We reduced engineering intervention from hours of debugging to a single-click validated approval, with zero security risk. That is FlowMedic Live."*

---

## 2. Operator Step-by-Step Rehearsal Guide

Follow these steps before presenting to guarantee flawless execution:

### Step 1: Pre-Flight Check
Run the automated verification script:
```bash
node scripts/verify_phase_06.mjs
```
Expected output: `=== Audit Complete: 19 passed, 0 failed ===`

### Step 2: Ensure Clean Pristine State
Reset the database schema so `issue_title` is the active column:
```bash
node scripts/reset_demo.mjs
```

### Step 3: Run the Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in Google Chrome or your browser.

### Step 4: Rehearse the Story
1. Connect with your `FLOWMEDIC_RUN_TOKEN`.
2. Trigger sync: Observe success (6/6).
3. In Neon console, run:
   ```sql
   ALTER TABLE github_issues RENAME COLUMN issue_title TO title;
   ```
4. Trigger sync: Observe failure (`SQLSTATE 42703`).
5. Select incident → click **Diagnose**.
6. Check confirm → click **Approve**.
7. Click **Replay** → Observe recovered count and verified audit trail.
8. Run `node scripts/reset_demo.mjs` to prepare for the real judge demo.

---

## 3. Contingency & Troubleshooting Matrix

| Potential Issue | Immediate Fallback / Contingency |
| :--- | :--- |
| **GitHub API Rate Limit** | Bounded fetch is capped at 100 items and uses cached headers. Pre-seed issues using `demo-repo-kit/setup_github_repo_and_issues.py`. |
| **LLM Provider Outage / Slow API** | FlowMedic includes an automatic, explicitly labeled **deterministic contingency proposal** (`[Contingency Demo Fallback]`). It passes the exact same validator and approval gate without stalling the presentation. |
| **Database Connection Latency** | Neon connection pooling is configured with `sslmode=require` and functions have `maxDuration = 30` to absorb cold starts. |
| **Resetting Quickly Between Judges** | Run `node scripts/reset_demo.mjs` in your terminal to instantly restore the schema in <1 second. |

---

## 4. Problem Statement 04 Compliance Matrix

| Hackathon Requirement | FlowMedic Implementation | Verified |
| :--- | :--- | :---: |
| *Monitors automated workflows* | Step-by-step durable execution runner with step duration and state persistence. | `✓` |
| *Detects failures* | Real SQL error interception (`SQLSTATE 42703` undefined column) and incident generation. | `✓` |
| *Diagnoses root causes* | Structured LLM prompt generating typed `{ diagnosis, rootCause, mappings, confidence }`. | `✓` |
| *Classifies issues (schema mismatches, bad payloads)* | Fingerprinting classifying `schema_drift` vs network vs bad payloads. | `✓` |
| *Generates corrective actions and validates them* | Deterministic allowlist, target column existence check, and dry-run validation. | `✓` |
| *Retry workflow with human approval where appropriate* | Cryptographic SHA-256 approval binding, operator audit log, and idempotent replay. | `✓` |
| *Reduce manual engineering intervention* | Zero code deployment needed to repair schema mismatch; one-click verified recovery. | `✓` |

