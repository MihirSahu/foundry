import { mkdtempSync } from "node:fs";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("OpenCode jobs route", () => {
  it("rejects job creation while the feature flag is disabled", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_ENABLE_OPENCODE", "0");
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/opencode/jobs", {
        method: "POST",
        body: JSON.stringify({ projectId: "foundry" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("opencode_disabled");
  });

  it("creates a queued job and spawns a detached worker", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_WORKSPACES_DIR", mkdtempSync(join(tmpdir(), "foundry-route-workspaces-")));
    vi.stubEnv("FOUNDRY_ENABLE_OPENCODE", "1");
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));
    vi.doMock("node:child_process", () => ({ spawn }));
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/opencode/jobs", {
        method: "POST",
        body: JSON.stringify({ projectId: "foundry" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.jobId).toBeTruthy();
    expect(payload.job.status).toBe("queued");
    expect(payload.job.input).toBeUndefined();
    expect(spawn).toHaveBeenCalled();
    expect(unref).toHaveBeenCalled();
  });

  it("returns a sanitized failure when the worker cannot spawn", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_WORKSPACES_DIR", mkdtempSync(join(tmpdir(), "foundry-route-workspaces-")));
    vi.stubEnv("FOUNDRY_ENABLE_OPENCODE", "1");
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn(() => {
        throw new Error("spawn failed with secret");
      }),
    }));
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/opencode/jobs", {
        method: "POST",
        body: JSON.stringify({ projectId: "foundry" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("worker_spawn_failed");
    expect(payload.error.message).toBe("Unable to start OpenCode worker.");
  });

  it("marks the job failed when the worker process exits before completion", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    vi.stubEnv("FOUNDRY_WORKSPACES_DIR", mkdtempSync(join(tmpdir(), "foundry-route-workspaces-")));
    vi.stubEnv("FOUNDRY_ENABLE_OPENCODE", "1");
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => child) }));
    const { POST } = await import("./route");
    const { getGenerationJob } = await import("@/lib/opencode/job-store");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/opencode/jobs", {
        method: "POST",
        body: JSON.stringify({ projectId: "foundry" }),
      }),
    );
    const payload = (await response.json()) as { jobId: string };

    child.emit("exit", 1, null);

    expect(getGenerationJob(payload.jobId)?.status).toBe("failed");
    expect(getGenerationJob(payload.jobId)?.error).toBe(
      "OpenCode worker exited before completion with exit code 1.",
    );
  });
});

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-opencode-route-")), "foundry.sqlite")}`;
}
