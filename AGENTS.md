# OwO Farm Bot Stable — AGENTS.md

## Coding Principles

Follow these when touching code:

- **KISS** — Prefer the simplest solution that works. Avoid clever abstractions, unnecessary indirection, or speculative generality.
- **DRY** — Extract duplicated logic into shared helpers. If you're copying the same block, refactor it once.
- **YAGNI** — Don't add hooks, extensibility points, or "just in case" features. Implement only what's needed now.

## Commands
- `pnpm start` — run from repo root
- `pnpm lint:fix ; pnpm format` — lint and format
- `pnpm test` — run all tests

## Entrypoint & Architecture
- `src/main.js` forks itself via `cluster.fork()`; worker calls `src/core/bot.js`
- `src/core/bot.js` attaches everything to the Discord.js `Client` via `Object.assign`, then: load handlers → login → wait for message commands
- `src/core/bot.js` startup: `configSchema.validateConfig()` → `configSchema.parseConfigErrors()` → `configSchema.getDebugConfig()` → `initializeBot()`
- `src/core/index.js` wires: antiCrash, command registration, event binding
- `src/core/admin.js` — pause/resume/start/restart/stats
- `src/core/messageCreate.js` — captcha detection + command dispatch
- `start`/`resume` command → `src/services/mainHandler.js` → orchestrates:
  - `initFarming` → checklist or farm
  - `initQuest` (quest)
  - `initAnimals` (animals — sell/sacrifice loop)
  - `initPrayer` (luck — pray/curse)
  - `initSafety` (safety)
- Checklist subsystem lives in `src/services/checklist.js` (9 functions)
- All self-looping modules live in `src/modules/` (7 files), loaded at runtime via `require()`

## Config
- `config.json` is primary; `.env` overrides: `MAIN_TOKEN`, `MAIN_USERID`, `WEBHOOK_URL`
- `config.settings.owoprefix` defaults to `"owo"` if missing/empty (in runtimeConfig.js)
- `extra` config section exists but code for it was fully removed (YAGNI) — do not add back
- `client.prefix()` randomizes between `"owo"` and `config.settings.owoprefix` — use this instead of hardcoding
- Config validation lives in `src/services/configSchema.js` (valibot-based: validateConfig + parseConfigErrors + getDebugConfig + checkToken)

## Key Patterns
- `client.globalutil.waitWhileBusy(client)` — always call before any action (checks paused/captcha/inventory/checklist flags)
- Logger: `client.logger.info(type, module, message)` — also `warn`, `alert`, `debug`
- Self-looping modules: `module.exports = (client, message) => { setTimeout(..., getrand(...)) }`
- `client.global` holds live state (paused, captchadetected, totals, gems, temp)
- `client.delay(ms)` — `() => new Promise(resolve => setTimeout(resolve, ms))`

## File Organization
- `src/core/` — consolidated: bot.js (bootstrap), index.js (loader), admin.js, messageCreate.js, ready.js, globalutil.js, captcha.js, autovote.js
- `src/services/` — orchestration, config validation, checklist, logging. Business logic that coordinates modules.
- `src/modules/` — self-looping farming modules (farm, quest, etc.). Each owns a specific OwO bot feature.

## Module Boundaries (IMPORTANT)
- **New helper functions** (sleep, random, string manipulation) → `src/core/globalutil.js`
- **New business logic** (captcha detection, balance check, command dispatch) → `src/services/` or `src/modules/`
- NEVER put business logic in `src/core/globalutil.js`. NEVER make `core/` a dumping ground.

## Key Files
- `src/core/globalutil.js` — runtime utilities (waitForMessage, waitWhileBusy, parseDuration, commandrandomizer, getrand, removeInvisibleChars)
- `src/services/runtimeConfig.js` — config file loading + .env overrides + default prefix initialization
- `src/services/configSchema.js` — startup config validation (valibot schema + helpers)
- `src/services/checklist.js` — checklist subsystem (smol, executeChecklistLine, handleDaily/Vote/Cookie, etc.)
- `src/services/mainHandler.js` — orchestrator (module.exports + 6 init functions, no top-level requires)
- `src/modules/` — self-looping modules: farm, quest, luck, safety, inventory, animals, captchaNotify

## Biome (lint config)
- `complexity/noExcessiveCognitiveComplexity` (max 15) — error
- `complexity/noExcessiveLinesPerFunction` (max 80) — warn
- `complexity/useMaxParams` (max 5) — warn
- Indent: 4 spaces, CRLF line endings, double quotes, trailing commas
- Overrides: hcaptchasolver, tests, config.json all lint-ignored
- Individual file overrides: main.js (noInnerDeclarations off), inventory.js (noAssignInExpressions off), globalutil.js (noControlCharactersInRegex off), logger.js (biome pass clean — class-based)

## Remaining Lint Noise (pre-existing, do NOT "fix")
- `logger.js:3` — `useTemplate` (unsafe fix, changes runtime behavior)

## Ignored Directories
- `src/vendor/hcaptchasolver/` — 60MB Chrome extension, excluded from lint
