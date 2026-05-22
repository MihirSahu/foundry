import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLatestProjectJob } from "@/lib/opencode/job-store";
import { getProject } from "@/lib/server/project-store";
import { OpenCodeRunnerError, startOpenCodeJob } from "@/lib/server/opencode-runner";

export const runtime = "nodejs";

const jobSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1).optional(),
  model: z.string().optional(),
  permissions: z
    .object({
      edit: z.boolean().default(false),
      shell: z.boolean().default(false),
      web: z.boolean().default(false),
      subagents: z.boolean().default(false),
    })
    .default({ edit: false, shell: false, web: false, subagents: false }),
});

export function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "projectId is required." } },
      { status: 400 },
    );
  }

  return NextResponse.json({ job: serializeJob(getLatestProjectJob(projectId)) });
}

export async function POST(request: NextRequest) {
  const parsed = jobSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Project, prompt, and permissions are required." } },
      { status: 400 },
    );
  }

  const project = getProject(parsed.data.projectId);

  if (!project) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }

  try {
    const job = await startOpenCodeJob({
      project,
      prompt: parsed.data.prompt ?? defaultPrompt(project.name),
      model: parsed.data.model,
      permissions: parsed.data.permissions,
    });

    return NextResponse.json({ jobId: job?.id, job: serializeJob(job) }, { status: 202 });
  } catch (error) {
    if (error instanceof OpenCodeRunnerError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: { code: "worker_spawn_failed", message: "Unable to start OpenCode worker." } },
      { status: 500 },
    );
  }
}

export function serializeJob(job: ReturnType<typeof getLatestProjectJob> | undefined) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    projectId: job.projectId,
    type: job.type,
    status: job.status,
    output: job.output,
    error: job.error,
    provider: job.provider,
    model: job.model,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function defaultPrompt(projectName: string) {
  return `Implement the MVP for ${projectName}. Read PRD.md, AGENTS.md, and docs/roadmap.md first. Keep scope limited to the MVP.`;
}
