import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/server/project-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const project = getProject(projectId);

  if (!project) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ project });
}
