# 0005: One model by default, bring-your-own keys, a usage ledger

**Status:** accepted, October 2026

## Context

TrueCut's quality depends on Claude's writing. The team asked for Claude Opus 5.5 throughout, for people to be able to use their own API keys, and to see where tokens go.

Prices at the time of writing (USD per million tokens, input / output): Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50, Fable 5.1 $10 / $50. Opus 5.5 is Anthropic's default recommendation and only twice the price of Sonnet 5.5. A typical 30-second ad uses roughly 60–120k tokens (about $0.40–$1.20 on Opus).

## Decision

- **Claude Opus 5.5 (`claude-opus-5-5`) is the default for every call.** Owners can change three job types separately in Settings: *Writing* (angles, storyboards, casting, the founder-talk edit, chat), *Reading sources*, and *Reading screenshots*. Writing is where quality shows. Screenshot reading is high-volume and simple, so it's the first place to drop to Haiku 5.5 if cost matters (about 40× cheaper).
- **Keys resolve personal → workspace → server.** Saved keys are encrypted with AES-256-GCM using `TRUECUT_ENCRYPTION_KEY`, checked with the provider before saving, never returned to the browser (only the last 4 characters), and marked *Rejected* when a provider refuses them so jobs move on to the next key.
- **A job runs inside a context** (`AsyncLocalStorage`): its workspace, person, keys and model choices are resolved once when it starts. The pipelines keep reading `config.anthropicKey` / `config.model`, so no pipeline code had to learn about users.
- **Every paid call goes through one client per provider** (`core/system/claude.ts`, `core/system/eleven.ts`). It retries rate limits, overload and network errors with backoff, asks again once with more room if an answer was cut off, turns provider errors into messages people can act on, checks the monthly budget first, and records the call in `usage_events` (tokens including cache reads and writes, cost estimate from list prices, key source, success or failure).
- **Budgets are per workspace and per calendar month (UTC).** At the cap, calls stop with a clear message; nothing half-spends.

## Consequences

- Cost estimates come from a price table in `packages/shared/src/models.ts`. Update it when Anthropic changes prices. The provider console stays the bill of record.
- ElevenLabs prices depend on the plan, so the ledger records characters and seconds. Dollar estimates appear only if `TRUECUT_ELEVEN_USD_PER_1K_CHARS` / `_PER_MINUTE` are set.
- Losing `TRUECUT_ENCRYPTION_KEY` means saved keys must be re-entered. Rotation is supported (`npm run keys:rotate`).
