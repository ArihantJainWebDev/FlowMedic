import "server-only";

export function getConfiguration() {
  const required = ["DATABASE_URL", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPOSITORY", "FLOWMEDIC_RUN_TOKEN"] as const;
  return {
    missing: required.filter((name) => !process.env[name]?.trim()),
    integrations: {
      database: Boolean(process.env.DATABASE_URL?.trim()),
      githubToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
      repository: Boolean(process.env.GITHUB_OWNER?.trim() && process.env.GITHUB_REPOSITORY?.trim()),
      runToken: Boolean(process.env.FLOWMEDIC_RUN_TOKEN?.trim()),
      llm: Boolean(process.env.LLM_API_KEY?.trim() && process.env.LLM_MODEL?.trim()),
    },
  };
}
