import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/client";
import { buildEvents, generationJobs } from "../../db/schema";
import type { BuildEvent, GenerationJobType } from "../domain";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type OpenCodeJobInput = {
  workspacePath: string;
  prompt: string;
  model?: string;
  permissions: {
    edit: boolean;
    shell: boolean;
    web: boolean;
    subagents: boolean;
  };
};

export type CreateJobInput = {
  id?: string;
  projectId: string;
  type?: GenerationJobType;
  input: OpenCodeJobInput;
  model?: string;
};

export function createGenerationJob(input: CreateJobInput) {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();

  getDb()
    .insert(generationJobs)
    .values({
      id,
      projectId: input.projectId,
      type: input.type ?? "opencode_build",
      status: "queued",
      input: input.input,
      output: null,
      error: null,
      provider: "opencode",
      model: input.model ?? input.input.model ?? null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getGenerationJob(id);
}

export function getGenerationJob(jobId: string) {
  return getDb().select().from(generationJobs).where(eq(generationJobs.id, jobId)).get();
}

export function getLatestProjectJob(projectId: string) {
  return getDb()
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.projectId, projectId), eq(generationJobs.type, "opencode_build")))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1)
    .get();
}

export function markJobRunning(jobId: string) {
  const now = new Date();

  getDb()
    .update(generationJobs)
    .set({ status: "running", startedAt: now, updatedAt: now })
    .where(eq(generationJobs.id, jobId))
    .run();
}

export function markJobSucceeded(jobId: string, output: Record<string, unknown>) {
  const now = new Date();

  getDb()
    .update(generationJobs)
    .set({ status: "succeeded", output, completedAt: now, updatedAt: now })
    .where(eq(generationJobs.id, jobId))
    .run();
}

export function markJobFailed(jobId: string, error: string) {
  const now = new Date();

  getDb()
    .update(generationJobs)
    .set({ status: "failed", error, completedAt: now, updatedAt: now })
    .where(eq(generationJobs.id, jobId))
    .run();
}

export function appendBuildEvent(input: {
  jobId: string;
  projectId: string;
  type: BuildEvent["type"];
  message: string;
  payload?: Record<string, unknown>;
  sequence?: number;
}) {
  const sequence = input.sequence ?? nextEventSequence(input.jobId);
  const event = {
    id: crypto.randomUUID(),
    jobId: input.jobId,
    projectId: input.projectId,
    sequence,
    type: input.type,
    message: input.message,
    payload: input.payload ?? null,
    createdAt: new Date(),
  };

  getDb().insert(buildEvents).values(event).run();

  return {
    id: event.id,
    sequence,
    type: event.type,
    message: event.message,
    payload: event.payload ?? undefined,
  } satisfies BuildEvent;
}

export function listBuildEvents(jobId: string, after = 0) {
  return getDb()
    .select()
    .from(buildEvents)
    .where(and(eq(buildEvents.jobId, jobId), gt(buildEvents.sequence, after)))
    .orderBy(buildEvents.sequence)
    .all()
    .map((event) => ({
      id: event.id,
      sequence: event.sequence,
      type: event.type as BuildEvent["type"],
      message: event.message,
      payload: (event.payload as Record<string, unknown> | null) ?? undefined,
    }));
}

function nextEventSequence(jobId: string) {
  const latest = getDb()
    .select({ sequence: buildEvents.sequence })
    .from(buildEvents)
    .where(eq(buildEvents.jobId, jobId))
    .orderBy(desc(buildEvents.sequence))
    .limit(1)
    .get();

  return (latest?.sequence ?? 0) + 1;
}
