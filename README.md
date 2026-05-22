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
- Experimental durable OpenCode job runner behind a feature flag.
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
FOUNDRY_WORKSPACES_DIR=.foundry/workspaces
FOUNDRY_ENABLE_OPENCODE=0
```

Use a 32-byte random `TOKEN_ENCRYPTION_KEY` value in production. Development falls back to a local-only key if it is missing.
Set `FOUNDRY_ENABLE_OPENCODE=1` only for trusted local worker experiments.

For ChatGPT subscription-backed product thinking and OpenCode experiments, authenticate through Conduit before running Foundry:

```bash
pnpm dlx @conduit-llm/cli login
```

Conduit owns the local subscription login flow and token refresh. Foundry does not expose those tokens to the browser or write them into generated repos; the OpenCode worker inherits the local process environment and uses the auth material made available by Conduit/OpenCode.

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
- Build Execution Layer: `lib/server/opencode-runner.ts`, `workers/opencode-build-worker.ts`, and `lib/opencode/worker-runtime.ts`, backed by `@opencode-ai/sdk` and persisted through Drizzle job/event rows.

GitHub repo creation and starter file generation live in:

- `lib/services/github.ts`
- `lib/services/starter-files.ts`

HTTP integration routes live in:

- `app/api/projects`
- `app/api/product-thinking`
- `app/api/github/repos`
- `app/api/opencode/jobs`
- `app/api/opencode/build`

The initial persistence model lives in:

- `db/schema.ts`
- `db/client.ts`
- `db/migrations`

## Security Notes

- Token-bearing services are server-only.
- GitHub tokens are encrypted at rest in SQLite and are never returned to the browser.
- Raw ChatGPT, OpenAI, and GitHub credentials must never be sent to the browser, logged, or written into generated repos.
- Generated repos must not include auth files, logs, or provider payloads.
- OpenCode worker mode should remain explicitly experimental until auth, permissions, and workspace isolation are hardened.
- OpenCode jobs run only inside server-resolved workspaces under `FOUNDRY_WORKSPACES_DIR`; browser-provided workspace paths are not accepted.
- Run the Conduit login locally instead of pasting ChatGPT/OpenAI subscription credentials into Foundry settings or project files.
