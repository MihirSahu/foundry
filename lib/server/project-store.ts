import "server-only";

import { getStatement } from "@/db/client";
import {
  renderAgents,
  renderBuildPlan,
  renderHandoffPrompt,
  renderPrd,
} from "@/lib/artifact-renderers";
import type { Message, Project, ProjectArtifact, ScopeLevel } from "@/lib/domain";
import { activeProject, artifacts, brainstormMessages, projects } from "@/lib/mock-data";
import { ensureLocalUser, localUserId } from "@/lib/server/auth-store";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  oneLiner: string;
  status: Project["status"];
  scopeLevel: ScopeLevel;
  repoUrl: string | null;
  updatedAt: number;
};

type ArtifactRow = {
  id: string;
  projectId: string;
  type: ProjectArtifact["type"];
  title: string;
  content: string;
  version: number;
  updatedAt: number;
};

type MessageRow = {
  id: string;
  role: Message["role"];
  content: string;
  createdAt: number;
};

export function seedDefaultProjects() {
  ensureLocalUser();
  const existing = getStatement<[], { count: number }>("SELECT COUNT(*) AS count FROM projects").get();

  if ((existing?.count ?? 0) > 0) {
    return;
  }

  for (const project of projects) {
    upsertProject(project);
  }

  for (const artifact of artifacts) {
    upsertArtifact(artifact);
  }

  for (const message of brainstormMessages) {
    addMessage(activeProject.id, message.role, message.content, message.id, Date.parse(message.createdAt));
  }
}

export function listProjects() {
  seedDefaultProjects();

  const rows = getStatement<[], ProjectRow>(`
    SELECT
      id,
      name,
      slug,
      one_liner AS oneLiner,
      status,
      scope_level AS scopeLevel,
      repo_url AS repoUrl,
      updated_at AS updatedAt
    FROM projects
    WHERE user_id = '${localUserId}'
    ORDER BY updated_at DESC
  `).all();

  return rows.map(projectFromRow);
}

export function getProject(projectId: string) {
  seedDefaultProjects();

  const row = getStatement<[string], ProjectRow>(`
    SELECT
      id,
      name,
      slug,
      one_liner AS oneLiner,
      status,
      scope_level AS scopeLevel,
      repo_url AS repoUrl,
      updated_at AS updatedAt
    FROM projects
    WHERE id = ? AND user_id = '${localUserId}'
    LIMIT 1
  `).get(projectId);

  return row ? projectFromRow(row) : undefined;
}

export function createProjectFromIdea(input: {
  idea: string;
  name?: string;
  scopeLevel?: ScopeLevel;
}) {
  const now = Date.now();
  const name = input.name?.trim() || titleFromIdea(input.idea);
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    slug: slugify(name),
    oneLiner: input.idea.trim(),
    status: "draft",
    stage: "Idea",
    scopeLevel: input.scopeLevel ?? "MVP",
    updatedAt: new Date(now).toISOString(),
  };

  upsertProject(project, now);
  addMessage(project.id, "user", input.idea.trim(), crypto.randomUUID(), now);
  createDefaultArtifacts(project);

  return project;
}

export function upsertProject(project: Project, timestamp = Date.now()) {
  ensureLocalUser();

  getStatement<[string, string, string, string, string, string, string, string | null, number, number]>(`
    INSERT INTO projects (
      id,
      user_id,
      name,
      slug,
      one_liner,
      status,
      scope_level,
      repo_url,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      one_liner = excluded.one_liner,
      status = excluded.status,
      scope_level = excluded.scope_level,
      repo_url = COALESCE(excluded.repo_url, projects.repo_url),
      updated_at = excluded.updated_at
  `).run(
    project.id,
    localUserId,
    project.name,
    project.slug,
    project.oneLiner,
    project.status,
    project.scopeLevel,
    project.repoUrl ?? null,
    timestamp,
    timestamp,
  );
}

export function listArtifacts(projectId: string) {
  seedDefaultProjects();

  const rows = getStatement<[string], ArtifactRow>(`
    SELECT
      id,
      project_id AS projectId,
      type,
      title,
      content,
      version,
      updated_at AS updatedAt
    FROM project_artifacts
    WHERE project_id = ?
    ORDER BY updated_at DESC
  `).all(projectId);

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    content: row.content,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

export function upsertArtifact(artifact: ProjectArtifact, timestamp = Date.now()) {
  getStatement<[string, string, string, string, string, number, number, number]>(`
    INSERT INTO project_artifacts (
      id,
      project_id,
      type,
      title,
      content,
      version,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      version = excluded.version,
      updated_at = excluded.updated_at
  `).run(
    artifact.id,
    artifact.projectId,
    artifact.type,
    artifact.title,
    artifact.content,
    artifact.version,
    timestamp,
    timestamp,
  );
}

export function listMessages(projectId: string) {
  seedDefaultProjects();

  const rows = getStatement<[string], MessageRow>(`
    SELECT id, role, content, created_at AS createdAt
    FROM messages
    WHERE project_id = ?
    ORDER BY created_at ASC
  `).all(projectId);

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}

export function addMessage(
  projectId: string,
  role: Message["role"],
  content: string,
  id = crypto.randomUUID(),
  timestamp = Date.now(),
) {
  getStatement<[string, string, string, string, number]>(`
    INSERT INTO messages (id, project_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, projectId, role, content, timestamp);
}

export function createDefaultArtifacts(project: Project) {
  const now = Date.now();
  const defaultArtifacts: ProjectArtifact[] = [
    {
      id: `${project.id}:prd`,
      projectId: project.id,
      type: "prd",
      title: "PRD.md",
      content: renderPrd(project),
      version: 1,
      updatedAt: new Date(now).toISOString(),
    },
    {
      id: `${project.id}:build-plan`,
      projectId: project.id,
      type: "build_plan",
      title: "Implementation Plan",
      content: renderBuildPlan(project, project.scopeLevel),
      version: 1,
      updatedAt: new Date(now).toISOString(),
    },
    {
      id: `${project.id}:agents`,
      projectId: project.id,
      type: "agents_md",
      title: "AGENTS.md",
      content: renderAgents(project),
      version: 1,
      updatedAt: new Date(now).toISOString(),
    },
    {
      id: `${project.id}:handoff`,
      projectId: project.id,
      type: "handoff_prompt",
      title: "Codex Handoff Prompt",
      content: renderHandoffPrompt(project),
      version: 1,
      updatedAt: new Date(now).toISOString(),
    },
  ];

  for (const artifact of defaultArtifacts) {
    upsertArtifact(artifact, now);
  }

  return defaultArtifacts;
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    oneLiner: row.oneLiner,
    status: row.status,
    stage: row.repoUrl ? "Repo Created" : "Build Plan",
    scopeLevel: row.scopeLevel,
    repoUrl: row.repoUrl ?? undefined,
    updatedAt: new Date(row.updatedAt).toISOString(),
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "new-project";
}
