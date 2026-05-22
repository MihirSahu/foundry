import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("OpenCode build compatibility route", () => {
  it("rejects invalid requests", async () => {
    vi.resetModules();
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/opencode/build", {
        method: "POST",
        body: JSON.stringify({ projectId: "" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns not found for missing projects", async () => {
    vi.resetModules();
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/opencode/build", {
        method: "POST",
        body: JSON.stringify({ projectId: "missing" }),
      }),
    );

    expect(response.status).toBe(404);
  });
});
