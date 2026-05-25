import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("chat-first project session routes", () => {
  it("saves chat turns and returns a deterministic generate_spec action", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    mockProductThinking();
    const { POST } = await import("./[projectId]/chat/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/chat", {
        method: "POST",
        body: JSON.stringify({ content: "Build this for solo founders and create a repo." }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sessionState.stage).toBe("ready_for_spec");
    expect(payload.nextAction.type).toBe("generate_spec");
    expect(payload.messages.some((message: { role: string }) => message.role === "assistant")).toBe(true);
  });

  it("generates and edits a spec only after the session is ready", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const specRoute = await import("./[projectId]/spec/route");

    const blocked = await specRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec", { method: "POST" }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    expect(blocked.status).toBe(409);

    await seedReadyState("foundry");

    const generated = await specRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec", { method: "POST" }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const generatedPayload = await generated.json();
    expect(generated.status).toBe(201);
    expect(generatedPayload.sessionState.nextAction.type).toBe("submit_spec");

    const edited = await specRoute.PATCH(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec", {
        method: "PATCH",
        body: JSON.stringify({ content: "# Edited PRD" }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const editedPayload = await edited.json();
    expect(edited.status).toBe(200);
    expect(editedPayload.artifact.version).toBe(generatedPayload.artifacts.prd.version + 1);
  });

  it("submits a spec and starts an OpenCode job through the runner boundary", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.doMock("@/lib/server/opencode-runner", () => ({
      OpenCodeRunnerError: class OpenCodeRunnerError extends Error {
        constructor(
          public readonly code: string,
          message: string,
          public readonly status: number,
        ) {
          super(message);
        }
      },
      startOpenCodeJob: vi.fn(async () => ({
        id: "job-1",
        projectId: "foundry",
        type: "opencode_build",
        status: "queued",
        output: null,
        error: null,
        provider: "opencode",
        model: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      })),
    }));
    const specRoute = await import("./[projectId]/spec/route");
    const submitRoute = await import("./[projectId]/spec/submit/route");

    await seedReadyState("foundry");
    await specRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec", { method: "POST" }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );

    const response = await submitRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec/submit", {
        method: "POST",
        body: JSON.stringify({ createRepo: true, runBuild: true }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job.id).toBe("job-1");
    expect(payload.sessionState.stage).toBe("building");
    expect(payload.sessionState.nextAction.type).toBe("view_build");
  });

  it("keeps a generated spec retryable when OpenCode is disabled", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/server/opencode-runner");
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_ENABLE_OPENCODE", "0");
    const specRoute = await import("./[projectId]/spec/route");
    const submitRoute = await import("./[projectId]/spec/submit/route");
    const { getProjectSessionState } = await import("@/lib/server/session-store");

    await seedReadyState("foundry");
    await specRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec", { method: "POST" }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );

    const response = await submitRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec/submit", {
        method: "POST",
        body: JSON.stringify({ createRepo: true, runBuild: true }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("opencode_disabled");
    expect(getProjectSessionState("foundry")?.stage).toBe("spec_ready");
    expect(getProjectSessionState("foundry")?.nextAction.type).toBe("submit_spec");
  });

  it("allows retrying a previously approved spec that has not started building", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.doMock("@/lib/server/opencode-runner", () => ({
      OpenCodeRunnerError: class OpenCodeRunnerError extends Error {
        constructor(
          public readonly code: string,
          message: string,
          public readonly status: number,
        ) {
          super(message);
        }
      },
      startOpenCodeJob: vi.fn(async () => ({
        id: "job-1",
        projectId: "foundry",
        type: "opencode_build",
        status: "queued",
        output: null,
        error: null,
        provider: "opencode",
        model: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      })),
    }));
    const submitRoute = await import("./[projectId]/spec/submit/route");
    const { getProject } = await import("@/lib/server/project-store");
    const { upsertProjectSessionState } = await import("@/lib/server/session-store");

    getProject("foundry");
    upsertProjectSessionState({
      projectId: "foundry",
      stage: "spec_approved",
      readiness: "ready_for_spec",
      summary: completeSummary(),
      missingFields: [],
      repoRequested: true,
      buildRequested: true,
      nextAction: { type: "submit_spec", label: "Submit spec" },
    });

    const response = await submitRoute.POST(
      new NextRequest("http://localhost:3000/api/projects/foundry/spec/submit", {
        method: "POST",
        body: JSON.stringify({ createRepo: true, runBuild: true }),
      }),
      { params: Promise.resolve({ projectId: "foundry" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job.id).toBe("job-1");
    expect(payload.sessionState.stage).toBe("building");
  });

  it("hydrates a session and turns completed repo-requested builds into connect_github", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { createGenerationJob, markJobRunning, markJobSucceeded } = await import("@/lib/opencode/job-store");
    const { getProject } = await import("@/lib/server/project-store");
    const { upsertProjectSessionState } = await import("@/lib/server/session-store");
    const { GET } = await import("./[projectId]/session/route");

    getProject("foundry");
    upsertProjectSessionState({
      projectId: "foundry",
      stage: "building",
      readiness: "ready_for_spec",
      summary: completeSummary(),
      missingFields: [],
      repoRequested: true,
      buildRequested: true,
      nextAction: { type: "view_build", label: "View build" },
    });
    const job = createGenerationJob({
      projectId: "foundry",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });
    markJobRunning(job!.id);
    markJobSucceeded(job!.id, { message: "done" });

    const response = await GET(new NextRequest("http://localhost:3000/api/projects/foundry/session"), {
      params: Promise.resolve({ projectId: "foundry" }),
    });
    const payload = await response.json();

    expect(payload.sessionState.stage).toBe("built");
    expect(payload.sessionState.nextAction.type).toBe("connect_github");
  });

  it("hydrates a failed build back to spec review so it can be retried", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { createGenerationJob, markJobFailed, markJobRunning } = await import("@/lib/opencode/job-store");
    const { getProject } = await import("@/lib/server/project-store");
    const { upsertProjectSessionState } = await import("@/lib/server/session-store");
    const { GET } = await import("./[projectId]/session/route");

    getProject("foundry");
    upsertProjectSessionState({
      projectId: "foundry",
      stage: "building",
      readiness: "ready_for_spec",
      summary: completeSummary(),
      missingFields: [],
      repoRequested: true,
      buildRequested: true,
      nextAction: { type: "view_build", label: "View build" },
    });
    const job = createGenerationJob({
      projectId: "foundry",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });
    markJobRunning(job!.id);
    markJobFailed(job!.id, "OpenCode worker failed.");

    const response = await GET(new NextRequest("http://localhost:3000/api/projects/foundry/session"), {
      params: Promise.resolve({ projectId: "foundry" }),
    });
    const payload = await response.json();

    expect(payload.latestJob.status).toBe("failed");
    expect(payload.sessionState.stage).toBe("spec_ready");
    expect(payload.sessionState.nextAction.type).toBe("submit_spec");
  });
});

async function seedReadyState(projectId: string) {
  const { getProject } = await import("@/lib/server/project-store");
  const { upsertProjectSessionState } = await import("@/lib/server/session-store");

  getProject(projectId);
  upsertProjectSessionState({
    projectId,
    stage: "ready_for_spec",
    readiness: "ready_for_spec",
    summary: completeSummary(),
    missingFields: [],
    repoRequested: true,
    buildRequested: true,
    nextAction: { type: "generate_spec", label: "Generate spec" },
  });
}

function mockProductThinking() {
  vi.doMock("@/lib/services/product-thinking", () => ({
    createConduitProductThinkingService: vi.fn(async () => ({
      runChatTurn: vi.fn(async () => ({
        assistantMessage: "I have enough context to draft the MVP spec.",
        readiness: "ready_for_spec",
        summary: completeSummary(),
        missingFields: [],
        nextAction: { type: "generate_spec", label: "Generate spec" },
      })),
    })),
  }));
}

function completeSummary() {
  return {
    productName: "Foundry",
    oneLiner: "Turn ideas into MVP repos.",
    problem: "Builders lose context between chat and code.",
    targetUser: "Solo technical founders",
    smallestUsefulVersion: "A chat session that drafts a spec and starts a build.",
    goals: ["Clarify ideas"],
    nonGoals: ["Full IDE"],
    scopeLevel: "MVP" as const,
    mvpFeatures: ["Chat", "Spec", "Build"],
    routes: ["/"],
    dataEntities: ["Project"],
    integrations: ["GitHub"],
    risks: ["Scope creep"],
    openQuestions: [],
    repoRequested: true,
    buildRequested: true,
  };
}

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-session-flow-")), "foundry.sqlite")}`;
}
