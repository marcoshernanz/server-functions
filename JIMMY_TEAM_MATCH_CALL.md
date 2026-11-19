# Jimmy Team-Match Call Notes

These notes capture the conversation with Jimmy, the Next.js engineering director, during a Vercel internship team-matching call.

## Context

- The call was for team matching.
- Jimmy said the Next.js team has 13 people.
- He said only 2 people on the team, including him, are in San Francisco.
- He said he was taking calls with interns partly for fun and partly to get to know them early.

## Team Context

- He said Next.js is tough work.
- He said it sounds good on the surface, but the day-to-day work can be boring and draining.
- He said most interns are working on more superficial frontend work.
- He said they have not taken many interns before and that this process is still relatively new.
- He seemed to imply they may have room for only 1 intern on the Next.js team, though that part was not fully clear.

## Technical Discussion

- He asked what I disliked about Next.js.
- I said it was scary how easy it is to confuse Server Actions with normal functions.
- He asked how I would fix that.
- I said we could have a server action factory with middleware that runs before the action.
- I also said I was not sure whether that should live in Next.js core or in the ecosystem.

## Tradeoffs Discussion

- He asked what the tradeoffs would be if Next.js itself owned the solution.
- I said the pros would be better safety and easier usage.
- I said the cons would be maintenance burden and extra learning overhead for developers using Next.js.
- He said this is something they have already thought about.
- He said they are leaning toward implementing something to make Server Actions safer.

## Possible Directions Mentioned

- He said they did not yet have a clear implementation idea.
- He mentioned something like `"use server - auth"` as one possible direction.
- He then asked whether there was anything else I did not like about Next.js.
- After thinking for a bit, I said I did not like the magic strings `"use server"` and `"use client"`, even though I understood that they are compiler directives.
- I added that I would actually be against `"use server - auth"` because it would lean even harder into magic strings.

## Tooling Discussion

- He said maybe something at the editor level could work.
- I said I had thought about a VS Code extension before.
- I also said that editor extensions are a weak fit for AI agents, and that modern tooling should be built with AI in mind.
- He said maybe the Language Server Protocol could help.
- I said I was not sure whether all agent harnesses support LSP.
- I said I knew Opencode does, but I was unsure about Claude Code or Codex.
- He then said maybe something like MCP could work.

## Project Framing

- He said this could be a good intern project.
- He asked whether I would like working on Next.js.
- I said I would love to.

## Outcome / Readout

- He said they might probably be moving forward with me.
- That did not sound fully locked in, and his tone felt somewhat uncertain or low-energy.
- It is possible that was just his general demeanor, not a negative signal.

## Follow-Up

- He said I could start fidgeting with the problem.
- He said I should email him or DM him on X.
- He said DM on X would be better.

## Why This Repo Exists

This repo exists to explore the idea that came out of that conversation:

- make Server Functions feel more explicit than normal functions
- make safety mechanisms easier to apply
- avoid over-relying on magic strings
- keep the design compatible with tooling, editors, and AI agents
