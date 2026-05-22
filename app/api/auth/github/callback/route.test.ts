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
});
