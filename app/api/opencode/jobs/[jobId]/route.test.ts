import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("OpenCode job detail route", () => {
  it("returns a serialized job", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { upsertProject } = await import("@/lib/server/project-store");
    const { createGenerationJob } = await import("@/lib/opencode/job-store");
    const { GET } = await import("./route");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: false, shell: false, web: false, subagents: false },
      },
    });

    const response = await GET(new NextRequest(`http://localhost:3000/api/opencode/jobs/${job!.id}`), {
      params: Promise.resolve({ jobId: job!.id }),
    });
    const payload = await response.json();

    expect(payload.job.id).toBe(job!.id);
    expect(payload.job.input).toBeUndefined();
  });

  it("returns not found for a missing job", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("http://localhost:3000/api/opencode/jobs/missing"), {
      params: Promise.resolve({ jobId: "missing" }),
    });

    expect(response.status).toBe(404);
  });
});

function project() {
  return {
    id: "project-1",
    name: "Project One",
    slug: "project-one",
    oneLiner: "One thing",
    status: "draft" as const,
    stage: "Build Plan" as const,
    scopeLevel: "MVP" as const,
    updatedAt: new Date().toISOString(),
  };
}

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-opencode-detail-")), "foundry.sqlite")}`;
}
