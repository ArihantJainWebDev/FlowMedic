export type NormalizedIssue = {
  externalId: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  htmlUrl: string;
  updatedAt: string;
};

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
};

export class GitHubRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GitHubRequestError";
  }
}

const pageSize = 50;
const maxPages = 2;
const maxBodyLength = 4000;

function getGitHubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FlowMedic-Live",
  };
}

export async function fetchRepositoryIssues(owner: string, repository: string, token: string) {
  const issues: NormalizedIssue[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const endpoint = new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
    );
    endpoint.searchParams.set("state", "all");
    endpoint.searchParams.set("per_page", String(pageSize));
    endpoint.searchParams.set("page", String(page));

    const response = await fetch(endpoint, {
      headers: getGitHubHeaders(token),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const rateLimitReset = Number(response.headers.get("x-ratelimit-reset"));
      const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : Number.isFinite(rateLimitReset) && rateLimitReset > 0
          ? Math.max(1, rateLimitReset - Math.floor(Date.now() / 1000))
          : undefined;
      const rateLimited = response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0";
      const message = rateLimited
        ? `GitHub rate limit reached.${waitSeconds ? ` Retry in about ${waitSeconds} seconds.` : " Retry later."}`
        : response.status === 401 || response.status === 403
        ? "GitHub denied access. Check the token and its repository Issues read permission."
        : response.status === 404
          ? "The configured GitHub repository was not found or is not accessible to this token."
          : `GitHub request failed with status ${response.status}.`;
      throw new GitHubRequestError(message, response.status, waitSeconds);
    }

    const payload = (await response.json()) as GitHubIssue[];
    for (const issue of payload) {
      if (issue.pull_request || !Number.isSafeInteger(issue.id) || !Number.isSafeInteger(issue.number)) {
        continue;
      }

      issues.push({
        externalId: String(issue.id),
        number: issue.number,
        title: issue.title.slice(0, 500),
        body: (issue.body ?? "").slice(0, maxBodyLength),
        state: issue.state === "closed" ? "closed" : "open",
        htmlUrl: issue.html_url,
        updatedAt: issue.updated_at,
      });
    }

    if (payload.length < pageSize) break;
  }

  return issues;
}

export async function getDefaultBranchDetails(owner: string, repository: string, token: string) {
  const repoRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    {
      headers: getGitHubHeaders(token),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (!repoRes.ok) {
    throw new GitHubRequestError(`Failed to load repository ${owner}/${repository}`, repoRes.status);
  }
  const repoData = (await repoRes.json()) as { default_branch?: string };
  const defaultBranch = repoData.default_branch || "main";

  const refRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
    {
      headers: getGitHubHeaders(token),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (!refRes.ok) {
    throw new GitHubRequestError(`Failed to load default branch ref for ${defaultBranch}`, refRes.status);
  }
  const refData = (await refRes.json()) as { object: { sha: string } };
  return { defaultBranch, baseSha: refData.object.sha };
}

export async function createBranch(
  owner: string,
  repository: string,
  token: string,
  branchName: string,
  baseSha: string,
) {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/refs`,
    {
      method: "POST",
      headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );

  if (response.status === 422) {
    // Branch may already exist
    return { created: false, branchName };
  }
  if (!response.ok) {
    const errorBody = await response.text();
    throw new GitHubRequestError(`Failed to create branch ${branchName}: ${errorBody}`, response.status);
  }
  return { created: true, branchName };
}

export async function createOrUpdateFile(
  owner: string,
  repository: string,
  token: string,
  path: string,
  content: string,
  message: string,
  branch: string,
) {
  // Check if file exists to get current sha for update
  let sha: string | undefined;
  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      {
        headers: getGitHubHeaders(token),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (checkRes.ok) {
      const existing = (await checkRes.json()) as { sha?: string };
      sha = existing.sha;
    }
  } catch {
    // File doesn't exist yet
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodeURIComponent(path)}`,
    {
      method: "PUT",
      headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
        ...(sha ? { sha } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new GitHubRequestError(`Failed to commit file ${path}: ${errorBody}`, response.status);
  }
  return (await response.json()) as { content?: { path?: string; sha?: string } };
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
  title: string;
  state: string;
  head: string;
  base: string;
}

export async function createPullRequest(
  owner: string,
  repository: string,
  token: string,
  input: {
    title: string;
    body: string;
    head: string;
    base?: string;
  },
): Promise<PullRequestResult> {
  const base = input.base || "main";
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls`,
    {
      method: "POST",
      headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    // If PR already exists for branch, find it
    if (response.status === 422) {
      const listRes = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(input.head)}&state=open`,
        {
          headers: getGitHubHeaders(token),
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        },
      );
      if (listRes.ok) {
        const list = (await listRes.json()) as Array<{
          number: number;
          html_url: string;
          title: string;
          state: string;
        }>;
        if (list.length > 0) {
          return {
            number: list[0].number,
            htmlUrl: list[0].html_url,
            title: list[0].title,
            state: list[0].state,
            head: input.head,
            base,
          };
        }
      }
    }
    const errorBody = await response.text();
    throw new GitHubRequestError(`Failed to create pull request: ${errorBody}`, response.status);
  }

  const data = (await response.json()) as {
    number: number;
    html_url: string;
    title: string;
    state: string;
  };
  return {
    number: data.number,
    htmlUrl: data.html_url,
    title: data.title,
    state: data.state,
    head: input.head,
    base,
  };
}

export async function mergePullRequest(
  owner: string,
  repository: string,
  token: string,
  pullNumber: number,
  commitTitle?: string,
) {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        commit_title: commitTitle || `Merge pull request #${pullNumber} (FlowMedic self-healing)`,
        merge_method: "squash",
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new GitHubRequestError(`Failed to merge pull request #${pullNumber}: ${errorBody}`, response.status);
  }

  return (await response.json()) as {
    sha: string;
    merged: boolean;
    message: string;
  };
}
