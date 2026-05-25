import { NextRequest, NextResponse } from "next/server";
import { specApprovalSchema } from "@/lib/schemas";
import { getProject } from "@/lib/server/project-store";
import {
  getLatestArtifact,
  getProjectSessionState,
  markSessionBuilding,
  saveArtifactVersion,
  upsertProjectSessionState,
} from "@/lib/server/session-store";
import { OpenCodeRunnerError, startOpenCodeJob } from "@/lib/server/opencode-runner";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const project = getProject(projectId);

  if (!project) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }

  const sessionState = getProjectSessionState(projectId);

  if (sessionState?.stage !== "spec_ready" && sessionState?.stage !== "spec_approved") {
    return NextResponse.json(
      { error: { code: "invalid_state", message: "Submit the spec after it has been generated." } },
      { status: 409 },
    );
  }

  const parsed = specApprovalSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Check the spec submission payload." } },
      { status: 400 },
    );
  }

  if (parsed.data.content) {
    const current = getLatestArtifact(projectId, "prd");
    saveArtifactVersion({
      projectId,
      type: "prd",
      title: current?.title ?? "PRD.md",
      content: parsed.data.content,
    });
  }

  const repoRequested = parsed.data.createRepo ?? sessionState.repoRequested ?? false;
  const buildRequested = parsed.data.runBuild ?? sessionState.buildRequested ?? true;

  if (!buildRequested) {
    const updatedState = upsertProjectSessionState({
      projectId,
      stage: "handoff_ready",
      readiness: "ready_for_spec",
      summary: sessionState.summary,
      missingFields: [],
      repoRequested,
      buildRequested,
      nextAction: repoRequested
        ? { type: "connect_github", label: "Connect GitHub" }
        : { type: "view_build", label: "View handoff" },
    });

    return NextResponse.json({ job: null, sessionState: updatedState });
  }

  try {
    const job = await startOpenCodeJob({
      project,
      prompt: defaultBuildPrompt(project.name),
      permissions: {
        edit: true,
        shell: true,
        web: false,
        subagents: false,
      },
    });
    upsertProjectSessionState({
      projectId,
      stage: "spec_approved",
      readiness: "ready_for_spec",
      summary: sessionState.summary,
      missingFields: [],
      repoRequested,
      buildRequested,
      nextAction: { type: "submit_spec", label: "Submit spec" },
    });
    const updatedState = markSessionBuilding(projectId);

    return NextResponse.json({ job: serializeJob(job), sessionState: updatedState }, { status: 202 });
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

function defaultBuildPrompt(projectName: string) {
  return `Implement the MVP for ${projectName}. Read PRD.md, AGENTS.md, and docs/roadmap.md first. Keep scope limited to the approved spec.`;
}

function serializeJob(job: Awaited<ReturnType<typeof startOpenCodeJob>>) {
  return job
    ? {
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
      }
    : null;
}
