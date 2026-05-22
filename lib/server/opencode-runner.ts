import "server-only";

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Project } from "@/lib/domain";
import {
  createGenerationJob,
  getGenerationJob,
  markJobFailed,
  type OpenCodeJobInput,
} from "@/lib/opencode/job-store";
import { materializeProjectWorkspace } from "@/lib/opencode/workspace";

export type StartOpenCodeJobInput = {
  project: Project;
  prompt: string;
  model?: string;
  permissions: OpenCodeJobInput["permissions"];
};

export async function startOpenCodeJob(input: StartOpenCodeJobInput) {
  if (process.env.FOUNDRY_ENABLE_OPENCODE !== "1") {
    throw new OpenCodeRunnerError(
      "opencode_disabled",
      "OpenCode worker mode is disabled. Set FOUNDRY_ENABLE_OPENCODE=1 to enable it.",
      403,
    );
  }

  const workspacePath = await materializeProjectWorkspace(input.project);
  const job = createGenerationJob({
    projectId: input.project.id,
    model: input.model,
    input: {
      workspacePath,
      prompt: input.prompt,
      model: input.model,
      permissions: input.permissions,
    },
  });

  if (!job) {
    throw new OpenCodeRunnerError("job_create_failed", "Unable to create OpenCode job.", 500);
  }

  try {
    spawnWorker(job.id);
  } catch {
    markJobFailed(job.id, "Unable to start OpenCode worker.");
    throw new OpenCodeRunnerError("worker_spawn_failed", "Unable to start OpenCode worker.", 500);
  }

  return job;
}

export class OpenCodeRunnerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OpenCodeRunnerError";
  }
}

function spawnWorker(jobId: string) {
  const require = createRequire(import.meta.url);
  const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
  const workerPath = join(
    /* turbopackIgnore: true */ process.cwd(),
    "workers",
    "opencode-build-worker.ts",
  );
  const child = spawn(process.execPath, [tsxCli, workerPath, jobId], {
    cwd: /* turbopackIgnore: true */ process.cwd(),
    detached: true,
    env: {
      ...process.env,
      FOUNDRY_DATABASE_URL: process.env.FOUNDRY_DATABASE_URL,
    },
    stdio: "ignore",
  });

  child.once?.("error", () => {
    markJobFailed(jobId, "Unable to start OpenCode worker.");
  });
  child.once?.("exit", (code, signal) => {
    markJobFailedIfUnfinished(
      jobId,
      `OpenCode worker exited before completion${formatExitReason(code, signal)}.`,
    );
  });
  child.unref();
}

function markJobFailedIfUnfinished(jobId: string, message: string) {
  const job = getGenerationJob(jobId);

  if (!job || job.status === "succeeded" || job.status === "failed") {
    return;
  }

  markJobFailed(jobId, message);
}

function formatExitReason(code: number | null, signal: NodeJS.Signals | null) {
  if (typeof code === "number") {
    return ` with exit code ${code}`;
  }

  if (signal) {
    return ` from signal ${signal}`;
  }

  return "";
}
