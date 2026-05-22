import type { BuildEvent } from "../domain";

export type OpenCodePermissions = {
  edit: boolean;
  shell: boolean;
  web: boolean;
  subagents: boolean;
};

export function permissionConfig(permissions: OpenCodePermissions) {
  return {
    edit: permissions.edit ? "allow" : "deny",
    bash: permissions.shell ? "allow" : "deny",
    webfetch: permissions.web ? "allow" : "deny",
    external_directory: "deny",
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

  return type.replace("_", " ");
}

function isSecretKey(key: string) {
  return /token|secret|authorization|cookie|password|credential|refresh|access/i.test(key);
}

function looksSecretish(value: string) {
  return /bearer\s+[a-z0-9._-]+|gh[oapsu]_[a-z0-9_]+|sk-[a-z0-9_-]+/i.test(value);
}
