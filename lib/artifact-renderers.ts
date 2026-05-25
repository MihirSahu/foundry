import type { ChatProjectSummary, Project, ScopeLevel } from "@/lib/domain";

export function renderPrd(project: Project) {
  return `# ${project.name} PRD

## One-liner

${project.oneLiner}

## Target User

Solo technical founders who want to turn raw product thoughts into scoped MVP repositories from mobile.

## MVP Scope

- Capture a freeform idea.
- Run guided brainstorming with inferred defaults.
- Generate a markdown PRD and structured implementation plan.
- Prepare a GitHub-ready starter repository.
- Produce a Codex/OpenCode handoff prompt.

## Non-goals

- Full IDE behavior.
- Hosted multi-user credential brokerage.
- Automatic production deployment.
- Complex project management.

## Success Criteria

- A user can create a project in under two minutes.
- The generated PRD is editable and versioned.
- The generated repo contains README.md, PRD.md, AGENTS.md, docs, and starter app files.
- The handoff prompt is specific enough for a coding agent to start without extra context.`;
}

export function renderPrdFromSummary(project: Project, summary: ChatProjectSummary) {
  return `# ${summary.productName || project.name} PRD

## One-liner

${summary.oneLiner || project.oneLiner}

## Problem

${summary.problem}

## Target User

${summary.targetUser}

## Smallest Useful Version

${summary.smallestUsefulVersion ?? "A focused MVP that proves the core workflow."}

## Goals

${summary.goals.map((goal) => `- ${goal}`).join("\n")}

## Non-goals

${summary.nonGoals.map((goal) => `- ${goal}`).join("\n") || "- Avoid out-of-scope production polish."}

## MVP Features

${summary.mvpFeatures.map((feature) => `- ${feature}`).join("\n")}

## Routes

${summary.routes.map((route) => `- ${route}`).join("\n") || "- /"}

## Data Model

${summary.dataEntities.map((entity) => `- ${entity}`).join("\n") || "- Project"}

## Integrations

${summary.integrations.map((integration) => `- ${integration}`).join("\n") || "- None for v1"}

## Risks

${summary.risks.map((risk) => `- ${risk}`).join("\n") || "- Scope creep"}

## Open Questions

${summary.openQuestions.map((question) => `- ${question}`).join("\n") || "- None"}

## Build Preference

- Repository requested: ${summary.repoRequested ? "yes" : "no"}
- OpenCode build requested: ${summary.buildRequested === false ? "no" : "yes"}`;
}

export function renderBuildPlanFromSummary(project: Project, summary: ChatProjectSummary) {
  return `# ${summary.productName || project.name} Build Plan

## Selected Scope

${summary.scopeLevel ?? project.scopeLevel}

## Recommended Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- pnpm
- SQLite + Drizzle

## Architecture

Build the smallest useful version described in PRD.md. Keep the chat/spec/build flow explicit and mobile-first.

## First Tasks

${summary.mvpFeatures.map((feature) => `- Implement: ${feature}`).join("\n")}

## Acceptance Criteria

- The app supports the MVP scope in PRD.md.
- Generated artifacts stay consistent with the approved spec.
- The repo remains Codex/OpenCode-ready.`;
}

export function renderBuildPlan(project: Project, scope: ScopeLevel) {
  return `# ${project.name} Build Plan

## Selected Scope

${scope}

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- pnpm
- SQLite + Drizzle

## Milestones

1. App shell and project dashboard.
2. Idea capture and guided brainstorming flow.
3. Structured artifact generation.
4. GitHub repo creation and starter file push.
5. Codex/OpenCode handoff and experimental worker events.

## First Tasks

- Implement project dashboard with stages.
- Add summary cards and scope selector.
- Add generated PRD, build plan, and handoff preview surfaces.
- Wire Conduit, GitHub, and OpenCode through typed service boundaries.

## Validation

- Typecheck the app.
- Run a production build.
- Verify mobile and desktop layouts in browser.`;
}

export function renderAgents(project: Project) {
  return `# Agent Instructions

## Project Purpose

${project.oneLiner}

## Stack

- Next.js App Router
- TypeScript
- shadcn/ui
- Tailwind CSS
- pnpm

## Commands

- \`pnpm install\`
- \`pnpm dev\`
- \`pnpm lint\`
- \`pnpm build\`

## Implementation Rules

- Follow the MVP scope in \`PRD.md\`.
- Keep the app mobile-first.
- Prefer simple, readable code.
- Use shadcn/ui components where appropriate.
- Do not add unnecessary dependencies.
- Do not implement out-of-scope features unless explicitly asked.

## Build Order

1. App shell and layout
2. Core data model
3. Main user flows
4. UI polish
5. Tests and validation`;
}

export function renderHandoffPrompt(project: Project) {
  return `Implement the MVP for ${project.name}.

Read PRD.md, AGENTS.md, and docs/roadmap.md first. Start with the data model, then build the core routes and mobile workflow, then polish the UI. Keep the implementation inside the MVP scope and leave OpenCode worker mode behind a clearly labeled experimental path.`;
}
