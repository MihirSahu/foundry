import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createProjectFromIdea, listProjects } from "@/lib/server/project-store";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  idea: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  scopeLevel: z.enum(["Prototype", "MVP", "Launchable"]).optional(),
});

export function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: NextRequest) {
  const parsed = createProjectSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Provide an idea to create a project." } },
      { status: 400 },
    );
  }

  const project = createProjectFromIdea(parsed.data);

  return NextResponse.json({ project }, { status: 201 });
}
