import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  generationJobs,
  githubRepositories,
  projectArtifacts,
  projectSessionStates,
  projects,
} from "@/db/schema";
import type {
  ArtifactType,
  ChatProjectSummary,
  NextAction,
  Project,
  ProjectArtifact,
  ProjectSessionState,
  SessionReadiness,
  SessionStage,
} from "@/lib/domain";
import {
  chatProjectSummarySchema,
  chatTurnResultSchema,
  nextActionSchema,
  type ChatTurnResult,
} from "@/lib/schemas";
import {
  ensureLocalUser,
  getGitHubConnection,
  localUserId,
  persistGitHubRepository,
} from "@/lib/server/auth-store";
import { decryptSecret } from "@/lib/server/crypto";
import { createRepository, GitHubApiError } from "@/lib/services/github";
import { createGitHubIssues, createStarterFiles } from "@/lib/services/starter-files";

const requiredSummaryFields = [
  "productName",
  "targetUser",
  "problem",
  "smallestUsefulVersion",
  "scopeLevel",
  "repoPreference",
  "buildPreference",
] as const;

export function defaultNextAction(stage: SessionStage): NextAction {
  if (stage === "ready_for_spec") return { type: "generate_spec", label: "Generate spec" };
  if (stage === "spec_ready") return { type: "submit_spec", label: "Submit spec" };
  if (stage === "building") return { type: "view_build", label: "View build" };
  if (stage === "built" || stage === "handoff_ready") return { type: "view_build", label: "View build" };
  if (stage === "repo_created") return { type: "open_repo", label: "Open repo" };

  return { type: "ask_question", label: "Answer question" };
}

export function getProjectSessionState(projectId: string) {
  const row = getDb()
    .select()
    .from(projectSessionStates)
    .where(eq(projectSessionStates.projectId, projectId))
    .get();

  return row ? sessionStateFromRow(row) : undefined;
}

export function getOrCreateProjectSessionState(project: Project) {
  return getProjectSessionState(project.id) ?? upsertProjectSessionState({
    projectId: project.id,
    stage: "clarifying",
    readiness: "clarifying",
    missingFields: [...requiredSummaryFields],
    repoRequested: null,
    buildRequested: null,
    nextAction: defaultNextAction("clarifying"),
  });
}

export function upsertProjectSessionState(input: {
  projectId: string;
  stage: SessionStage;
  readiness: SessionReadiness;
  summary?: ChatProjectSummary | null;
  missingFields: string[];
  repoRequested?: boolean | null;
  buildRequested?: boolean | null;
  nextAction: NextAction;
}) {
  const now = new Date();
  const existing = getDb()
    .select({ createdAt: projectSessionStates.createdAt })
    .from(projectSessionStates)
    .where(eq(projectSessionStates.projectId, input.projectId))
    .get();

  getDb()
    .insert(projectSessionStates)
    .values({
      projectId: input.projectId,
      stage: input.stage,
      readiness: input.readiness,
      summary: input.summary ?? null,
      missingFields: input.missingFields,
      repoRequested: input.repoRequested ?? null,
      buildRequested: input.buildRequested ?? null,
      nextAction: input.nextAction,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projectSessionStates.projectId,
      set: {
        stage: input.stage,
        readiness: input.readiness,
        summary: input.summary ?? null,
        missingFields: input.missingFields,
        repoRequested: input.repoRequested ?? null,
        buildRequested: input.buildRequested ?? null,
        nextAction: input.nextAction,
        updatedAt: now,
      },
    })
    .run();

  return getProjectSessionState(input.projectId)!;
}

