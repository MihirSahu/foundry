import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  renderAgents,
  renderBuildPlanFromSummary,
  renderHandoffPrompt,
  renderPrdFromSummary,
} from "@/lib/artifact-renderers";
import { getProject } from "@/lib/server/project-store";
import {
  getLatestArtifact,
  getProjectSessionState,
  markSessionSpecReady,
  saveArtifactVersion,
} from "@/lib/server/session-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const patchSchema = z.object({
  content: z.string().trim().min(1),
});

export async function POST(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const project = getProject(projectId);

  if (!project) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }

  const sessionState = getProjectSessionState(projectId);

  if (sessionState?.stage !== "ready_for_spec" || !sessionState.summary) {
    return NextResponse.json(
      { error: { code: "invalid_state", message: "Generate a spec after the chat is ready." } },
      { status: 409 },
    );
  }

  const prd = saveArtifactVersion({
    projectId,
    type: "prd",
    title: "PRD.md",
    content: renderPrdFromSummary(project, sessionState.summary),
  });
  const buildPlan = saveArtifactVersion({
    projectId,
    type: "build_plan",
    title: "Implementation Plan",
    content: renderBuildPlanFromSummary(project, sessionState.summary),
  });
  const agents = saveArtifactVersion({
    projectId,
    type: "agents_md",
    title: "AGENTS.md",
    content: renderAgents(project),
  });
  const handoff = saveArtifactVersion({
    projectId,
    type: "handoff_prompt",
    title: "Codex Handoff Prompt",
    content: renderHandoffPrompt(project),
  });
  const summary = saveArtifactVersion({
    projectId,
    type: "product_summary",
    title: "Product Summary",
    content: JSON.stringify(sessionState.summary, null, 2),
  });
  const updatedState = markSessionSpecReady(projectId, sessionState.summary);

  return NextResponse.json({
    artifacts: { prd, buildPlan, agents, handoff, summary },
    sessionState: updatedState,
    nextAction: updatedState.nextAction,
  }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

  if (!getProject(projectId)) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }

  const sessionState = getProjectSessionState(projectId);

  if (sessionState?.stage !== "spec_ready") {
    return NextResponse.json(
      { error: { code: "invalid_state", message: "Edit the spec after it has been generated." } },
      { status: 409 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Spec content is required." } },
      { status: 400 },
    );
  }

  const current = getLatestArtifact(projectId, "prd");
  const artifact = saveArtifactVersion({
    projectId,
    type: "prd",
    title: current?.title ?? "PRD.md",
    content: parsed.data.content,
  });

  return NextResponse.json({ artifact, sessionState });
}
