# OwO Farm Bot Stable — AGENTS.md

## Commands
- `pnpm start` — run from repo root
- `pnpm lint` — `biome check .`
- `pnpm lint:fix` — `biome check --write .`
- `pnpm format` — `biome format --write .`

## Entrypoint & Architecture
- `src/main.js` forks itself via `cluster.fork()`; worker calls `src/bot.js`
- `src/bot.js` attaches everything to the Discord.js `Client` via `Object.assign`, then: load handlers → login → wait for message commands
- `src/bot.js` startup: `configValidator.verifyconfig()` → `configValidator.getconfig()` → `initializeBot()`
- `src/handlers/index.js` wires: commandHandler, eventHandler, antiCrash
- `src/commands/admin.js` — pause/resume/start/restart/stats
- `src/events/messageCreate.js` — captcha detection + command dispatch
- `start`/`resume` command → `src/services/mainHandler.js` → orchestrates:
  - `initAutoJoin` (joingiveaways)
  - `initFarming` → checklist or farm
  - `initGambling` (gamble)
  - `initQuest` (quest)
  - `initAnimals` (animals — sell/sacrifice loop)
  - `initPrayer` (luck — pray/curse)
  - `initHuntbot` (huntbot)
  - `initSafety` (safety)
- Checklist subsystem lives in `src/services/checklist.js` (10 functions)
- All self-looping modules live in `src/modules/` (10 files), loaded at runtime via `require()`

## Config
- `config.json` is primary; `.env` overrides: `MAIN_TOKEN`, `MAIN_USERID`, `WEBHOOK_URL`
- `config.settings.owoprefix` defaults to `"owo"` if missing/empty (in configLoader.js)
- `extra` config section exists but code for it was fully removed (YAGNI) — do not add back
- `client.prefix()` randomizes between `"owo"` and `config.settings.owoprefix` — use this instead of hardcoding
- Config validation lives in `src/services/configValidator.js` (verifyconfig + getconfig + helpers)

## Key Patterns
- `client.globalutil.waitWhileBusy(client)` — always call before any action (checks paused/captcha/inventory/checklist flags)
- Logger: `client.logger.info(type, module, message)` — also `warn`, `alert`, `debug`
- Self-looping modules: `module.exports = (client, message) => { setTimeout(..., getrand(...)) }`
- `client.global` holds live state (paused, captchadetected, totals, gems, temp)
- `client.delay(ms)` — `() => new Promise(resolve => setTimeout(resolve, ms))`

## File Organization
- `src/utils/` — **only** small general-purpose helpers (sleep, random, string utils). NOT business logic.
- `src/services/` — orchestration, config validation, checklist, logging. Business logic that coordinates modules.
- `src/modules/` — self-looping farming modules (farm, gamble, quest, etc.). Each owns a specific OwO bot feature.

## Module Boundaries (IMPORTANT)
- **New helper functions** (sleep, random, string manipulation) → `src/utils/`
- **New business logic** (captcha detection, balance check, command dispatch) → `src/services/` or `src/modules/`
- NEVER put business logic in `src/utils/`. NEVER make `utils/` a dumping ground.

## Key Files
- `src/utils/globalutil.js` — runtime utilities (waitForMessage, waitWhileBusy, parseDuration, commandrandomizer, getrand, removeInvisibleChars)
- `src/services/configValidator.js` — startup config validation (verifyconfig, getconfig, 8 helpers)
- `src/services/checklist.js` — checklist subsystem (smol, executeChecklistLine, handleDaily/Vote/Cookie, etc.)
- `src/services/mainHandler.js` — orchestrator (module.exports + 7 init functions, no top-level requires)
- `src/modules/` — 10 self-looping modules: farm, gamble, quest, luck, huntbot, safety, inventory, joingiveaways, animals, warn

## Biome (lint config)
- `complexity/noExcessiveCognitiveComplexity` (max 15) — error
- `complexity/noExcessiveLinesPerFunction` (max 80) — warn
- `complexity/useMaxParams` (max 5) — warn
- Indent: 4 spaces, CRLF line endings, double quotes, trailing commas
- Overrides: hcaptchasolver, tests, config.json all lint-ignored
- Individual file overrides: main.js (noInnerDeclarations off), inventory.js (noAssignInExpressions off), globalutil.js (noControlCharactersInRegex off), logger.js (biome pass clean — class-based)

## Remaining Lint Noise (pre-existing, do NOT "fix")
- `logger.js:3` — `useTemplate` (unsafe fix, changes runtime behavior)
- `joingiveaways.js:66` — `noExcessiveLinesPerFunction` (105 lines, needs real refactor)

## Ignored Directories
- `src/vendor/hcaptchasolver/` — 60MB Chrome extension, excluded from lint, graphify
- `src/vendor/adblockcache/` — auto-generated Puppeteer cache
- `graphify-out/`, `.opencode/` — in .gitignore

## Other Gotchas
- `src/main.js` auto-installs missing deps via `npm install` at startup
- Termux support removed
- `pnpm-workspace.yaml` allows builds for puppeteer, sharp, sleep
- autovote is a merged submodule at `src/vendor/autovote/` (was `git submodule`)
- No test runner configured; `src/tests/` is lint-ignored and empty
- `config.json` formatting uses 2-space indent (biome override)
