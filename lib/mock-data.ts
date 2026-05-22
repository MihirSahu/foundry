import {
  renderAgents,
  renderBuildPlan,
  renderHandoffPrompt,
  renderPrd,
} from "@/lib/artifact-renderers";
import type { BuildEvent, Message, Project, ProjectArtifact, SummaryCard } from "@/lib/domain";

export const projects: Project[] = [
  {
    id: "foundry",
    name: "Foundry",
    slug: "foundry",
    oneLiner: "Turn messy product ideas into Codex-ready MVP repositories.",
    status: "active",
    stage: "Build Plan",
    scopeLevel: "MVP",
    repoUrl: undefined,
    updatedAt: "2026-05-19T16:42:00.000Z",
  },
  {
    id: "tiny-crm",
    name: "Tiny CRM",
    slug: "tiny-crm",
    oneLiner: "A lightweight relationship tracker for solo consultants.",
    status: "draft",
    stage: "Brainstorming",
    scopeLevel: "Prototype",
    repoUrl: undefined,
    updatedAt: "2026-05-18T21:10:00.000Z",
  },
];

export const activeProject = projects[0];

export const summaryCards: SummaryCard[] = [
  {
    id: "idea",
    title: "Idea",
    eyebrow: "Core promise",
    value: "Idea to repo",
    detail: "Capture an idea, shape the MVP, generate artifacts, and prepare a starter repository.",
    tone: "teal",
  },
  {
    id: "user",
    title: "User",
    eyebrow: "Primary persona",
    value: "Solo builder",
    detail: "Technical founder using ChatGPT, Codex, GitHub, and modern web stacks.",
    tone: "violet",
  },
  {
    id: "scope",
    title: "Scope",
    eyebrow: "Recommended level",
    value: "MVP",
    detail: "Real artifacts, GitHub repo setup, and manual handoff first; OpenCode worker is experimental.",
    tone: "amber",
  },
  {
    id: "stack",
    title: "Stack",
    eyebrow: "Default build",
    value: "Next.js + SQLite",
    detail: "App Router, TypeScript, Tailwind, shadcn-style components, Drizzle, and pnpm.",
    tone: "orange",
  },
];

export const brainstormMessages: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "What is the smallest useful version: just PRD + repo handoff, or should the first version also run an OpenCode build worker?",
    createdAt: "2026-05-19T16:22:00.000Z",
  },
  {
    id: "m2",
    role: "user",
    content:
      "Start with Conduit-powered planning, GitHub repo creation, starter files, and a manual Codex handoff. Keep OpenCode worker mode experimental.",
    createdAt: "2026-05-19T16:24:00.000Z",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "Good. I’ll mark the v1 build path as repo + handoff and keep worker streaming behind a feature flag.",
    createdAt: "2026-05-19T16:25:00.000Z",
  },
];

export const artifacts: ProjectArtifact[] = [
  {
    id: "prd",
    projectId: activeProject.id,
    type: "prd",
    title: "PRD.md",
    content: renderPrd(activeProject),
    version: 1,
    updatedAt: "2026-05-19T16:35:00.000Z",
  },
  {
    id: "build-plan",
    projectId: activeProject.id,
    type: "build_plan",
    title: "Implementation Plan",
    content: renderBuildPlan(activeProject, activeProject.scopeLevel),
    version: 1,
    updatedAt: "2026-05-19T16:38:00.000Z",
  },
  {
    id: "agents",
    projectId: activeProject.id,
    type: "agents_md",
    title: "AGENTS.md",
    content: renderAgents(activeProject),
    version: 1,
    updatedAt: "2026-05-19T16:40:00.000Z",
  },
  {
    id: "handoff",
    projectId: activeProject.id,
    type: "handoff_prompt",
    title: "Codex Handoff Prompt",
    content: renderHandoffPrompt(activeProject),
    version: 1,
    updatedAt: "2026-05-19T16:41:00.000Z",
  },
];

export const buildEvents: BuildEvent[] = [
  {
    id: "e1",
    sequence: 1,
    type: "status",
    message: "Generated PRD and build plan with structured output.",
  },
  {
    id: "e2",
    sequence: 2,
    type: "file_access",
    message: "Prepared README.md, PRD.md, AGENTS.md, docs/roadmap.md.",
  },
  {
    id: "e3",
    sequence: 3,
    type: "session",
    message: "OpenCode worker is configured as experimental and awaits auth.",
  },
];
