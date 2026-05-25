import { NextRequest, NextResponse } from "next/server";
import {
  appendBuildEvent,
  getGenerationJob,
  markJobCanceled,
} from "@/lib/opencode/job-store";
import { markSessionBuildStopped } from "@/lib/server/session-store";
import { serializeJob } from "../../route";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getGenerationJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: { code: "not_found", message: "OpenCode job not found." } },
      { status: 404 },
    );
  }

  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
    if (job.status === "failed" || job.status === "canceled") {
      markSessionBuildStopped(job.projectId);
    }

    return NextResponse.json({ job: serializeJob(getGenerationJob(jobId)) });
  }

  stopWorkerProcess(job.output);

  appendBuildEvent({
    jobId,
    projectId: job.projectId,
    type: "status",
    message: "Build paused by user.",
  });
  markJobCanceled(jobId, "Build paused by user.");
  markSessionBuildStopped(job.projectId);

  return NextResponse.json({ job: serializeJob(getGenerationJob(jobId)) });
}

function stopWorkerProcess(output: unknown) {
  const workerPid =
    output && typeof output === "object" && "workerPid" in output
      ? Number((output as { workerPid?: unknown }).workerPid)
      : NaN;

  if (!Number.isInteger(workerPid) || workerPid <= 0) {
    return;
  }

  try {
    process.kill(-workerPid, "SIGTERM");
  } catch {
    try {
      process.kill(workerPid, "SIGTERM");
    } catch {
      // The persisted job state is the source of truth even if the process already exited.
    }
  }
}