export function normalizeChatTurnResult(projectId: string, output: unknown) {
  const result = chatTurnResultSchema.parse(output);
  const summary = chatProjectSummarySchema.parse({
    ...result.summary,
    buildRequested: result.summary.buildRequested ?? true,
  });
  const missingFields = missingRequiredSummaryFields(summary, result.missingFields);
  const readiness: SessionReadiness =
    missingFields.length === 0 ? "ready_for_spec" : "clarifying";
  const stage: SessionStage = readiness === "ready_for_spec" ? "ready_for_spec" : "clarifying";
  const nextAction = defaultNextAction(stage);

  return {
    ...result,
    summary,
    missingFields,
    readiness,
    nextAction,
    sessionState: {
      projectId,
      stage,
      readiness,
      summary,
      missingFields,
      repoRequested: summary.repoRequested ?? null,
      buildRequested: summary.buildRequested ?? null,
      nextAction,
    },
  } satisfies ChatTurnResult & {
    sessionState: Parameters<typeof upsertProjectSessionState>[0];
  };
}

export function missingRequiredSummaryFields(
  summary: Partial<ChatProjectSummary> | undefined,
  suggestedMissing: string[] = [],
) {
  const missing = new Set<string>();

  if (!summary?.productName?.trim()) missing.add("productName");
  if (!summary?.targetUser?.trim()) missing.add("targetUser");
  if (!summary?.problem?.trim()) missing.add("problem");
  if (!summary?.smallestUsefulVersion?.trim()) missing.add("smallestUsefulVersion");
  if (!summary?.scopeLevel) missing.add("scopeLevel");
  if (typeof summary?.repoRequested !== "boolean") missing.add("repoPreference");
  if (typeof summary?.buildRequested !== "boolean") missing.add("buildPreference");

  for (const field of suggestedMissing) {
    if ((requiredSummaryFields as readonly string[]).includes(field)) {
      missing.add(field);
    }
  }

  return [...missing];
}

export function markSessionSpecReady(projectId: string, summary: ChatProjectSummary) {
  return upsertProjectSessionState({
    projectId,
    stage: "spec_ready",
    readiness: "ready_for_spec",
    summary,
    missingFields: [],
    repoRequested: summary.repoRequested ?? null,
    buildRequested: summary.buildRequested ?? true,
    nextAction: defaultNextAction("spec_ready"),
  });
}

export function markSessionBuilding(projectId: string) {
  const current = getProjectSessionState(projectId);

  return upsertProjectSessionState({
    projectId,
    stage: "building",
    readiness: "ready_for_spec",
    summary: current?.summary,
    missingFields: [],
    repoRequested: current?.repoRequested ?? null,
    buildRequested: current?.buildRequested ?? true,
    nextAction: defaultNextAction("building"),
  });
}

export function markSessionBuilt(projectId: string, nextAction: NextAction = { type: "connect_github", label: "Connect GitHub" }) {
  const current = getProjectSessionState(projectId);

  return upsertProjectSessionState({
    projectId,
    stage: "built",
    readiness: "ready_for_spec",
    summary: current?.summary,
    missingFields: [],
    repoRequested: current?.repoRequested ?? null,
    buildRequested: current?.buildRequested ?? true,
    nextAction,
  });
}

export function markSessionBuildStopped(projectId: string) {
  const current = getProjectSessionState(projectId);

  return upsertProjectSessionState({
    projectId,
    stage: "spec_ready",
    readiness: "ready_for_spec",
    summary: current?.summary,
    missingFields: [],
    repoRequested: current?.repoRequested ?? null,
    buildRequested: current?.buildRequested ?? true,
    nextAction: defaultNextAction("spec_ready"),
  });
}

export function saveArtifactVersion(input: {
  projectId: string;
  type: ArtifactType;
  title: string;
  content: string;
}) {
  const now = new Date();
  const latest = getLatestArtifact(input.projectId, input.type);
  const version = (latest?.version ?? 0) + 1;
  const artifact = {
    id: `${input.projectId}:${input.type}:v${version}`,
    projectId: input.projectId,
    type: input.type,
    title: input.title,
    content: input.content,
    version,
    createdAt: now,
    updatedAt: now,
  };

  getDb().insert(projectArtifacts).values(artifact).run();

  return artifactFromRow(artifact);
}

export function getLatestArtifact(projectId: string, type: ArtifactType) {
  const row = getDb()
    .select()
    .from(projectArtifacts)
    .where(and(eq(projectArtifacts.projectId, projectId), eq(projectArtifacts.type, type)))
    .orderBy(desc(projectArtifacts.version), desc(projectArtifacts.updatedAt))
    .limit(1)
    .get();

  return row ? artifactFromRow(row) : undefined;
}

