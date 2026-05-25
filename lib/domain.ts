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
  | "product_summary"
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

export type SessionStage =
  | "clarifying"
  | "ready_for_spec"
  | "spec_ready"
  | "spec_approved"
  | "building"
  | "built"
  | "repo_created"
  | "handoff_ready";

export type SessionReadiness = "clarifying" | "ready_for_spec";

export type NextActionType =
  | "ask_question"
  | "generate_spec"
  | "edit_spec"
  | "submit_spec"
  | "view_build"
  | "connect_github"
  | "open_repo";

export interface NextAction {
  type: NextActionType;
  label: string;
}

export interface ChatProjectSummary {
  productName: string;
  oneLiner: string;
  problem: string;
  targetUser: string;
  smallestUsefulVersion: string;
  goals: string[];
  nonGoals: string[];
  scopeLevel: ScopeLevel | null;
  mvpFeatures: string[];
  routes: string[];
  dataEntities: string[];
  integrations: string[];
  risks: string[];
  openQuestions: string[];
  repoRequested: boolean | null;
  buildRequested: boolean | null;
}

export interface ProjectSessionState {
  projectId: string;
  stage: SessionStage;
  readiness: SessionReadiness;
  summary?: ChatProjectSummary;
  missingFields: string[];
  repoRequested: boolean | null;
  buildRequested: boolean | null;
  nextAction: NextAction;
  createdAt: string;
  updatedAt: string;
}

export interface BuildEvent {
  id: string;
  sequence: number;
  type: BuildEventType;
  message: string;
  payload?: Record<string, unknown>;
}
