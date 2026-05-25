import "server-only";
import { z, type ZodType } from "zod";
import {
  chatTurnResultSchema,
  implementationPlanSchema,
  projectSummarySchema,
  type ChatTurnResult,
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

const responseFormatMetadataKey = "__conduitResponseFormat";

let cachedServicePromise: Promise<ProductThinkingService> | null = null;

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
    const output = await this.generateStrictStructured(projectSummarySchema, {
      prompt: `Extract a structured Foundry product summary from this idea and conversation:\n\n${input.idea}`,
      conversation: input.conversation,
    });

    return projectSummarySchema.parse(output);
  }

  async runChatTurn(input: ProductThinkingInput): Promise<ChatTurnResult> {
    const output = await this.generateStrictStructured(chatTurnResultSchema, {
      prompt: `You are Foundry's product-shaping layer. Continue this product session with one concise assistant reply. Extract structured state for the smallest useful MVP. Return ready_for_spec only when the summary has a working title, target user, problem, smallest useful version, MVP scope, repo preference, and build preference.\n\nIdea:\n${input.idea}`,
      conversation: input.conversation,
    });

    return chatTurnResultSchema.parse(output);
  }

  async generateImplementationPlan(summary: ProjectSummary): Promise<ImplementationPlan> {
    const output = await this.generateStrictStructured(implementationPlanSchema, {
      prompt: `Generate a small, Codex-ready implementation plan for this scoped product:\n\n${JSON.stringify(summary)}`,
    });

    return implementationPlanSchema.parse(output);
  }

  private async generateStrictStructured<T>(
    schema: ZodType<T>,
    input: { prompt: string; conversation?: ProductThinkingInput["conversation"] },
  ): Promise<T> {
    if (this.provider instanceof HeuristicProductProvider) {
      return this.provider.generateStructured<T>({
        schema,
        prompt: input.prompt,
        messages: input.conversation,
      });
    }

    const result = await this.provider.generateText({
      messages: input.conversation?.length
        ? input.conversation
        : [{ role: "user", content: input.prompt }],
      ...(input.conversation?.length ? { systemAppendix: input.prompt } : {}),
      metadata: {
        [responseFormatMetadataKey]: zodToStrictResponseFormat(schema),
      },
    });
    const text = typeof result === "string" ? result : result.text ?? "";

    return schema.parse(JSON.parse(text));
  }
}

export async function createConduitProductThinkingService() {
  cachedServicePromise ??= createProductThinkingService();
  return cachedServicePromise;
}

async function createProductThinkingService() {
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
    const messages = getMessages(input);
    const idea = prompt.split("\n").filter(Boolean).at(-1) ?? "New product idea";
    const conversationText = messages.map((message) => message.content).join("\n");

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

    if (prompt.toLowerCase().includes("product-shaping layer")) {
      const source = conversationText || idea;
      const ready = looksReadyForSpec(source);
      const repoRequested = /\brepo|github|repository\b/i.test(source);
      const buildRequested = /\bbuild|opencode|codex|implement\b/i.test(source);
      const summary = {
        productName: titleFromIdea(source),
        oneLiner: source || idea,
        problem: ready
          ? "The target user needs a faster way to turn rough ideas into buildable MVP context."
          : "The user has a rough product idea but needs a scoped, buildable MVP.",
        targetUser: ready ? "Solo technical builder" : "",
        smallestUsefulVersion: ready
          ? "A chat session that asks clarifying questions, drafts a spec, and starts a build."
          : "",
        goals: ["Clarify the MVP", "Generate PRD artifacts", "Prepare a Codex-ready repo"],
        nonGoals: ["Full IDE behavior", "Autonomous production deployment"],
        scopeLevel: "MVP",
        mvpFeatures: ["Chat-driven clarification", "Spec generation", "Repo handoff"],
        routes: ["/", "/api/projects"],
        dataEntities: ["Project", "Message", "ProjectArtifact"],
        integrations: repoRequested ? ["GitHub", "Conduit", "OpenCode"] : ["Conduit"],
        risks: ["Scope creep", "Subscription auth brittleness"],
        openQuestions: ready ? [] : ["Who is this for?", "What is the smallest useful version?"],
        repoRequested,
        buildRequested,
      };

      return chatTurnResultSchema.parse({
        assistantMessage: ready
          ? "I have enough context to draft the MVP spec. I’ll keep it small and repo-ready."
          : "What is the smallest useful version that would prove this idea for the target user?",
        summary,
        missingFields: ready
          ? []
          : ["targetUser", "smallestUsefulVersion", "repoPreference", "buildPreference"],
        readiness: ready ? "ready_for_spec" : "clarifying",
        nextAction: ready
          ? { type: "generate_spec", label: "Generate spec" }
          : { type: "ask_question", label: "Answer question" },
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

function getMessages(input: unknown) {
  if (input && typeof input === "object" && "messages" in input && Array.isArray(input.messages)) {
    return input.messages.filter(isMessageLike);
  }

  return [];
}

function isMessageLike(value: unknown): value is { role: "assistant" | "user"; content: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "role" in value &&
      (value.role === "assistant" || value.role === "user") &&
      "content" in value &&
      typeof value.content === "string",
  );
}

function looksReadyForSpec(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return (
    words.length >= 18 &&
    /\b(for|user|founder|builder|team|people)\b/i.test(text) &&
    /\b(problem|pain|help|need|solve|turn|create)\b/i.test(text)
  );
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

export function zodToStrictResponseFormat(schema: ZodType<unknown>, name = "StructuredOutput") {
  return {
    name,
    schema: sanitizeStrictJsonSchema(z.toJSONSchema(schema)),
    strict: true,
  };
}

function sanitizeStrictJsonSchema(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeStrictJsonSchema(item));
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "$schema" || key === "$defs" || key === "definitions" || key === "format") {
      continue;
    }

    output[key] = sanitizeStrictJsonSchema(value);
  }

  if (output.type === "object") {
    output.additionalProperties = false;

    if (output.properties && typeof output.properties === "object" && !Array.isArray(output.properties)) {
      output.required = Object.keys(output.properties);
    }
  }

  return output;
}
