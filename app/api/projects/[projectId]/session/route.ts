import { NextRequest, NextResponse } from "next/server";
import { getLatestProjectJob } from "@/lib/opencode/job-store";
import { getProject, listArtifacts, listMessages } from "@/lib/server/project-store";
import {
  getOrCreateProjectSessionState,
  markSessionBuildStopped,
  getProjectRepository,
  reconcileCompletedBuild,
  upsertProjectSessionState,
} from "@/lib/server/session-store";

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

  const latestJob = getLatestProjectJob(projectId);
  let sessionState = getOrCreateProjectSessionState(project);
  let repository = getProjectRepository(projectId);

  if (repository && sessionState.stage !== "repo_created") {
    sessionState = upsertProjectSessionState({
      projectId,
      stage: "repo_created",
      readiness: "ready_for_spec",
      summary: sessionState.summary,
      missingFields: [],
      repoRequested: sessionState.repoRequested ?? true,
      buildRequested: sessionState.buildRequested ?? true,
      nextAction: { type: "open_repo", label: "Open repo" },
    });
  } else if (latestJob?.status === "succeeded" && sessionState.stage === "building") {
    sessionState = (await reconcileCompletedBuild(project)) ?? sessionState;
    repository = getProjectRepository(projectId);
  } else if (
    (latestJob?.status === "failed" || latestJob?.status === "canceled") &&
    sessionState.stage === "building"
  ) {
    sessionState = markSessionBuildStopped(projectId);
  }

  return NextResponse.json({
    project,
    messages: listMessages(projectId),
    artifacts: listArtifacts(projectId),
    sessionState,
    latestJob: latestJob ? serializeJob(latestJob) : null,
    repository: repository
      ? {
          owner: repository.owner,
          name: repository.name,
          url: repository.url,
          defaultBranch: repository.defaultBranch,
          visibility: repository.visibility,
        }
      : null,
  });
}

function serializeJob(job: NonNullable<ReturnType<typeof getLatestProjectJob>>) {
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
