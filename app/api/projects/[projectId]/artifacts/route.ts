import { NextRequest, NextResponse } from "next/server";
import { listArtifacts } from "@/lib/server/project-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

  return NextResponse.json({ artifacts: listArtifacts(projectId) });
}
