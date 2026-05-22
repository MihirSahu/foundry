import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listBuildEvents } from "@/lib/opencode/job-store";
import { getProject } from "@/lib/server/project-store";
import { OpenCodeRunnerError, startOpenCodeJob } from "@/lib/server/opencode-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

const buildSchema = z.object({
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

export async function POST(request: NextRequest) {
  const parsed = buildSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Project id is required." } },
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

  let jobId: string;

  try {
    const job = await startOpenCodeJob({
      project,
      prompt:
        parsed.data.prompt ??
        `Implement the MVP for ${project.name}. Read PRD.md, AGENTS.md, and docs/roadmap.md first.`,
      model: parsed.data.model,
      permissions: parsed.data.permissions,
    });

    jobId = job.id;
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let after = 0;
        const startedAt = Date.now();

        while (Date.now() - startedAt < 55_000) {
          const events = listBuildEvents(jobId, after);

          for (const event of events) {
            after = event.sequence;
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

            if (event.type === "final" || event.type === "error") {
              return;
            }
          }

          await sleep(750);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
