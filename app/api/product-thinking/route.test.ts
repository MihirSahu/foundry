import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

describe("product-thinking route", () => {
  it("rejects invalid generation requests", async () => {
    vi.resetModules();
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/product-thinking", {
        method: "POST",
        body: JSON.stringify({ mode: "question", idea: "" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("generates question, summary, build plan, PRD, and handoff responses", async () => {
    vi.resetModules();
    vi.doMock("@/lib/services/product-thinking", () => ({
      createConduitProductThinkingService: vi.fn(async () => ({
        nextQuestion: vi.fn(async () => "Who needs this first?"),
        extractSummary: vi.fn(async () => ({
          productName: "Pocket CRM",
          oneLiner: "Tiny CRM",
          problem: "Follow-ups get lost.",
          targetUser: "Solo founders",
          goals: ["Capture leads"],
          nonGoals: ["Enterprise workflows"],
          scopeLevel: "MVP",
          mvpFeatures: ["Lead list"],
          routes: ["/"],
          dataEntities: ["Lead"],
          integrations: ["GitHub"],
          risks: ["Scope creep"],
          openQuestions: ["What fields matter?"],
        })),
        generateImplementationPlan: vi.fn(async () => ({
          stack: ["Next.js"],
          architecture: "App Router",
          fileStructure: ["app/"],
          routes: ["/"],
          components: ["Dashboard"],
          dataSchema: ["Lead"],
          apiSurfaces: ["/api/leads"],
          envVars: [],
          milestones: ["Build"],
          firstTasks: ["Create app"],
          acceptanceCriteria: ["Runs"],
          testPlan: ["pnpm build"],
        })),
      })),
    }));
    const { POST } = await import("./route");

    const question = await post(POST, { mode: "question", idea: "Tiny CRM" });
    const summary = await post(POST, { mode: "summary", idea: "Tiny CRM" });
    const plan = await post(POST, { mode: "build_plan", idea: "Tiny CRM" });
    const prd = await post(POST, { mode: "prd", idea: "Tiny CRM" });
    const handoff = await post(POST, { mode: "handoff", idea: "Tiny CRM" });

    expect(question.text).toBe("Who needs this first?");
    expect(summary.summary.productName).toBe("Pocket CRM");
    expect(plan.plan.stack).toEqual(["Next.js"]);
    expect(prd.markdown).toContain("# Tiny CRM PRD");
    expect(handoff.markdown).toContain("Implement the MVP for Tiny CRM");
  });
});

async function post(POST: (request: NextRequest) => Promise<Response>, body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost:3000/api/product-thinking", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

  return response.json();
}
