# Demo Repository Setup Steps

Follow these steps to create the separate GitHub repository FlowMedic will read. They are intended for the teammate creating the repository. The result should be a small, disposable source repo containing synthetic issues only.

## Step 1 — Create the repository

1. Sign in to the GitHub account or organization that the FlowMedic operator can access.
2. Choose **New repository**.
3. Set the name to `flowmedic-demo-source` (choose another name if it is unavailable).
4. Add the description: `Synthetic GitHub issue source for the FlowMedic Live hackathon demo.`
5. Choose **Public** for the simplest setup because the repository contains synthetic content only. If using **Private**, create it under an account/organization the FlowMedic operator owns or belongs to. A private repository owned by another personal account may run into GitHub fine-grained token collaborator limitations; see [GitHub’s token limitations](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations).
6. Enable Issues. A README can be initialized with the repository or added afterward.
7. Create the repository. Do not add secrets, credentials, or real customer data.

## Step 2 — Add a short repository README

Add a README that says this repository contains synthetic issues for the FlowMedic Live prototype. State that it is disposable demo data and should not contain credentials or real personal information.

## Step 3 — Create the six sample issues

Use the titles and bodies in [`../issues/`](../issues/). For each file:

1. Open **Issues → New issue** in the new repository.
2. Copy the heading after `Issue N —` into the issue title.
3. Copy the content under `## Body` into the issue body.
4. Apply the suggested labels if convenient; labels are optional.
5. Create the issue.

Issue 4 should be created and then closed so the source set includes both open and closed issues. Do not create a pull request for it.

## Step 4 — Confirm the operator can access it

For a private repository, add the FlowMedic operator's GitHub account with permission to view issues. For a public repository, send the repository address. In either case, send the owner and repository name in this format:

```text
owner/repository
```

Do not create or send the FlowMedic runtime token. The operator creates their own fine-grained GitHub token with **Issues: read** permission limited to this repository.

## Step 5 — Confirm completion

- [ ] Repository exists under the intended owner.
- [ ] Repository contains a README identifying it as synthetic FlowMedic demo data.
- [ ] Six issues were created from the supplied seed files.
- [ ] Issue 4 is closed; the other five remain open.
- [ ] FlowMedic operator can view the repository and its issues.
- [ ] Owner/repository name was sent to the operator.
- [ ] No token, database URL, or other secret was committed or sent.

## Security note

Use these manual steps. The optional `setup_github_repo_and_issues.py` helper is not safe to run in its current form: it uses hard-coded owner and local paths, puts a token in a Git push URL, and overwrites `.env.local` with blank and fixed secret values. Do not use it unless it has been reviewed and rewritten.
