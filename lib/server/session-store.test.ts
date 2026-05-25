import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("session store readiness", () => {
  it("keeps incomplete LLM output in clarifying state", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { normalizeChatTurnResult } = await import("./session-store");

    const result = normalizeChatTurnResult("project-1", {
      assistantMessage: "Who is this for?",
      readiness: "ready_for_spec",
      summary: {
        productName: "Pocket CRM",
        oneLiner: "Tiny CRM",
        problem: "Follow-ups get lost.",
        targetUser: "",
        smallestUsefulVersion: "",
        goals: ["Capture leads"],
        nonGoals: [],
        scopeLevel: "MVP",
        mvpFeatures: ["Lead list"],
        routes: [],
        dataEntities: [],
        integrations: [],
        risks: [],
        openQuestions: [],
        repoRequested: null,
        buildRequested: null,
      },
      missingFields: [],
      nextAction: { type: "generate_spec", label: "Generate spec" },
    });

    expect(result.readiness).toBe("clarifying");
    expect(result.nextAction.type).toBe("ask_question");
    expect(result.missingFields).toContain("targetUser");
    expect(result.missingFields).toContain("repoPreference");
  });

  it("promotes complete structured state to ready_for_spec", async () => {
    vi.resetModules();
    vi.stubEnv("FOUNDRY_DATABASE_URL", tempDatabaseUrl());
    const { normalizeChatTurnResult } = await import("./session-store");

    const result = normalizeChatTurnResult("project-1", {
      assistantMessage: "I can draft the spec now.",
      readiness: "clarifying",
      summary: {
        productName: "Pocket CRM",
        oneLiner: "Tiny CRM",
        problem: "Follow-ups get lost.",
        targetUser: "Solo founders",
        smallestUsefulVersion: "A lead list with reminders.",
        goals: ["Capture leads"],
        nonGoals: [],
        scopeLevel: "MVP",
        mvpFeatures: ["Lead list"],
        routes: [],
        dataEntities: [],
        integrations: [],
        risks: [],
        openQuestions: [],
        repoRequested: true,
        buildRequested: true,
      },
      missingFields: [],
      nextAction: { type: "ask_question", label: "Ask question" },
    });

    expect(result.readiness).toBe("ready_for_spec");
    expect(result.nextAction.type).toBe("generate_spec");
    expect(result.missingFields).toEqual([]);
  });
});

function tempDatabaseUrl() {
  return `file:${join(mkdtempSync(join(tmpdir(), "foundry-session-store-")), "foundry.sqlite")}`;
}
