import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  renderHandoffPrompt,
  renderPrd,
} from "@/lib/artifact-renderers";
import type { Project } from "@/lib/domain";
import { createConduitProductThinkingService } from "@/lib/services/product-thinking";

export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["question", "summary", "build_plan", "prd", "handoff"]),
  idea: z.string().trim().min(1),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      oneLiner: z.string(),
      status: z.enum(["draft", "active", "blocked", "ready"]),
      stage: z.enum(["Idea", "Brainstorming", "PRD", "Build Plan", "Repo Created", "Codex Handoff Ready"]),
      scopeLevel: z.enum(["Prototype", "MVP", "Launchable"]),
      updatedAt: z.string(),
      repoUrl: z.string().optional(),
    })
    .optional(),
  conversation: z
    .array(z.object({ role: z.enum(["assistant", "user"]), content: z.string() }))
    .optional(),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Provide an idea and generation mode." } },
      { status: 400 },
    );
  }

  const service = await createConduitProductThinkingService();
  const input = {
    idea: parsed.data.idea,
    conversation: parsed.data.conversation,
  };

  if (parsed.data.mode === "question") {
    return NextResponse.json({ text: await service.nextQuestion(input) });
  }

  if (parsed.data.mode === "summary") {
    return NextResponse.json({ summary: await service.extractSummary(input) });
  }

  if (parsed.data.mode === "build_plan") {
    const summary = await service.extractSummary(input);
    return NextResponse.json({ plan: await service.generateImplementationPlan(summary) });
  }

  const project = parsed.data.project ?? projectFromIdea(parsed.data.idea);

  if (parsed.data.mode === "prd") {
    return NextResponse.json({ markdown: renderPrd(project) });
  }

  return NextResponse.json({ markdown: renderHandoffPrompt(project) });
}

function projectFromIdea(idea: string): Project {
  return {
    id: "generated",
    name: idea.split(/\s+/).slice(0, 3).join(" ") || "Generated Project",
    slug: "generated-project",
    oneLiner: idea,
    status: "draft",
    stage: "PRD",
    scopeLevel: "MVP",
    updatedAt: new Date().toISOString(),
  };
}
