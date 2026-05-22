import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { permissionConfig, sanitizePayload } from "./event-mapping";

vi.mock("server-only", () => ({}));

describe("OpenCode worker runtime", () => {
  afterEach(async () => {
    const { closeDatabase } = await import("../../db/client");
    closeDatabase();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("persists events and marks the job succeeded", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const close = vi.fn();
    const removeSession = vi.fn(async () => undefined);
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => undefined),
          delete: removeSession,
        },
        event: {
          subscribe: vi.fn(async () => eventStream([{ type: "final", message: "done" }])),
        },
      },
      server: { close },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob, listBuildEvents } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(fakeFactory).toHaveBeenCalledWith({
      workspacePath: "/tmp/foundry",
      permissions: { edit: true, shell: true, web: false, subagents: false },
    });
    expect(getGenerationJob(job!.id)?.status).toBe("succeeded");
    expect(listBuildEvents(job!.id, 0).map((event) => event.type)).toContain("final");
    expect(listBuildEvents(job!.id, 0)[0].payload).toBeUndefined();
    expect(removeSession).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("marks OpenCode error events as failed jobs", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const close = vi.fn();
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(() => new Promise(() => undefined)),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () => eventStream([{ type: "error", message: "model failed" }])),
        },
      },
      server: { close },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob, listBuildEvents } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("failed");
    expect(listBuildEvents(job!.id, 0).map((event) => event.type)).toEqual([
      "status",
      "session",
      "error",
    ]);
  });

  it("waits for a terminal event after prompt submission resolves", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () => delayedEventStream([{ type: "final", message: "done" }])),
        },
      },
      server: { close: vi.fn() },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob, listBuildEvents } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("succeeded");
    expect(listBuildEvents(job!.id, 0).at(-1)?.message).toBe("done");
  });

  it("marks the job succeeded when the active OpenCode session becomes idle", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () =>
            eventStream([
              { type: "session.idle", properties: { sessionID: "other-session" } },
              { type: "session.idle", properties: { sessionID: "session-1" } },
            ]),
          ),
        },
      },
      server: { close: vi.fn() },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob, listBuildEvents } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("succeeded");
    expect(listBuildEvents(job!.id, 0).at(-1)?.type).toBe("final");
  });

  it("fails when the event stream ends before a terminal event", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () => eventStream([{ type: "status", message: "working" }])),
        },
      },
      server: { close: vi.fn() },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob, listBuildEvents } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("failed");
    expect(getGenerationJob(job!.id)?.error).toBe("OpenCode event stream ended before completion.");
    expect(listBuildEvents(job!.id, 0).at(-1)?.type).toBe("error");
  });

  it("fails when OpenCode stops emitting events", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_OPENCODE_INACTIVITY_TIMEOUT_MS", "1");
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () => neverStream()),
        },
      },
      server: { close: vi.fn() },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob, listBuildEvents } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("failed");
    expect(getGenerationJob(job!.id)?.error).toBe("OpenCode worker timed out waiting for events.");
    expect(listBuildEvents(job!.id, 0).at(-1)?.message).toBe(
      "OpenCode worker timed out waiting for events.",
    );
  });

  it("does not leak pending event rejections after timeout", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_OPENCODE_INACTIVITY_TIMEOUT_MS", "1");
    const pendingEvent = new Promise<IteratorResult<unknown, unknown>>((_, reject) => {
      setTimeout(() => reject(new Error("stream closed")), 5);
    });
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () => ({
            [Symbol.asyncIterator]() {
              return {
                next: () => pendingEvent,
              };
            },
          })),
        },
      },
      server: { close: vi.fn() },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);
    await pendingEvent.catch(() => undefined);

    expect(getGenerationJob(job!.id)?.status).toBe("failed");
  });

  it("marks prompt rejections as failed jobs", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const fakeFactory = vi.fn(async () => ({
      client: {
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          promptAsync: vi.fn(async () => {
            throw new Error("prompt failed with sk-secret");
          }),
          delete: vi.fn(async () => undefined),
        },
        event: {
          subscribe: vi.fn(async () => neverStream()),
        },
      },
      server: { close: vi.fn() },
    }));

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("failed");
    expect(getGenerationJob(job!.id)?.error).toBe("prompt failed with [redacted]");
  });

  it("marks failures with sanitized errors", async () => {
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const fakeFactory = vi.fn(async () => {
      throw new Error("failed with bearer sk-secret");
    });

    const { upsertProject } = await import("../server/project-store");
    const { createGenerationJob, getGenerationJob } = await import("./job-store");
    const { runOpenCodeWorkerJob } = await import("./worker-runtime");
    upsertProject(project());
    const job = createGenerationJob({
      projectId: "project-1",
      input: {
        workspacePath: "/tmp/foundry",
        prompt: "Build it",
        permissions: { edit: true, shell: true, web: false, subagents: false },
      },
    });

    await runOpenCodeWorkerJob(job!.id, fakeFactory as never);

    expect(getGenerationJob(job!.id)?.status).toBe("failed");
    expect(getGenerationJob(job!.id)?.error).toBe("failed with [redacted]");
  });
});

describe("OpenCode event sanitization", () => {
  it("allows explicitly enabled worker permissions without interactive prompts", () => {
    expect(permissionConfig({ edit: true, shell: true, web: false, subagents: false })).toEqual({
      edit: "allow",
      bash: "allow",
      webfetch: "deny",
      external_directory: "deny",
    });
  });

  it("redacts secret-looking strings inside arrays", () => {
    expect(sanitizePayload(["Bearer sk-secret", "plain"])).toEqual(["[redacted]", "plain"]);
  });
});

async function* eventStream(events: Array<Record<string, unknown>>) {
  for (const event of events) {
    yield event;
  }
}

async function* delayedEventStream(events: Array<Record<string, unknown>>) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  yield* eventStream(events);
}

async function* neverStream() {
  await new Promise(() => undefined);
}

function project() {
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
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-worker-")), "foundry.sqlite")}`;
}