export function getLatestProjectBuildJob(projectId: string) {
  return getDb()
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.projectId, projectId), eq(generationJobs.type, "opencode_build")))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1)
    .get();
}

export function getProjectRepository(projectId: string) {
  return getDb()
    .select()
    .from(githubRepositories)
    .where(eq(githubRepositories.projectId, projectId))
    .orderBy(desc(githubRepositories.createdAt))
    .limit(1)
    .get();
}

export async function reconcileCompletedBuild(project: Project) {
  const latestJob = getLatestProjectBuildJob(project.id);
  const sessionState = getProjectSessionState(project.id);

  if (!sessionState || latestJob?.status !== "succeeded" || sessionState.stage !== "building") {
    return sessionState;
  }

  if (!sessionState.repoRequested) {
    return upsertProjectSessionState({
      projectId: project.id,
      stage: "handoff_ready",
      readiness: "ready_for_spec",
      summary: sessionState.summary,
      missingFields: [],
      repoRequested: false,
      buildRequested: sessionState.buildRequested ?? true,
      nextAction: defaultNextAction("handoff_ready"),
    });
  }

  const existingRepository = getProjectRepository(project.id);
  if (existingRepository) {
    return upsertProjectSessionState({
      projectId: project.id,
      stage: "repo_created",
      readiness: "ready_for_spec",
      summary: sessionState.summary,
      missingFields: [],
      repoRequested: true,
      buildRequested: sessionState.buildRequested ?? true,
      nextAction: defaultNextAction("repo_created"),
    });
  }

  const connection = getGitHubConnection();
  if (!connection?.accessTokenEncrypted) {
    return markSessionBuilt(project.id);
  }

  try {
    const repository = await createRepository({
      token: decryptSecret(connection.accessTokenEncrypted),
      name: project.slug,
      description: project.oneLiner,
      visibility: "private",
      files: createStarterFiles(project),
      issues: createGitHubIssues(project),
    });

    persistGitHubRepository({
      projectId: project.id,
      githubRepoId: String(repository.id),
      owner: repository.owner,
      name: repository.name,
      url: repository.url,
      visibility: "private",
      defaultBranch: repository.defaultBranch,
    });

    return upsertProjectSessionState({
      projectId: project.id,
      stage: "repo_created",
      readiness: "ready_for_spec",
      summary: sessionState.summary,
      missingFields: [],
      repoRequested: true,
      buildRequested: sessionState.buildRequested ?? true,
      nextAction: defaultNextAction("repo_created"),
    });
  } catch (error) {
    return markSessionBuilt(
      project.id,
      error instanceof GitHubApiError && error.code === "repo_exists"
        ? { type: "connect_github", label: "Choose repo name" }
        : { type: "connect_github", label: "Connect GitHub" },
    );
  }
}

export function touchProjectFromSummary(projectId: string, summary: ChatProjectSummary) {
  ensureLocalUser();
  const now = new Date();

  getDb()
    .update(projects)
    .set({
      name: summary.productName,
      slug: slugify(summary.productName),
      oneLiner: summary.oneLiner,
      scopeLevel: summary.scopeLevel ?? "MVP",
      status: "active",
      updatedAt: now,
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, localUserId)))
    .run();
}

function sessionStateFromRow(row: typeof projectSessionStates.$inferSelect): ProjectSessionState {
  const nextAction = nextActionSchema.parse(row.nextAction);

  return {
    projectId: row.projectId,
    stage: row.stage as SessionStage,
    readiness: row.readiness as SessionReadiness,
    summary: row.summary ? chatProjectSummarySchema.parse(row.summary) : undefined,
    missingFields: Array.isArray(row.missingFields) ? row.missingFields.map(String) : [],
    repoRequested: row.repoRequested,
    buildRequested: row.buildRequested,
    nextAction,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function artifactFromRow(row: typeof projectArtifacts.$inferSelect): ProjectArtifact {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as ArtifactType,
    title: row.title,
    content: row.content,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";
}
