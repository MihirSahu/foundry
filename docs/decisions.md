# Decisions

## V1 Build Path

Foundry starts with repo generation plus manual Codex/OpenCode handoff. The OpenCode SDK worker is represented as an experimental service boundary and UI surface, but should not be treated as production-ready until auth injection, workspace isolation, and stream sanitization are verified end to end.

## Product Thinking Layer

Conduit is the product-thinking provider boundary. The app should use `@conduit-llm/provider-chatgpt` for brainstorming, structured summaries, PRDs, build plans, issue drafting, and handoff prompt generation.

## Default Stack

Generated projects should default to Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui-style components, pnpm, SQLite, and Drizzle.

## Credential Handling

Credential-bearing code belongs server-side only. Auth files and raw provider payloads must never be copied into generated repositories or browser-visible state.
