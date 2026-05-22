import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../domain";

vi.mock("server-only", () => ({}));

describe("project store", () => {
  afterEach(async () => {
    const { closeDatabase } = await import("../../db/client");
    closeDatabase();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("preserves an existing repository URL when an upsert omits repoUrl", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { getProject, upsertProject } = await import("./project-store");

    upsertProject(project({ repoUrl: "https://github.com/example/foundry" }));
    upsertProject(project({ repoUrl: undefined, oneLiner: "Updated idea." }));

    expect(getProject("project-1")?.repoUrl).toBe("https://github.com/example/foundry");
    expect(getProject("project-1")?.oneLiner).toBe("Updated idea.");
  });
});

function project(overrides: Partial<Project>) {
  return {
    ...baseProject(),
    ...overrides,
  };
}

function baseProject() {
  return {
    id: "project-1",
    name: "Foundry",
    slug: "foundry",
    oneLiner: "Idea to repo.",
    status: "active" as const,
    stage: "Build Plan" as const,
    scopeLevel: "MVP" as const,
    updatedAt: new Date().toISOString(),
  };
}

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-project-store-")), "foundry.sqlite")}`;
}
