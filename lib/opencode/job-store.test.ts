import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("OpenCode job store", () => {
  afterEach(async () => {
    const { closeDatabase } = await import("../../db/client");
    closeDatabase();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("creates jobs and paginates persisted events", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());

    const { upsertProject } = await import("../server/project-store");
    const { appendBuildEvent, createGenerationJob, listBuildEvents } = await import("./job-store");
    upsertProject({
      id: "project-1",
      name: "Foundry",
      slug: "foundry",
      oneLiner: "Idea to repo.",
      status: "active",
      stage: "Build Plan",
      scopeLevel: "MVP",
      updatedAt: new Date().toISOString(),
    });

    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    expect(job?.status).toBe("queued");

    appendBuildEvent({ jobId: job!.id, projectId: "project-1", type: "status", message: "one" });
    appendBuildEvent({ jobId: job!.id, projectId: "project-1", type: "final", message: "two" });

    expect(listBuildEvents(job!.id, 1)).toMatchObject([
      { sequence: 2, type: "final", message: "two" },
    ]);
  });
});

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-job-store-")), "foundry.sqlite")}`;
}
