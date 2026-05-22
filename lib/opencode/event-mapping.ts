import { isAbsolute, relative, resolve } from "node:path";
import type { BuildEvent } from "../domain";

export type OpenCodePermissions = {
  edit: boolean;
  shell: boolean;
  web: boolean;
  subagents: boolean;
};

export const disabledSubagentTools = {
  task: false,
} as const;

export function permissionConfig(permissions: OpenCodePermissions) {
  return {
    edit: permissions.edit ? "allow" : "deny",
    bash: permissions.shell ? "allow" : "deny",
    webfetch: permissions.web ? "allow" : "deny",
    external_directory: "deny",
  } as const;
}

export function openCodeConfig(permissions: OpenCodePermissions) {
  const permissionsConfig = permissionConfig(permissions);
  const taskTools = permissions.subagents ? undefined : disabledSubagentTools;

  return {
    permission: permissionsConfig,
    tools: taskTools,
    agent: {
      build: {
        mode: "primary",
        description: "Implement the scoped Foundry MVP task in the current workspace.",
        tools: taskTools,
        permission: permissionsConfig,
      },
      plan: {
        mode: "primary",
        description: "Plan implementation steps without editing files.",
        tools: taskTools,
        permission: { ...permissionsConfig, edit: "deny", bash: "deny" },
      },
      foundry_review: {
        mode: "subagent",
        disable: !permissions.subagents,
        description: "Review changed files for correctness, safety, and scope drift.",
        permission: { ...permissionsConfig, edit: "deny", bash: "deny" },
      },
      foundry_research: {
        mode: "subagent",
        disable: !permissions.subagents,
        description: "Inspect project files and summarize implementation context.",
        permission: { ...permissionsConfig, edit: "deny", bash: "deny" },
      },
    },
  } as const;
}

export function mapOpenCodeEvent(rawEvent: unknown, sequence: number): Omit<BuildEvent, "id"> {
  const payload = sanitizePayload(rawEvent);
  const rawType =
    payload && typeof payload === "object" && "type" in payload && typeof payload.type === "string"
      ? payload.type
      : "status";
  const type = normalizeEventType(rawType);

  return {
    sequence,
    type,
    message: messageForEvent(type, payload),
    payload: payload as Record<string, unknown>,
  };
}

export function createOpenCodeEventMapper(sessionId: string, workspacePath?: string) {
  const reasoningTextByPartId = new Map<string, string>();
  const toolStatusByPartId = new Map<string, string>();
  const workspaceRoot = workspacePath ? resolve(workspacePath) : undefined;

  return (rawEvent: unknown, sequence: number) => {
    const mapped = mapRichOpenCodeEvent(
      rawEvent,
      sessionId,
      workspaceRoot,
      reasoningTextByPartId,
      toolStatusByPartId,
    );

    if (mapped.length === 0) {
      return [mapOpenCodeEvent(rawEvent, sequence)];
    }

    return mapped.map((event, index) => ({
      sequence: sequence + index,
      ...event,
      message: sanitizeEventMessage(event.message),
      payload: sanitizePayload(event.payload ?? rawEvent) as Record<string, unknown>,
    }));
  };
}

