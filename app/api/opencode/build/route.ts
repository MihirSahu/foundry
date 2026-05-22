import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runOpenCodeBuild } from "@/lib/services/opencode-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const buildSchema = z.object({
  workspacePath: z.string().min(1),
  prompt: z.string().min(1),
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

export async function POST(request: NextRequest) {
  const parsed = buildSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Workspace path and prompt are required." } },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runOpenCodeBuild(parsed.data)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              id: crypto.randomUUID(),
              sequence: 9999,
              type: "error",
              message: "OpenCode build failed.",
            })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
