import "server-only";

export type GitHubTokenResponse = {
  accessToken: string;
  scope: string;
  tokenType: string;
};

export type GitHubViewer = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
};

export class GitHubOAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_config"
      | "token_exchange_failed"
      | "viewer_fetch_failed"
      | "oauth_denied",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "GitHubOAuthError";
  }
}

export function getGitHubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new GitHubOAuthError(
      "GitHub OAuth is not configured.",
      "missing_config",
      500,
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function isGitHubOAuthConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET &&
      process.env.GITHUB_REDIRECT_URI,
  );
}

export function buildGitHubAuthorizeUrl(state: string) {
  const config = getGitHubOAuthConfig();
  const url = new URL("https://github.com/login/oauth/authorize");

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "repo");
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeGitHubCode(code: string): Promise<GitHubTokenResponse> {
  const config = getGitHubOAuthConfig();

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new GitHubOAuthError(
      "GitHub token exchange failed.",
      "token_exchange_failed",
      502,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
  };

  if (payload.error || !payload.access_token) {
    throw new GitHubOAuthError(
      "GitHub token exchange failed.",
      "token_exchange_failed",
      502,
    );
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope ?? "",
    tokenType: payload.token_type ?? "bearer",
  };
}

export async function fetchGitHubViewer(token: string): Promise<GitHubViewer> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new GitHubOAuthError(
      "Unable to validate GitHub connection.",
      "viewer_fetch_failed",
      502,
    );
  }

  const payload = (await response.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
  };

  return {
    id: payload.id,
    login: payload.login,
    name: payload.name ?? null,
    email: payload.email ?? null,
  };
}
