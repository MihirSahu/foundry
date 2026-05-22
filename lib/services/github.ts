import "server-only";

export type CreateRepositoryInput = {
  token: string;
  name: string;
  description: string;
  visibility: "private" | "public";
  files: Array<{
    path: string;
    content: string;
  }>;
  issues?: Array<{
    title: string;
    body: string;
  }>;
};

export type CreatedRepository = {
  id: number;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};

const githubApi = "https://api.github.com";

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code:
      | "insufficient_scope"
      | "rate_limited"
      | "repo_exists"
      | "validation_failed"
      | "upstream_failure",
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export async function createRepository(input: CreateRepositoryInput): Promise<CreatedRepository> {
  const repoResponse = await githubFetch(input.token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      private: input.visibility === "private",
      auto_init: true,
    }),
  });

  const repo = await repoResponse.json();
  const owner = repo.owner.login as string;
  const name = repo.name as string;
  const defaultBranch = (repo.default_branch as string | undefined) ?? "main";

  for (const file of input.files) {
    const existingSha = await getExistingFileSha(input.token, owner, name, file.path, defaultBranch);

    await githubFetch(input.token, `/repos/${owner}/${name}/contents/${encodePath(file.path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `${existingSha ? "Update" : "Add"} ${file.path}`,
        content: Buffer.from(file.content).toString("base64"),
        branch: defaultBranch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
  }

  for (const issue of input.issues ?? []) {
    await githubFetch(input.token, `/repos/${owner}/${name}/issues`, {
      method: "POST",
      body: JSON.stringify(issue),
    });
  }

  return {
    id: repo.id as number,
    owner,
    name,
    url: repo.html_url as string,
    defaultBranch,
  };
}

async function getExistingFileSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
) {
  const response = await fetch(
    `${githubApi}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw await toGitHubApiError(response);
  }

  const payload = (await response.json()) as { sha?: string };
  return payload.sha;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubFetch(token: string, path: string, init: RequestInit) {
  const response = await fetch(`${githubApi}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await toGitHubApiError(response);
  }

  return response;
}

async function toGitHubApiError(response: Response) {
  const payload = await readErrorPayload(response);
  const message = typeof payload?.message === "string" ? payload.message : "";
  const normalized = message.toLowerCase();

  if (response.status === 401 || response.status === 403) {
    if (
      response.headers.get("x-ratelimit-remaining") === "0" ||
      normalized.includes("rate limit")
    ) {
      return new GitHubApiError("GitHub rate limit reached.", response.status, "rate_limited");
    }

    return new GitHubApiError(
      "GitHub token does not have the required repository permissions.",
      response.status,
      "insufficient_scope",
    );
  }

  if (response.status === 422) {
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const alreadyExists = errors.some((error) => {
      if (!error || typeof error !== "object") {
        return false;
      }

      const code = "code" in error ? String(error.code) : "";
      const field = "field" in error ? String(error.field) : "";

      return code === "already_exists" || field === "name";
    });

    return new GitHubApiError(
      alreadyExists ? "A repository with that name already exists." : "GitHub validation failed.",
      response.status,
      alreadyExists ? "repo_exists" : "validation_failed",
    );
  }

  return new GitHubApiError("GitHub request failed.", response.status, "upstream_failure");
}

async function readErrorPayload(response: Response) {
  try {
    return (await response.json()) as { message?: unknown; errors?: unknown };
  } catch {
    return undefined;
  }
}
