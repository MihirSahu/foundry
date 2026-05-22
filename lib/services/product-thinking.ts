import "server-only";
import {
  implementationPlanSchema,
  projectSummarySchema,
  type ImplementationPlan,
  type ProjectSummary,
} from "@/lib/schemas";

type ProductThinkingInput = {
  idea: string;
  conversation?: Array<{ role: "assistant" | "user"; content: string }>;
};

type ProviderLike = {
  generateText: (input: unknown) => Promise<{ text?: string } | string>;
  streamText: (input: unknown) => AsyncIterable<unknown>;
  generateStructured: <T>(input: unknown) => Promise<T>;
};

export class ProductThinkingService {
  constructor(private readonly provider: ProviderLike) {}

  async nextQuestion(input: ProductThinkingInput) {
    const result = await this.provider.generateText({
      prompt: `Ask one concise product-shaping question for this MVP idea:\n\n${input.idea}`,
      messages: input.conversation,
    });

    return typeof result === "string" ? result : result.text ?? "";
  }

  streamBrainstorm(input: ProductThinkingInput) {
    return this.provider.streamText({
      prompt: `Guide the user toward the smallest useful version of this idea:\n\n${input.idea}`,
      messages: input.conversation,
    });
  }

  async extractSummary(input: ProductThinkingInput): Promise<ProjectSummary> {
    const output = await this.provider.generateStructured<ProjectSummary>({
      schema: projectSummarySchema,
      prompt: `Extract a structured Foundry product summary from this idea and conversation:\n\n${input.idea}`,
      messages: input.conversation,
    });

    return projectSummarySchema.parse(output);
  }

  async generateImplementationPlan(summary: ProjectSummary): Promise<ImplementationPlan> {
    const output = await this.provider.generateStructured<ImplementationPlan>({
      schema: implementationPlanSchema,
      prompt: `Generate a small, Codex-ready implementation plan for this scoped product:\n\n${JSON.stringify(summary)}`,
    });

    return implementationPlanSchema.parse(output);
  }
}

export async function createConduitProductThinkingService() {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<typeof import("@conduit-llm/provider-chatgpt")>;
    const conduit = await dynamicImport("@conduit-llm/provider-chatgpt");
    const storage = await conduit.createDefaultStorage();
    const session = new conduit.ChatGPTSession({ storage });
    const provider = new conduit.ChatGPTProvider({ session });

    return new ProductThinkingService(provider as ProviderLike);
  } catch {
    return new ProductThinkingService(new HeuristicProductProvider());
  }
}

class HeuristicProductProvider implements ProviderLike {
  async generateText(input: unknown) {
    const idea = getPrompt(input);
    return {
      text: `What is the smallest version of this that would still prove value for the target user? ${idea ? "I’ll keep the scope anchored to that." : ""}`,
    };
  }

  async *streamText(input: unknown) {
    yield { type: "text_delta", text: (await this.generateText(input)).text };
  }

  async generateStructured<T>(input: unknown): Promise<T> {
    const prompt = getPrompt(input);
    const idea = prompt.split("\n").filter(Boolean).at(-1) ?? "New product idea";

    if (prompt.toLowerCase().includes("implementation plan")) {
      return implementationPlanSchema.parse({
        stack: ["Next.js App Router", "TypeScript", "Tailwind CSS", "SQLite + Drizzle", "pnpm"],
        architecture:
          "A mobile-first App Router application with server route handlers for persistence, artifacts, GitHub repo creation, and optional build-worker streaming.",
        fileStructure: [
          "app/",
          "components/",
          "lib/services/",
          "lib/server/",
          "db/schema.ts",
          "docs/",
        ],
        routes: ["/", "/api/projects", "/api/github/repos"],
        components: ["Project dashboard", "Brainstorm chat", "Artifact viewer", "Repo setup"],
        dataSchema: ["Project", "Message", "ProjectArtifact", "GitHubRepository", "GenerationJob"],
        apiSurfaces: ["Project CRUD", "Product-thinking generation", "GitHub repo creation"],
        envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"],
        milestones: [
          "Persist projects and artifacts",
          "Generate PRD and build plan",
          "Create GitHub repo with starter files",
          "Prepare Codex/OpenCode handoff",
        ],
        firstTasks: [
          "Build the app shell",
          "Implement the core data model",
          "Wire repo creation",
          "Verify mobile flow",
        ],
        acceptanceCriteria: [
          "Generated repo contains README.md, PRD.md, AGENTS.md, docs, and starter app files.",
          "No tokens are exposed to the browser.",
        ],
        testPlan: ["pnpm lint", "pnpm typecheck", "pnpm build"],
      }) as T;
    }

    return projectSummarySchema.parse({
      productName: titleFromIdea(idea),
      oneLiner: idea,
      problem: "The user has a rough product idea but needs a scoped, buildable MVP.",
      targetUser: "Solo technical builder",
      goals: ["Clarify the MVP", "Generate PRD artifacts", "Prepare a Codex-ready repo"],
      nonGoals: ["Full IDE behavior", "Autonomous production deployment"],
      scopeLevel: "MVP",
      mvpFeatures: ["Idea capture", "Guided brainstorming", "PRD generation", "Repo handoff"],
      routes: ["/", "/api/projects", "/api/github/repos"],
      dataEntities: ["Project", "Message", "ProjectArtifact"],
      integrations: ["GitHub", "Conduit"],
      risks: ["Scope creep", "Subscription auth brittleness"],
      openQuestions: ["What should be explicitly out of scope?"],
    }) as T;
  }
}

function getPrompt(input: unknown) {
  if (input && typeof input === "object" && "prompt" in input) {
    return String(input.prompt);
  }

  return "";
}

function titleFromIdea(idea: string) {
  return idea
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ") || "New Project";
}
