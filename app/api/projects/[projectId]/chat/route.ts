import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addMessage, getProject, listMessages } from "@/lib/server/project-store";
import {
  normalizeChatTurnResult,
  touchProjectFromSummary,
  upsertProjectSessionState,
} from "@/lib/server/session-store";
import { createConduitProductThinkingService } from "@/lib/services/product-thinking";
import type { Message } from "@/lib/domain";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const chatSchema = z.object({
  content: z.string().trim().min(1),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const project = getProject(projectId);

  if (!project) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }

  const parsed = chatSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Message content is required." } },
      { status: 400 },
    );
  }

  addMessage(projectId, "user", parsed.data.content);
  const messages = listMessages(projectId);
  const service = await createConduitProductThinkingService();
  const turn = normalizeChatTurnResult(
    projectId,
    await service.runChatTurn({
      idea: project.oneLiner,
      conversation: messages
        .filter(isChatMessage)
        .map((message) => ({ role: message.role, content: message.content })),
    }),
  );

  addMessage(projectId, "assistant", turn.assistantMessage);
  touchProjectFromSummary(projectId, turn.summary);
  const sessionState = upsertProjectSessionState(turn.sessionState);

  return NextResponse.json({
    message: {
      role: "assistant",
      content: turn.assistantMessage,
    },
    messages: listMessages(projectId),
    sessionState,
    nextAction: sessionState.nextAction,
  });
}

function isChatMessage(message: Message): message is Message & { role: "assistant" | "user" } {
  return message.role === "assistant" || message.role === "user";
}
