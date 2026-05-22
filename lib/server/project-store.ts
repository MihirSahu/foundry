import "server-only";

import { count, desc, eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { messages, projectArtifacts, projects as projectsTable } from "@/db/schema";
import {
  renderAgents,
  renderBuildPlan,
  renderHandoffPrompt,
  renderPrd,
} from "@/lib/artifact-renderers";
import type { Message, Project, ProjectArtifact, ScopeLevel } from "@/lib/domain";
import { activeProject, artifacts, brainstormMessages, projects } from "@/lib/mock-data";
import { ensureLocalUser, localUserId } from "@/lib/server/auth-store";

export function seedDefaultProjects() {
  ensureLocalUser();

  const existing = getDb().select({ value: count() }).from(projectsTable).get();

  if ((existing?.value ?? 0) > 0) {
    return;
  }

  for (const project of projects) {
    upsertProject(project);
  }

  for (const artifact of artifacts) {
    upsertArtifact(artifact);
  }

  for (const message of brainstormMessages) {
    addMessage(activeProject.id, message.role, message.content, message.id, new Date(message.createdAt));
  }
}

export function listProjects() {
  seedDefaultProjects();

  return getDb()
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, localUserId))
    .orderBy(desc(projectsTable.updatedAt))
    .all()
    .map(projectFromRow);
}

export function getProject(projectId: string) {
  seedDefaultProjects();

  const row = getDb()
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, localUserId)))
    .get();

  return row ? projectFromRow(row) : undefined;
}

export function createProjectFromIdea(input: {
  idea: string;
  name?: string;
  scopeLevel?: ScopeLevel;
}) {
  const now = new Date();
  const name = input.name?.trim() || titleFromIdea(input.idea);
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    slug: slugify(name),
    oneLiner: input.idea.trim(),
    status: "draft",
    stage: "Idea",
    scopeLevel: input.scopeLevel ?? "MVP",
    updatedAt: now.toISOString(),
  };

  upsertProject(project, now);
  addMessage(project.id, "user", input.idea.trim(), crypto.randomUUID(), now);
  createDefaultArtifacts(project);

  return project;
}

export function upsertProject(project: Project, timestamp = new Date()) {
  ensureLocalUser();

  getDb()
    .insert(projectsTable)
    .values({
      id: project.id,
      userId: localUserId,
      name: project.name,
      slug: project.slug,
      oneLiner: project.oneLiner,
      status: project.status,
      scopeLevel: project.scopeLevel,
      repoUrl: project.repoUrl ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: projectsTable.id,
      set: {
        name: project.name,
        slug: project.slug,
        oneLiner: project.oneLiner,
        status: project.status,
        scopeLevel: project.scopeLevel,
        ...(project.repoUrl ? { repoUrl: project.repoUrl } : {}),
        updatedAt: timestamp,
      },
    })
    .run();
}

export function listArtifacts(projectId: string) {
  seedDefaultProjects();

  return getDb()
    .select()
    .from(projectArtifacts)
    .where(eq(projectArtifacts.projectId, projectId))
    .orderBy(desc(projectArtifacts.updatedAt))
    .all()
    .map(artifactFromRow);
}

export function upsertArtifact(artifact: ProjectArtifact, timestamp = new Date()) {
  getDb()
    .insert(projectArtifacts)
    .values({
      id: artifact.id,
      projectId: artifact.projectId,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      version: artifact.version,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: projectArtifacts.id,
      set: {
        title: artifact.title,
        content: artifact.content,
        version: artifact.version,
        updatedAt: timestamp,
      },
    })
    .run();
}

export function listMessages(projectId: string) {
  seedDefaultProjects();

  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(messages.createdAt)
    .all()
    .map((row) => ({
      id: row.id,
      role: row.role as Message["role"],
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
}

export function addMessage(
  projectId: string,
  role: Message["role"],
  content: string,
  id = crypto.randomUUID(),
  timestamp = new Date(),
) {
  getDb()
    .insert(messages)
    .values({
      id,
      projectId,
      role,
      content,
      createdAt: timestamp,
    })
    .onConflictDoNothing()
    .run();
}

export function createDefaultArtifacts(project: Project) {
  const now = new Date();
  const defaultArtifacts: ProjectArtifact[] = [
    {
      id: `${project.id}:prd`,
      projectId: project.id,
      type: "prd",
      title: "PRD.md",
      content: renderPrd(project),
      version: 1,
      updatedAt: now.toISOString(),
    },
    {
      id: `${project.id}:build-plan`,
      projectId: project.id,
      type: "build_plan",
      title: "Implementation Plan",
      content: renderBuildPlan(project, project.scopeLevel),
      version: 1,
      updatedAt: now.toISOString(),
    },
    {
      id: `${project.id}:agents`,
      projectId: project.id,
      type: "agents_md",
      title: "AGENTS.md",
      content: renderAgents(project),
      version: 1,
      updatedAt: now.toISOString(),
    },
    {
      id: `${project.id}:handoff`,
      projectId: project.id,
      type: "handoff_prompt",
      title: "Codex Handoff Prompt",
      content: renderHandoffPrompt(project),
      version: 1,
      updatedAt: now.toISOString(),
    },
  ];

  for (const artifact of defaultArtifacts) {
    upsertArtifact(artifact, now);
  }

  return defaultArtifacts;
}

function projectFromRow(row: typeof projectsTable.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    oneLiner: row.oneLiner,
    status: row.status as Project["status"],
    stage: row.repoUrl ? "Repo Created" : "Build Plan",
    scopeLevel: row.scopeLevel as ScopeLevel,
    repoUrl: row.repoUrl ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function artifactFromRow(row: typeof projectArtifacts.$inferSelect): ProjectArtifact {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as ProjectArtifact["type"],
    title: row.title,
    content: row.content,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function titleFromIdea(idea: string) {
  const words = idea
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);

  return words.length ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : "New Project";
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "new-project"
  );
}
