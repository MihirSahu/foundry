import { NextRequest, NextResponse } from "next/server";
import { getGenerationJob, listBuildEvents } from "@/lib/opencode/job-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getGenerationJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: { code: "not_found", message: "OpenCode job not found." } },
      { status: 404 },
    );
  }

  const after = Number(request.nextUrl.searchParams.get("after") ?? "0");

  return NextResponse.json({
    events: listBuildEvents(jobId, Number.isFinite(after) ? after : 0),
  });
}
