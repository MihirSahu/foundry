import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("OpenCode job pause route", () => {
  it("cancels a running job and restores the session to spec review", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { createGenerationJob, getGenerationJob, listBuildEvents, markJobRunning } = await import("@/lib/opencode/job-store");
    const { upsertProject } = await import("@/lib/server/project-store");
    const { getProjectSessionState, upsertProjectSessionState } = await import("@/lib/server/session-store");
    const { POST } = await import("./route");

    upsertProject(project());
    upsertProjectSessionState({
      projectId: "project-1",
      stage: "building",
      readiness: "ready_for_spec",
      summary: summary(),
      missingFields: [],
      repoRequested: true,
      buildRequested: true,
      nextAction: { type: "view_build", label: "View build" },
    });
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: false, shell: false, web: false, subagents: false },
      },
    });
    markJobRunning(job!.id);

    const response = await POST(new NextRequest(`http://localhost:3000/api/opencode/jobs/${job!.id}/pause`), {
      params: Promise.resolve({ jobId: job!.id }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.job.status).toBe("canceled");
    expect(getGenerationJob(job!.id)?.status).toBe("canceled");
    expect(getProjectSessionState("project-1")?.stage).toBe("spec_ready");
    expect(listBuildEvents(job!.id)).toMatchObject([
      { type: "status", message: "Build paused by user." },
    ]);
  });

  it("returns not found for a missing job", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { POST } = await import("./route");

    const response = await POST(new NextRequest("http://localhost:3000/api/opencode/jobs/missing/pause"), {
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

function summary() {
  return {
    productName: "Project One",
    oneLiner: "One thing",
    problem: "Follow-up work is scattered.",
    targetUser: "Solo founders",
    smallestUsefulVersion: "A simple CRM flow.",
    goals: ["Track follow-ups"],
    nonGoals: [],
    scopeLevel: "MVP" as const,
    mvpFeatures: ["Contacts"],
    routes: ["/"],
    dataEntities: ["Contact"],
    integrations: ["GitHub"],
    risks: [],
    openQuestions: [],
    repoRequested: true,
    buildRequested: true,
  };
}

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-opencode-pause-")), "foundry.sqlite")}`;
}
