export type ProjectStage =
  | "Idea"
  | "Brainstorming"
  | "PRD"
  | "Build Plan"
  | "Repo Created"
  | "Codex Handoff Ready";

export type ScopeLevel = "Prototype" | "MVP" | "Launchable";

export type ArtifactType =
  | "prd"
  | "build_plan"
  | "agents_md"
  | "readme"
  | "handoff_prompt"
  | "roadmap";

export type GenerationJobType =
  | "brainstorm"
  | "prd"
  | "build_plan"
  | "repo_create"
  | "starter_app"
  | "github_issues"
  | "opencode_build"
  | "opencode_repair"
  | "handoff_prompt";

export type BuildEventType =
  | "status"
  | "session"
  | "reasoning_delta"
  | "tool_start"
  | "tool_progress"
  | "tool_finish"
  | "tool_error"
  | "file_access"
  | "command"
  | "final"
  | "error";

export interface Project {
  id: string;
  name: string;
  slug: string;
  oneLiner: string;
  status: "draft" | "active" | "blocked" | "ready";
  stage: ProjectStage;
  scopeLevel: ScopeLevel;
  repoUrl?: string;
  updatedAt: string;
}

export interface SummaryCard {
  id: string;
  title: string;
  eyebrow: string;
  value: string;
  detail: string;
  tone: "teal" | "amber" | "orange" | "violet" | "neutral";
}

export interface Message {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  createdAt: string;
}

export interface ProjectArtifact {
  id: string;
  projectId: string;
  type: ArtifactType;
  title: string;
  content: string;
  version: number;
  updatedAt: string;
}

export interface BuildEvent {
  id: string;
  sequence: number;
  type: BuildEventType;
  message: string;
  payload?: Record<string, unknown>;
}
