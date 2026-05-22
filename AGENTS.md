# Agent Instructions

## Project Purpose

Foundry turns messy product ideas into Codex-ready MVP repositories through a structured mobile-first workflow.

## Stack

- Next.js App Router
- TypeScript
- shadcn/ui-style source components
- Tailwind CSS
- pnpm
- SQLite + Drizzle

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## Implementation Rules

- Follow the MVP scope in `docs/roadmap.md`.
- Keep the app mobile-first.
- Prefer simple, readable code.
- Use shadcn/ui component patterns where appropriate.
- Do not add unnecessary dependencies.
- Do not expose subscription-backed auth tokens to the browser.
- Do not implement out-of-scope features unless explicitly asked.

## Build Order

1. App shell and layout
2. Core data model
3. Product-thinking generation
4. GitHub repo creation
5. Manual handoff flow
6. Experimental OpenCode worker mode
7. Tests and validation
