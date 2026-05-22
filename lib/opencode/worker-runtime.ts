import { createServer } from "node:net";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import {
  appendBuildEvent,
  getGenerationJob,
  markJobFailed,
  markJobRunning,
  markJobSucceeded,
  type OpenCodeJobInput,
} from "./job-store";
import {
  createOpenCodeEventMapper,
  disabledSubagentTools,
  openCodeConfig,
  sanitizePayload,
} from "./event-mapping";

type OpenCodeInstance = {
  client: ReturnType<typeof createOpencodeClient>;
  server: {
    url: string;
    close(): void;
  };
};

type OpenCodeFactory = (input: {
  workspacePath: string;
  permissions: OpenCodeJobInput["permissions"];
}) => Promise<OpenCodeInstance>;

export async function runOpenCodeWorkerJob(
  jobId: string,
  factory: OpenCodeFactory = createWorkspaceOpencode,
) {
  const job = getGenerationJob(jobId);

  if (!job) {
    throw new Error(`OpenCode job ${jobId} was not found.`);
  }

  const input = job.input as OpenCodeJobInput;
  let instance: Awaited<ReturnType<OpenCodeFactory>> | undefined;
  let sessionId: string | undefined;

  try {
    markJobRunning(jobId);
    appendBuildEvent({
      jobId,
      projectId: job.projectId,
      type: "status",
      message: "Starting isolated OpenCode worker.",
    });

    instance = await factory({
      workspacePath: input.workspacePath,
      permissions: input.permissions,
    });

    const sessionResponse = await instance.client.session.create({
      body: {
        parentID: undefined,
        title: "Foundry build",
      },
    });
    const session = responseData<{ id: string }>(sessionResponse);
    sessionId = session.id;

    appendBuildEvent({
      jobId,
      projectId: job.projectId,
      type: "session",
      message: "Created OpenCode session.",
      payload: { sessionId },
    });

    const events = await instance.client.event.subscribe();

    let promptSubmissionPending = true;
    const promptSubmission = instance.client.session.promptAsync({
      path: { id: sessionId },
      body: {
        agent: "build",
        tools: input.permissions.subagents ? undefined : disabledSubagentTools,
        parts: [{ type: "text", text: input.prompt }],
        model: input.model ? { providerID: "openai", modelID: input.model } : undefined,
      },
    }).then(
      () => {
        promptSubmissionPending = false;
        return { status: "resolved" as const };
      },
      (promptError: unknown) => {
        promptSubmissionPending = false;
        return { status: "rejected" as const, error: promptError };
      },
    );

    let sequence = 3;
    let terminalState: "succeeded" | "failed" | undefined;
    let sawFinalEvent = false;
    let sawErrorEvent = false;
    let failureMessage = "OpenCode build failed.";
    let lastEventAt = Date.now();
    const eventMapper = createOpenCodeEventMapper(sessionId, input.workspacePath);
    const inactivityTimeoutMs = getInactivityTimeoutMs();
    const iterator = toAsyncIterable(events)[Symbol.asyncIterator]();
    let pendingEvent:
      | Promise<{
          type: "event";
          result: IteratorResult<unknown, unknown>;
        }>
      | undefined;

    while (!terminalState) {
      pendingEvent ??= iterator.next().then(
        (result) => ({ type: "event" as const, result }),
        () => ({
          type: "event" as const,
          result: { done: true, value: undefined } satisfies IteratorResult<unknown, unknown>,
        }),
      );
      const inactivityTimeout = sleep(Math.max(0, inactivityTimeoutMs - (Date.now() - lastEventAt))).then(
        () => ({ type: "timeout" as const }),
      );
      const next = await Promise.race(
        promptSubmissionPending
          ? [
              pendingEvent,
              promptSubmission.then((result) => ({ type: "prompt" as const, result })),
              inactivityTimeout,
            ]
          : [pendingEvent, inactivityTimeout],
      );

      if (next.type === "timeout") {
        failureMessage = "OpenCode worker timed out waiting for events.";
        terminalState = "failed";
        break;
      }

      if (next.type === "prompt") {
        if (next.result.status === "rejected") {
          throw next.result.error;
        }
        continue;
      }

      pendingEvent = undefined;
      lastEventAt = Date.now();

      if (next.result.done) {
        failureMessage = "OpenCode event stream ended before completion.";
        terminalState = "failed";
        break;
      }

      const rawEvent = next.result.value;
      const mappedEvents = eventMapper(rawEvent, sequence);

      for (const mapped of mappedEvents) {
        appendBuildEvent({
          jobId,
          projectId: job.projectId,
          type: mapped.type,
          message: mapped.message,
          payload: mapped.payload,
          sequence: mapped.sequence,
        });

        sequence = mapped.sequence + 1;

        if (mapped.type === "final") {
          sawFinalEvent = true;
          terminalState = "succeeded";
        }

        if (mapped.type === "error") {
          sawErrorEvent = true;
          failureMessage = mapped.message;
          terminalState = "failed";
        }
      }

      if (isSessionIdleEvent(rawEvent, sessionId)) {
        terminalState = "succeeded";
      }
    }

    if (terminalState === "failed") {
      if (!sawErrorEvent) {
        appendBuildEvent({
          jobId,
          projectId: job.projectId,
          type: "error",
          message: failureMessage,
        });
      }
      markJobFailed(jobId, failureMessage);
      return;
    }

    if (!sawFinalEvent) {
      appendBuildEvent({
        jobId,
        projectId: job.projectId,
        type: "final",
        message: "OpenCode build completed.",
      });
    }
    markJobSucceeded(jobId, { message: "OpenCode build completed." });
  } catch (error) {
    const message = sanitizeError(error);
    appendBuildEvent({
      jobId,
      projectId: job.projectId,
      type: "error",
      message,
      payload: sanitizePayload(error) as Record<string, unknown>,
    });
    markJobFailed(jobId, message);
  } finally {
    if (sessionId && instance) {
      await instance.client.session.delete({ path: { id: sessionId } }).catch(() => undefined);
    }

    instance?.server.close();
  }
}

async function createWorkspaceOpencode(input: {
  workspacePath: string;
  permissions: OpenCodeJobInput["permissions"];
}) {
  const server = await createOpencodeServer({
    port: await getAvailablePort(),
    config: openCodeConfig(input.permissions),
  });
  const client = createOpencodeClient({
    baseUrl: server.url,
    directory: input.workspacePath,
  });

  return { client, server };
}

function getAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Unable to allocate an OpenCode server port."));
      });
    });
  });
}

function responseData<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    return response.data as T;
  }

  return response as T;
}

function isSessionIdleEvent(event: unknown, sessionId: string) {
  if (!event || typeof event !== "object") {
    return false;
  }

  const typedEvent = event as { type?: unknown; properties?: { sessionID?: unknown } };

  return typedEvent.type === "session.idle" && typedEvent.properties?.sessionID === sessionId;
}

function getInactivityTimeoutMs() {
  const configured = Number(process.env.FOUNDRY_OPENCODE_INACTIVITY_TIMEOUT_MS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return 120_000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/bearer\s+[a-z0-9._-]+|gh[oapsu]_[a-z0-9_]+|sk-[a-z0-9_-]+/gi, "[redacted]");
  }

  return "OpenCode worker failed.";
}
