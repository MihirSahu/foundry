# Roadmap

## Milestone 1: Product Shell

- Mobile-first project dashboard.
- Idea capture flow.
- Guided brainstorming mock state.
- Product summary cards.
- Scope selector.
- Artifact previews.

## Milestone 2: Structured Generation

- Connect Conduit auth health checks.
- Generate structured project summaries.
- Generate PRDs from structured data.
- Generate implementation plans from structured data.
- Version artifacts.

## Milestone 3: Repo Creation

- Connect GitHub auth.
- Create private repos by default.
- Push `README.md`, `PRD.md`, `AGENTS.md`, and docs.
- Optionally create GitHub issues from the build plan.

## Milestone 4: Handoff

- Generate manual Codex/OpenCode handoff prompt.
- Show relevant files and implementation order.
- Add copy/export actions.

## Milestone 5: Experimental Build Runner

- Run OpenCode SDK sessions in an isolated worker.
- Stream sanitized NDJSON or SSE events.
- Surface file access, shell commands, errors, and final results.
- Clean up worker sessions after completion.
