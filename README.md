# Foundry

Turn messy product ideas into Codex-ready MVP repositories.

Foundry is a mobile-first Next.js app for shaping vague ideas into scoped product artifacts, generating PRDs and build plans, creating GitHub-ready starter repos, and preparing manual or OpenCode-backed coding-agent handoffs.

## Current V1 Slice

- Mobile-first project dashboard and staged workflow.
- Idea capture with guided brainstorming mock data.
- Product summary cards for idea, user, scope, and stack.
- Scope selector for Prototype, MVP, and Launchable paths.
- Generated artifact previews for `PRD.md`, implementation plan, `AGENTS.md`, and handoff prompt.
- GitHub OAuth status, logout, and repo creation through the GitHub Contents API.
- SQLite-backed project, message, artifact, auth, repo, job, and build-event persistence.
- Conduit-backed product-thinking endpoint with a local heuristic fallback.
- Experimental OpenCode NDJSON build endpoint behind a feature flag.
- Typed service boundaries for Conduit, GitHub, OpenCode, starter files, and SQLite/Drizzle persistence.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style source components
- pnpm
- SQLite + Drizzle
- Conduit for product-thinking generation
- OpenCode SDK for experimental build execution

## Getting Started

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

For GitHub OAuth, create a GitHub OAuth App and provide:

```bash
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
TOKEN_ENCRYPTION_KEY=
FOUNDRY_DATABASE_URL=file:foundry.sqlite
FOUNDRY_ENABLE_OPENCODE=0
```

Use a 32-byte random `TOKEN_ENCRYPTION_KEY` value in production. Development falls back to a local-only key if it is missing.
Set `FOUNDRY_ENABLE_OPENCODE=1` only for trusted local worker experiments.

## Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Architecture

The app is intentionally split into two AI layers:

- Product Thinking Layer: `lib/services/product-thinking.ts`, backed by `@conduit-llm/provider-chatgpt`.
- Build Execution Layer: `lib/services/opencode-worker.ts`, backed by `@opencode-ai/sdk` and designed to run as an isolated worker path.

GitHub repo creation and starter file generation live in:

- `lib/services/github.ts`
- `lib/services/starter-files.ts`

HTTP integration routes live in:

- `app/api/projects`
- `app/api/product-thinking`
- `app/api/github/repos`
- `app/api/opencode/build`

The initial persistence model lives in:

- `db/schema.ts`
- `db/client.ts`

## Security Notes

- Token-bearing services are server-only.
- GitHub tokens are encrypted at rest in SQLite and are never returned to the browser.
- Raw ChatGPT, OpenAI, and GitHub credentials must never be sent to the browser, logged, or written into generated repos.
- Generated repos must not include auth files, logs, or provider payloads.
- OpenCode worker mode should remain explicitly experimental until auth, permissions, and workspace isolation are hardened.
