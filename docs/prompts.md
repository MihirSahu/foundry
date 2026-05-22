# Prompts

## Product Summary Extraction

Extract a structured product summary from the idea and brainstorming conversation. Bias toward the smallest useful MVP. Return product name, one-liner, problem, target user, goals, non-goals, feature list, routes, data model, integrations, risks, and open questions.

## PRD Generation

Generate a concise markdown PRD from the approved product summary. Keep scope tight. Include goals, non-goals, target user, MVP features, user stories, routes, data model, risks, and success criteria.

## Build Plan Generation

Generate a Codex-ready implementation plan for the selected scope. Include stack, architecture, file structure, routes, components, data schema, API routes/server actions, environment variables, tests, milestones, first tasks, and acceptance criteria.

## Codex Handoff

Implement the MVP described in `PRD.md`. Follow `AGENTS.md`. Start with the data model, then build the core routes, then polish the mobile UI. Keep the scope limited to the MVP section.