export function sanitizePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizePayload);
  }

  if (typeof value === "string" && looksSecretish(value)) {
    return "[redacted]";
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSecretKey(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    if (typeof nestedValue === "string" && looksSecretish(nestedValue)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = sanitizePayload(nestedValue);
  }

  return sanitized;
}

export function normalizeEventType(type: string): BuildEvent["type"] {
  const normalized = type.toLowerCase();

  if (normalized.includes("tool") && normalized.includes("start")) return "tool_start";
  if (normalized.includes("tool") && normalized.includes("progress")) return "tool_progress";
  if (normalized.includes("tool") && normalized.includes("finish")) return "tool_finish";
  if (normalized.includes("tool") && normalized.includes("error")) return "tool_error";
  if (normalized.includes("file")) return "file_access";
  if (normalized.includes("command") || normalized.includes("shell") || normalized.includes("bash")) {
    return "command";
  }
  if (normalized.includes("error")) return "error";
  if (normalized.includes("final") || normalized.includes("complete")) return "final";
  if (normalized.includes("reason")) return "reasoning_delta";
  if (normalized.includes("session")) return "session";
  return "status";
}

function messageForEvent(type: BuildEvent["type"], payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if (payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string") {
    return payload.text;
  }

  if (payload && typeof payload === "object" && "label" in payload && typeof payload.label === "string") {
    return payload.label;
  }

  return type.replace("_", " ");
}

function isSecretKey(key: string) {
  return /token|secret|authorization|cookie|password|credential|refresh|access/i.test(key);
}

function looksSecretish(value: string) {
  return /bearer\s+[a-z0-9._-]+|gh[oapsu]_[a-z0-9_]+|sk-[a-z0-9_-]+/i.test(value);
}

function sanitizeEventMessage(message: string) {
  const sanitized = sanitizePayload(message);
  return typeof sanitized === "string" ? sanitized : "[redacted]";
}

function mapRichOpenCodeEvent(
  rawEvent: unknown,
  sessionId: string,
  workspaceRoot: string | undefined,
  reasoningTextByPartId: Map<string, string>,
  toolStatusByPartId: Map<string, string>,
) {
  const record = asRecord(rawEvent);
  const eventType = getString(record, "type");
  const properties = asRecord(record?.properties);

  if (eventType === "session.status" && properties?.sessionID === sessionId) {
    const status = asRecord(properties.status);
    const statusType = getString(status, "type");

    if (statusType === "busy") {
      return [{ type: "status", message: "OpenCode is working." }] satisfies Array<Omit<BuildEvent, "id" | "sequence">>;
    }

    if (statusType === "idle") {
      return [{ type: "status", message: "OpenCode is idle." }] satisfies Array<Omit<BuildEvent, "id" | "sequence">>;
    }
  }

  if (eventType !== "message.part.updated") {
    return [];
  }

  const part = asRecord(properties?.part);

  if (!part || part.sessionID !== sessionId) {
    return [];
  }

  const partId = getString(part, "id") ?? "";
  const partType = getString(part, "type");

  if (partType === "reasoning") {
    const fullText = getString(part, "text") ?? "";
    const explicitDelta = getString(properties, "delta") ?? "";
    const previousText = reasoningTextByPartId.get(partId) ?? "";
    const fallbackDelta = fullText.startsWith(previousText) ? fullText.slice(previousText.length) : fullText;
    const text = explicitDelta || fallbackDelta;
    reasoningTextByPartId.set(partId, fullText);

    return text
      ? [
          {
            type: "reasoning_delta",
            message: text,
            payload: { text },
          } satisfies Omit<BuildEvent, "id" | "sequence">,
        ]
      : [];
  }

  if (partType === "tool") {
    return mapToolPart(part, partId, toolStatusByPartId, workspaceRoot);
  }

  if (partType === "file") {
    const file = getFileReference(part, workspaceRoot);

    return file
      ? [
          {
            type: "file_access",
            message: `Read ${file.path}.`,
            payload: { files: [file] },
          } satisfies Omit<BuildEvent, "id" | "sequence">,
        ]
      : [];
  }

  if (partType === "step-start") {
    return [{ type: "status", message: "Started a reasoning step." }] satisfies Array<
      Omit<BuildEvent, "id" | "sequence">
    >;
  }

  if (partType === "step-finish") {
    const reason = getString(part, "reason");
    return [
      {
        type: "status",
        message: reason ? `Finished a reasoning step: ${reason}.` : "Finished a reasoning step.",
        payload: {
          tokens: getStepTokens(part),
          cost: typeof part.cost === "number" ? part.cost : undefined,
        },
      } satisfies Omit<BuildEvent, "id" | "sequence">,
    ];
  }

  return [];
}

function mapToolPart(
  part: Record<string, unknown>,
  partId: string,
  toolStatusByPartId: Map<string, string>,
  workspaceRoot: string | undefined,
) {
  const state = asRecord(part.state);
  const status = getString(state, "status");

  if (!status) {
    return [];
  }

  const previousStatus = toolStatusByPartId.get(partId);

  if (previousStatus === status) {
    return [];
  }

  toolStatusByPartId.set(partId, status);

  const toolName = getString(part, "tool") ?? "tool";
  const toolUseId = getString(part, "callID") ?? partId;
  const label = getToolLabel(part, toolName);
  const metadata = getToolMetadata(toolName, state, workspaceRoot);
  const toolPayload = {
    toolName,
    toolUseId,
    label,
    ...metadata,
  };
  const events: Array<Omit<BuildEvent, "id" | "sequence">> = [];

  if (status === "pending" || status === "running") {
    events.push({
      type: previousStatus ? "tool_progress" : "tool_start",
      message: label,
      payload: toolPayload,
    });
  } else if (status === "completed") {
    events.push({
      type: "tool_finish",
      message: label,
      payload: toolPayload,
    });
  } else if (status === "error") {
    events.push({
      type: "tool_error",
      message: getString(state, "error") ?? label,
      payload: toolPayload,
    });
  }

  if (metadata.files.length > 0) {
    events.push({
      type: "file_access",
      message: `${metadata.operation === "command" ? "Referenced" : "Used"} ${metadata.files.length} file path${
        metadata.files.length === 1 ? "" : "s"
      }.`,
      payload: { files: metadata.files, toolName, toolUseId },
    });
  }

  if (metadata.operation === "command" && metadata.inputSummary) {
    events.push({
      type: "command",
      message: metadata.inputSummary,
      payload: { toolName, toolUseId, command: metadata.inputSummary },
    });
  }

  return events;
}

function getToolMetadata(
  toolName: string,
  state: Record<string, unknown> | null,
  workspaceRoot: string | undefined,
) {
  const input = asRecord(state?.input) ?? {};
  const operation = inferToolOperation(toolName);
  const files = extractInputFiles(input, operation, workspaceRoot);
  const output = getString(state, "output");
  const error = getString(state, "error");

  return {
    status: getString(state, "status") ?? undefined,
    operation,
    inputSummary: getInputSummary(toolName, input, getString(state, "raw"), workspaceRoot),
    outputSummary: output ? truncateSummary(output) : undefined,
    elapsedMs: getStateElapsedMs(state),
    files,
    error: error ?? undefined,
  };
}

function getInputSummary(
  toolName: string,
  input: Record<string, unknown>,
  raw: string | null,
  workspaceRoot: string | undefined,
) {
  const summaryFields = ["path", "filePath", "filepath", "pattern", "query", "command", "cmd", "directory"];
  const pathFields = new Set(["path", "filePath", "filepath", "directory"]);
  const parts: string[] = [];

  for (const key of summaryFields) {
    const value = input[key];

    if (typeof value === "string" && value.trim()) {
      if (pathFields.has(key)) {
        const path = normalizeTracePath(value, workspaceRoot);

        if (path) {
          parts.push(`${key}: ${truncateSummary(path, 80)}`);
        }

        continue;
      }

      parts.push(`${key}: ${truncateSummary(value, 80)}`);
    }
  }

  return parts.join(" | ") || (raw ? truncateSummary(raw) : toolName);
}

function extractInputFiles(
  input: Record<string, unknown>,
  operation: TraceFileOperation,
  workspaceRoot: string | undefined,
) {
  const pathKeys = ["path", "file", "files", "filePath", "filepath", "filename", "paths", "directory", "dir", "cwd"];
  const files: TraceFileReference[] = [];

  for (const key of pathKeys) {
    for (const value of collectStrings(input[key])) {
      const path = normalizeTracePath(value, workspaceRoot);

      if (path) {
        files.push({ path, operation, source: key });
      }
    }
  }

  return uniqueFiles(files);
}

function getFileReference(
  part: Record<string, unknown>,
  workspaceRoot: string | undefined,
): TraceFileReference | null {
  const source = asRecord(part.source);
  const range = asRecord(source?.range);
  const rangeStart = asRecord(range?.start);
  const rangeEnd = asRecord(range?.end);
  const rawPath = getString(source, "path") ?? getString(part, "filename") ?? getString(part, "url");
  const path = rawPath ? normalizeTracePath(rawPath, workspaceRoot) : null;

  if (!path) {
    return null;
  }

  return {
    path,
    operation: "read",
    lineStart: typeof rangeStart?.line === "number" ? rangeStart.line : undefined,
    lineEnd: typeof rangeEnd?.line === "number" ? rangeEnd.line : undefined,
    source: getString(source, "type") ?? "file",
  };
}

function inferToolOperation(toolName: string): TraceFileOperation {
  const normalized = toolName.toLowerCase();

  if (/read|view|cat|open/.test(normalized)) return "read";
  if (/grep|search|find|glob/.test(normalized)) return "search";
  if (/list|ls|tree/.test(normalized)) return "list";
  if (/write|edit|patch|create/.test(normalized)) return "write";
  if (/bash|shell|command/.test(normalized)) return "command";
  return "unknown";
}

function normalizeTracePath(value: string, workspaceRoot: string | undefined) {
  const normalized = value.trim().replace(/^file:\/\//, "").replaceAll("\\", "/");

  if (!normalized || normalized.includes("\n")) {
    return null;
  }

  if (isAbsolute(normalized)) {
    if (!workspaceRoot) {
      return null;
    }

    const absolutePath = resolve(normalized);
    const relativePath = relative(workspaceRoot, absolutePath);

    if (!isInsideRelativePath(relativePath)) {
      return null;
    }

    return relativePath || ".";
  }

  if (normalized.startsWith("..") || normalized.includes("/../")) {
    return null;
  }

  return normalized;
}

function isInsideRelativePath(value: string) {
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function getToolLabel(part: Record<string, unknown>, fallback: string) {
  const state = asRecord(part.state);
  return getString(state, "title") ?? fallback;
}

function getStepTokens(part: Record<string, unknown>) {
  const tokens = asRecord(part.tokens);
  const cache = asRecord(tokens?.cache);
  const input = getNumber(tokens, "input");
  const output = getNumber(tokens, "output");
  const reasoning = getNumber(tokens, "reasoning");
  const cacheRead = getNumber(cache, "read");
  const cacheWrite = getNumber(cache, "write");

  if (input === null || output === null || reasoning === null || cacheRead === null || cacheWrite === null) {
    return undefined;
  }

  return { input, output, reasoning, cacheRead, cacheWrite };
}

function getStateElapsedMs(state: Record<string, unknown> | null) {
  const time = asRecord(state?.time);
  const start = getNumber(time, "start");
  const end = getNumber(time, "end");

  return start !== null && end !== null && end >= start ? Math.round(end - start) : undefined;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  return [];
}

function uniqueFiles(files: TraceFileReference[]) {
  const seen = new Set<string>();

  return files.filter((file) => {
    const key = `${file.operation}:${file.path}:${file.lineStart ?? ""}:${file.lineEnd ?? ""}:${file.source ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function truncateSummary(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getString(value: Record<string, unknown> | null, key: string) {
  const candidate = value?.[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function getNumber(value: Record<string, unknown> | null, key: string) {
  const candidate = value?.[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

type TraceFileOperation = "read" | "search" | "list" | "write" | "command" | "unknown";

type TraceFileReference = {
  path: string;
  operation: TraceFileOperation;
  lineStart?: number;
  lineEnd?: number;
  source?: string;
};
