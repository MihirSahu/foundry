import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectWorkspace, materializeProjectWorkspace } from "./workspace";
import type { Project } from "../domain";

describe("OpenCode workspace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("materializes starter files inside the configured workspace root", async () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-workspaces-"));
    vi.stubEnv("FOUNDRY_WORKSPACES_DIR", root);

    const workspace = await materializeProjectWorkspace(project({ slug: "foundry" }));

    expect(workspace).toBe(join(root, "foundry-foundry"));
    expect(existsSync(join(workspace, "README.md"))).toBe(true);
    expect(existsSync(join(workspace, "PRD.md"))).toBe(true);
    expect(existsSync(join(workspace, "AGENTS.md"))).toBe(true);
  });

  it("keeps projects with duplicate slugs in separate workspaces", () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-workspaces-"));
    vi.stubEnv("FOUNDRY_WORKSPACES_DIR", root);

    const firstWorkspace = getProjectWorkspace(project({ id: "project-1", slug: "foundry" }));
    const secondWorkspace = getProjectWorkspace(project({ id: "project-2", slug: "foundry" }));

    expect(firstWorkspace).toBe(join(root, "foundry-project-1"));
    expect(secondWorkspace).toBe(join(root, "foundry-project-2"));
  });

  it("rejects workspace traversal through project slug", () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-workspaces-"));
    vi.stubEnv("FOUNDRY_WORKSPACES_DIR", root);

    expect(() => getProjectWorkspace(project({ slug: "../escape" }))).toThrow(/escaped/);
  });
});

function project(overrides: Partial<Project>): Project {
  return {
    id: "foundry",
    name: "Foundry",
    slug: "foundry",
    oneLiner: "Idea to repo.",
    status: "active",
    stage: "Build Plan",
    scopeLevel: "MVP",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
