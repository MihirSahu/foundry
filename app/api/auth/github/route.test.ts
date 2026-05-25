import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("GitHub auth routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts OAuth by redirecting to GitHub with a state cookie", async () => {
    vi.resetModules();
    vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_REDIRECT_URI", "http://localhost:3000/api/auth/github/callback");
    const { GET } = await import("./start/route");

    const response = GET();
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("scope")).toBe("repo");
    expect(response.headers.get("set-cookie")).toContain("foundry_github_oauth_state=");
  });

  it("returns disconnected status when no GitHub token exists", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { GET } = await import("./status/route");

    const response = GET();
    const payload = await response.json();

    expect(payload).toEqual({ configured: false, connected: false });
  });

  it("returns connected status without exposing the token", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_REDIRECT_URI", "http://localhost:3000/api/auth/github/callback");
    const { upsertGitHubConnection } = await import("@/lib/server/auth-store");
    const { encryptSecret } = await import("@/lib/server/crypto");
    const { GET } = await import("./status/route");
    upsertGitHubConnection({
      accessTokenEncrypted: encryptSecret("gho_status_secret"),
      scope: "repo",
      providerAccountId: "42",
      providerUsername: "octocat",
    });

    const response = GET();
    const payload = await response.json();

    expect(payload.configured).toBe(true);
    expect(payload.connected).toBe(true);
    expect(payload.username).toBe("octocat");
    expect(JSON.stringify(payload)).not.toContain("gho_status_secret");
  });

  it("logs out by deleting the stored connection", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { upsertGitHubConnection, getGitHubConnection } = await import("@/lib/server/auth-store");
    const { encryptSecret } = await import("@/lib/server/crypto");
    const { POST } = await import("./logout/route");
    upsertGitHubConnection({
      accessTokenEncrypted: encryptSecret("gho_logout_secret"),
      scope: "repo",
      providerAccountId: "42",
      providerUsername: "octocat",
    });

    const response = POST();
    const payload = await response.json();

    expect(payload).toEqual({ connected: false });
    expect(getGitHubConnection()).toBeUndefined();
  });
});

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-github-auth-")), "foundry.sqlite")}`;
}
