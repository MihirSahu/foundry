import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("GitHub OAuth callback", () => {
  it("rejects mismatched OAuth state before exchanging a code", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:3000/api/auth/github/callback?state=actual&code=abc123",
      {
        headers: {
          cookie: "foundry_github_oauth_state=expected",
        },
      },
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/?github=state_mismatch");
    expect(response.headers.get("set-cookie")).toContain("foundry_github_oauth_state=");
  });

  it("exchanges a valid code, stores the encrypted token, and redirects connected", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_REDIRECT_URI", "http://localhost:3000/api/auth/github/callback");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "gho_callback_token", scope: "repo", token_type: "bearer" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 42, login: "octocat", name: "Octo Cat", email: "octo@example.com" }),
        }),
    );
    const { GET } = await import("./route");
    const { getGitHubConnection } = await import("@/lib/server/auth-store");
    const request = new NextRequest(
      "http://localhost:3000/api/auth/github/callback?state=expected&code=abc123",
      {
        headers: {
          cookie: "foundry_github_oauth_state=expected",
        },
      },
    );

    const response = await GET(request);
    const connection = getGitHubConnection();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/?github=connected");
    expect(connection?.providerUsername).toBe("octocat");
    expect(connection?.accessTokenEncrypted).not.toContain("gho_callback_token");
  });

  it("redirects denied OAuth callbacks without exchanging a token", async () => {
    vi.resetModules();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/auth/github/callback?error=access_denied"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/?github=denied");
    expect(fetch).not.toHaveBeenCalled();
  });
});

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-github-callback-")), "foundry.sqlite")}`;
}
