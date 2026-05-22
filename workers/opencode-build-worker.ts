import { runOpenCodeWorkerJob } from "../lib/opencode/worker-runtime";

const jobId = process.argv[2];

if (!jobId) {
  throw new Error("Missing OpenCode job id.");
}

await runOpenCodeWorkerJob(jobId);
