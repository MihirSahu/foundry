import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("project routes", () => {
  it("lists seeded projects", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { GET } = await import("./route");

    const response = GET();
    const payload = await response.json();

    expect(payload.projects.length).toBeGreaterThan(0);
    expect(payload.projects[0].id).toBeTruthy();
  });

  it("creates a project from a valid idea", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({ idea: "A tiny bug tracker for solo founders", scopeLevel: "Prototype" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.project.name).toBe("A Tiny Bug");
    expect(payload.project.scopeLevel).toBe("Prototype");
  });

  it("rejects invalid project creation input", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({ idea: "" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("validation_failed");
  });

  it("returns one project or a not-found response", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { GET } = await import("./[projectId]/route");

    const found = await GET(new NextRequest("http://localhost:3000/api/projects/foundry"), {
      params: Promise.resolve({ projectId: "foundry" }),
    });
    const missing = await GET(new NextRequest("http://localhost:3000/api/projects/missing"), {
      params: Promise.resolve({ projectId: "missing" }),
    });

    expect((await found.json()).project.id).toBe("foundry");
    expect(missing.status).toBe(404);
  });

  it("lists and creates project messages", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const messagesRoute = await import("./[projectId]/messages/route");

    const created = await messagesRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "Keep it small." }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const listed = await messagesRoute.GET(
      new NextRequest("http://localhost:3000/api/projects/foundry/messages"),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );

    expect(created.status).toBe(201);
    expect((await listed.json()).messages.some((message: { content: string }) => message.content === "Keep it small.")).toBe(true);
  });

  it("rejects invalid project messages", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { POST } = await import("./[projectId]/messages/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "" }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns not found before writing messages for missing projects", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { POST } = await import("./[projectId]/messages/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/projects/missing/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "Hello" }),
      }),
      { params: Promise.resolve({ projectId: "missing" }) },
    );

    expect(response.status).toBe(404);
  });

  it("lists project artifacts", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { GET } = await import("./[projectId]/artifacts/route");

    const response = await GET(new NextRequest("http://localhost:3000/api/projects/foundry/artifacts"), {
      params: Promise.resolve({ projectId: "foundry" }),
    });
    const payload = await response.json();

    expect(payload.artifacts.some((artifact: { title: string }) => artifact.title === "PRD.md")).toBe(true);
  });
});

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-project-routes-")), "foundry.sqlite")}`;
}
