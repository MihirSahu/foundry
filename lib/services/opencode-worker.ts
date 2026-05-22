import "server-only";
import type { BuildEvent } from "@/lib/domain";

export type OpenCodeBuildInput = {
  workspacePath: string;
  prompt: string;
  model?: string;
  permissions: {
    edit: boolean;
    shell: boolean;
    web: boolean;
    subagents: boolean;
  };
};

export async function* runOpenCodeBuild(input: OpenCodeBuildInput): AsyncGenerator<BuildEvent> {
  if (process.env.FOUNDRY_ENABLE_OPENCODE !== "1") {
    yield {
      id: crypto.randomUUID(),
      sequence: 1,
      type: "error",
      message: "OpenCode worker mode is disabled. Set FOUNDRY_ENABLE_OPENCODE=1 to enable it.",
    };
    return;
  }

  yield {
    id: crypto.randomUUID(),
    sequence: 1,
    type: "status",
    message: "Starting isolated OpenCode build worker.",
  };

  const sdk = (await import("@opencode-ai/sdk")) as {
    createOpencode?: (options?: unknown) => Promise<{
      client: OpenCodeClientLike;
      server: { url: string; close: () => void };
    }>;
  };

  if (!sdk.createOpencode) {
    throw new Error("Installed @opencode-ai/sdk does not expose the expected worker API.");
  }

  const instance = await sdk.createOpencode({
    config: {
      permission: permissionConfig(input.permissions),
    },
  });
  const client = instance.client;
  const sessionResponse = await client.session.create({
    body: {
      parentID: undefined,
      title: "Foundry build",
    },
  });
  const session = responseData<{ id: string }>(sessionResponse);

  try {
    let sequence = 2;
    const events = await client.event.subscribe();

    void client.session.promptAsync({
      path: {
        id: session.id,
      },
      body: {
        parts: [{ type: "text", text: input.prompt }],
        model: input.model ? { providerID: "openai", modelID: input.model } : undefined,
      },
    });

    for await (const rawEvent of toAsyncIterable(events)) {
      yield mapOpenCodeEvent(rawEvent, sequence);
      sequence += 1;
    }
  } finally {
    await client.session.delete({ path: { id: session.id } });
    instance.server.close();
  }
}

type OpenCodeClientLike = {
  session: {
    create: (input?: unknown) => Promise<unknown>;
    promptAsync: (input: unknown) => Promise<unknown>;
    delete: (input: unknown) => Promise<unknown>;
  };
  event: {
    subscribe: () => Promise<unknown>;
  };
};

function responseData<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    return response.data as T;
  }

  return response as T;
}

async function* toAsyncIterable(value: unknown): AsyncGenerator<unknown> {
  if (value && typeof value === "object" && Symbol.asyncIterator in value) {
    yield* value as AsyncIterable<unknown>;
    return;
  }

  if (value && typeof value === "object" && "stream" in value) {
    yield* toAsyncIterable(value.stream);
  }
}

function permissionConfig(permissions: OpenCodeBuildInput["permissions"]) {
  return {
    edit: permissions.edit ? "ask" : "deny",
    bash: permissions.shell ? "ask" : "deny",
    webfetch: permissions.web ? "ask" : "deny",
  };
}

function mapOpenCodeEvent(rawEvent: unknown, sequence: number): BuildEvent {
  const payload = rawEvent && typeof rawEvent === "object" ? rawEvent : { value: rawEvent };
  const type =
    payload && "type" in payload && typeof payload.type === "string"
      ? normalizeEventType(payload.type)
      : "status";

  return {
    id: crypto.randomUUID(),
    sequence,
    type,
    message: type.replace("_", " "),
    payload: payload as Record<string, unknown>,
  };
}

function normalizeEventType(type: string): BuildEvent["type"] {
  if (type.includes("tool") && type.includes("start")) return "tool_start";
  if (type.includes("tool") && type.includes("finish")) return "tool_finish";
  if (type.includes("file")) return "file_access";
  if (type.includes("command") || type.includes("shell")) return "command";
  if (type.includes("error")) return "error";
  if (type.includes("final") || type.includes("complete")) return "final";
  if (type.includes("reason")) return "reasoning_delta";
  return "status";
}
