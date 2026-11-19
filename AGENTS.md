# AGENTS

## Purpose

The purpose of this repo is to develop a strong idea for safer Next.js Server Functions that can be shown to Jimmy for feedback. (See [JIMMY_TEAM_MATCH_CALL.md](./JIMMY_TEAM_MATCH_CALL.md))

It explores:

- an explicit `serverFunction({ input, policies, handler })` API
- `definePolicy(...)` for reusable runtime guardrails
- strong TypeScript inference from Standard Schema-compatible validators
- examples and type tests before any real runtime implementation

## Working Context

- Optimize for producing something Jimmy would find thoughtful, concrete, and worth reacting to.
- Keep the scope centered on API design, typing, and examples.
- Prefer simple examples that teach the model clearly.
- Treat runtime internals as secondary unless explicitly needed.
- See [PITCH.md](./PITCH.md) for the high-level thesis.
- See [JIMMY_TEAM_MATCH_CALL.md](./JIMMY_TEAM_MATCH_CALL.md) for the conversation that motivated this repo.
