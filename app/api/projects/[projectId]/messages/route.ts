import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addMessage, listMessages } from "@/lib/server/project-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const messageSchema = z.object({
  role: z.enum(["assistant", "user", "system"]),
  content: z.string().trim().min(1),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

  return NextResponse.json({ messages: listMessages(projectId) });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Message content is required." } },
      { status: 400 },
    );
  }

  addMessage(projectId, parsed.data.role, parsed.data.content);

  return NextResponse.json({ ok: true }, { status: 201 });
}
