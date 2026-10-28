# FlowMedic Demo Repository Kit

This folder is a handoff kit for creating the **separate GitHub repository** that FlowMedic will read from. It contains instructions, sample issue content, and an optional setup helper. The helper is not safe to run in its current form; use the manual steps below instead.

> **Do not run `setup_github_repo_and_issues.py` yet.** It hardcodes an owner and local paths, sends the token in a Git push URL, and overwrites `.env.local` with a blank `DATABASE_URL` and fixed token values. It also needs write/admin access to create a repo and issues, which is different from FlowMedic's read-only runtime token. The script needs a safety rewrite before use.

## Request for the teammate

Please create a dedicated repository for the FlowMedic hackathon demo. Suggested name: `flowmedic-demo-source` (use another unique name if that is unavailable). Use a private repository if the operator account that will run FlowMedic can be granted access; a public repository is also fine if preferred. This repository is disposable demo data and must not contain real customer or personal information.

1. Create the repository under the GitHub account/organization the FlowMedic operator can access.
2. Add a short README describing it as a synthetic issue source for the FlowMedic Live demo.
3. Create the six synthetic GitHub issues in [`issues/`](issues/), preserving their titles and using the supplied bodies. Labels are optional.
4. Send the operator the repository owner and repository name (for example, `octo-demo/flowmedic-demo-source`). Do not send or create a token on the operator's behalf.
5. Confirm the operator's GitHub account can view the repository and its issues. The operator will create their own fine-grained token limited to this repo with **Issues: read** permission.

For the full click-by-click sequence, use [`setup-steps/README.md`](setup-steps/README.md).

## Acceptance checklist

- [ ] Dedicated demo repository exists and is accessible to the FlowMedic operator.
- [ ] README clearly says the issues are synthetic demo data.
- [ ] Six supplied issues are created; no secrets or real people's data are included.
- [ ] Owner and repository name have been sent to the operator.
- [ ] No access token, password, database URL, or other credential was added to this repository.

## Why these issues exist

The Phase 01 source-to-destination sync reads repository issues, filters out pull requests, and stores stable issue fields in Neon. The sample set is intentionally small but includes different states and body sizes. Phase 03/04 may use this disposable source to demonstrate a controlled failure and recovery. The schema-drift trigger occurs in the isolated Neon demo database, not in this GitHub repository.

## Related FlowMedic setup

After the repo is ready, the operator records its owner/name in `.env.local` as `GITHUB_OWNER` and `GITHUB_REPOSITORY`, then creates their own narrowly scoped `GITHUB_TOKEN`. Credentials must stay out of chat, these docs, GitHub issue bodies, and commits.
