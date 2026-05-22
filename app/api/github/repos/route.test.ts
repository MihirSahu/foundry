import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("GitHub repo route", () => {
  it("rejects disconnected repo creation attempts", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/github/repos", {
        method: "POST",
        body: JSON.stringify({ name: "foundry", visibility: "private" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("not_connected");
  });

  it("creates a repository with the encrypted GitHub token", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", encryptionKey);
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());

    vi.doMock("@/lib/services/github", () => {
      class GitHubApiError extends Error {
        constructor(
          message: string,
          public readonly status: number,
          public readonly code: string,
        ) {
          super(message);
        }
      }

      return {
        GitHubApiError,
        createRepository: vi.fn(async (input: { token: string; name: string }) => {
          expect(input.token).toBe("gho_route_test");
          expect(input.name).toBe("foundry");

          return {
            id: 456,
            owner: "mihir",
            name: "foundry",
            url: "https://github.com/mihir/foundry",
            defaultBranch: "main",
          };
        }),
      };
    });

    const { encryptSecret } = await import("@/lib/server/crypto");
    const { upsertGitHubConnection } = await import("@/lib/server/auth-store");
    upsertGitHubConnection({
      accessTokenEncrypted: encryptSecret("gho_route_test"),
      scope: "repo",
      providerAccountId: "123",
      providerUsername: "mihir",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/github/repos", {
        method: "POST",
        body: JSON.stringify({ name: "foundry", visibility: "private", includeStarterFiles: true }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.repository.url).toBe("https://github.com/mihir/foundry");
  });
});

const encryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-test-")), "foundry.sqlite")}`;
}
