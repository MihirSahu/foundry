import { NextRequest, NextResponse } from "next/server";
import { getGenerationJob } from "@/lib/opencode/job-store";
import { serializeJob } from "../route";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getGenerationJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: { code: "not_found", message: "OpenCode job not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ job: serializeJob(job) });
}
