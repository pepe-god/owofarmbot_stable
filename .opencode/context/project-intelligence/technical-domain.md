<!-- Context: project-intelligence/technical | Priority: critical | Version: 2.0 | Updated: 2026-07-16 -->

# Technical Domain

**Purpose**: Tech stack, architecture, and development patterns for OwO Farm Bot Stable.
**Last Updated**: 2026-07-16

## Quick Reference
**Update Triggers**: Tech stack changes | New modules | Architecture decisions | Dependency changes
**Audience**: Developers, AI agents
**Principles**: KISS + DRY + YAGNI above all — no speculative abstraction, extract at 2nd duplication

## Primary Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Runtime | Node.js | ≥22.13 | Discord.js-selfbot-v13 requirement; pnpm 11.9.0 |
| Language | JavaScript (ES2022) | — | Plain JS with JSDoc type annotations; no TypeScript |
| Bot Framework | Discord.js-selfbot-v13 | latest | Self-bot Discord client wrapper |
| Config Validation | valibot | — | Schema-based config validation at startup |
| Lint/Format | Biome | 2.5.4 | Strict mode: 4 spaces, double quotes, trailing commas, CRLF |
| Package Manager | pnpm | 11.9.0 | Fast, disk-efficient |

## Architecture Patterns

### BotContext Dependency Injection
Every module receives a `ctx` object with all dependencies explicitly wired — no globals, no monkeypatching.

```js
// bot.js: DI container construction
const ctx = new BotContext({
    client,
    config,
    global: owofarmbot_stable,
    state: botState,
    loops: new LoopManager(),
    globalutil,
    delay,
    prefix,
    chalk,
    child_process: cp,
    notifier,
    fs,
});
ctx.logger = require("../services/logger.js")(ctx);
```

### Self-Looping Module Pattern
All farming modules (farm, luck, safety, inventory, animals) use setTimeout self-scheduling:

```js
module.exports = (ctx) => {
    async function loop() {
        await ctx.globalutil.waitWhileBusy(ctx);
        // ... perform action ...
        const delay = getrand(config.interval[type].min, config.interval[type].max);
        setTimeout(loop, delay);
    }
    loop();
};
```

### Command Handler Pattern
Commands are registered in a `commands` map with `run()` methods:

```js
const commands = {
    start: {
        run: async (ctx, message, args) => {
            await mainHandler(ctx, message);
        },
    },
    pause: {
        run: async (ctx, message, args) => {
            ctx.global.paused = true;
        },
    },
};
```

### Message Processing Pipeline (messageCreate.js)
1. Captcha detection → handleCaptchaDetection
2. OwO DM response → handleCaptchaSolved
3. Bot prefix command → handleCommand

## Module Organization

| Directory | Purpose | Key Constraint |
|-----------|---------|----------------|
| `src/core/` | Bootstrap, event wiring, global utilities | NO business logic |
| `src/services/` | Orchestration, config, logging, error handling | Stateless where possible |
| `src/modules/` | Self-looping farming features | Each file = one concern |

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `messageCreate.js`, `mainHandler.js` |
| Functions | camelCase | `handleCaptchaDetection`, `waitWhileBusy` |
| Constants | UPPER_SNAKE_CASE | `OWO_ID`, `REQUIRED_GEMS`, `BUSY_FLAGS` |
| Classes | PascalCase | `BotContext`, `LoopManager`, `Logger` |
| Variables | camelCase | `huntResult`, `gems.need` |

## Code Standards

1. **KISS + DRY + YAGNI** — simplest solution, extract at 2nd duplication, no "just in case" features
2. **Biome strict** — 4 spaces, double quotes, trailing commas, CRLF; `biome check --write` before commit
3. **Plain JavaScript** — JSDoc for type hints, no TypeScript compilation step
4. **Functional + modular** — prefer pure functions, avoid classes where possible (Logger is the exception)
5. **BotContext DI** — no `require()` inside modules for project services; everything comes via `ctx`
6. **Minimal comments** — JSDoc on public functions only; no inline comments for obvious code
7. **Module boundaries** — helpers → `globalutil.js`, business logic → `services/` or `modules/`
8. **`waitWhileBusy` required** — always call `ctx.globalutil.waitWhileBusy(ctx)` before any action
9. **No `ctx.basic`** — `ctx.config.main.*` is the single source of truth for config values
10. **`client.prefix()` randomizes** — never hardcode `"owo"`, use `ctx.prefix()` instead

## Commands

| Command | Description |
|---------|-------------|
| `pnpm start` | Run from repo root |
| `pnpm lint:fix ; pnpm format` | Lint and format with Biome |
| `pnpm test` | Run all tests |

## Entrypoint Flow

```
src/main.js
  └─ cluster.fork()
       └─ src/core/bot.js
            ├─ configSchema.validateConfig()
            ├─ configSchema.parseConfigErrors()
            ├─ configSchema.getDebugConfig()
            └─ initializeBot()
                 ├─ Load handlers (src/core/index.js)
                 ├─ antiCrash, command registration, event binding
                 ├─ Login → wait for message commands
                 └─ messageCreate.js: captcha detection + command dispatch
```

**`start`/`resume` command** → `src/services/mainHandler.js` orchestrates:
- `initFarming` → farm (hunt/battle)
- `initAnimals` → animals (sell/sacrifice loop)
- `initPrayer` → luck (pray/curse)
- `initSafety` → safety (pause on captcha/rate-limit)

All self-looping modules live in `src/modules/` (6 files), loaded at runtime via `require()`.

## Config

- **`config.json`** is primary; `.env` overrides: `MAIN_TOKEN`, `MAIN_USERID`, `WEBHOOK_URL`
- `config.settings.owoprefix` defaults to `"owo"` if missing/empty (handled in `runtimeConfig.js`)
- `client.prefix()` randomizes between `"owo"` and `config.settings.owoprefix` — always use this instead of hardcoding
- Config validation: `src/services/configSchema.js` (valibot-based: `validateConfig` + `parseConfigErrors` + `getDebugConfig` + `checkToken`)

## Key Runtime Patterns

| Pattern | Usage |
|---------|-------|
| `client.globalutil.waitWhileBusy(client)` | Always call before any action; checks paused/captcha/inventory flags |
| `client.logger.info(type, module, message)` | Logger — also `warn`, `alert`, `debug` |
| `client.global` | Live state: paused, captchadetected, totals, gems, temp |
| `client.delay(ms)` | `() => new Promise(resolve => setTimeout(resolve, ms))` |
| Self-looping modules | `module.exports = (client, message) => { setTimeout(..., getrand(...)) }` |

## Module Boundaries

- **New helper functions** (sleep, random, string manipulation) → `src/core/globalutil.js`
- **New business logic** (captcha detection, balance check, command dispatch) → `src/services/` or `src/modules/`
- **NEVER** put business logic in `src/core/globalutil.js`. NEVER make `core/` a dumping ground.

## Key Files

| File | Purpose |
|------|---------|
| `src/core/globalutil.js` | Runtime utilities: waitForMessage, waitWhileBusy, commandrandomizer, getrand, removeInvisibleChars |
| `src/core/constants.js` | Centralized constants |
| `src/services/runtimeConfig.js` | Config file loading + `.env` overrides + default prefix initialization |
| `src/services/configSchema.js` | Startup config validation (valibot schema + helpers) |
| `src/services/mainHandler.js` | Orchestrator (module.exports + 4 init functions, no top-level requires) |
| `src/modules/` | Self-looping modules: farm, luck, safety, inventory, animals, captchaNotify |

## Biome Config

- `complexity/noExcessiveCognitiveComplexity` (max 15) — error
- `complexity/noExcessiveLinesPerFunction` (max 80) — warn
- `complexity/useMaxParams` (max 5) — warn
- Indent: 4 spaces, CRLF line endings, double quotes, trailing commas
- Overrides: tests, config.json all lint-ignored
- Individual file overrides: main.js (noInnerDeclarations off), inventory.js (noAssignInExpressions off), globalutil.js (noControlCharactersInRegex off), logger.js (biome pass clean — class-based)

### Known Lint Noise (pre-existing, do NOT "fix")
- `logger.js:3` — `useTemplate` (unsafe fix, changes runtime behavior)

## Security Requirements

1. **Token in .env only** — MAIN_TOKEN in config.json is a placeholder; runtime reads `.env`
2. **Token redaction** — log output is sanitized via regex (`/[a-zA-Z0-9_-]{24,30}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,40}/g` → `[REDACTED_TOKEN]`)
3. **PowerShell injection prevention** — use `spawn(arg[])` not `exec(string)`; escape single quotes
4. **Webhook URL validation** — guard with `startsWith("https://discord.com/api/webhooks/")`
5. **Rate limiting** — `withRateLimit()` + exponential backoff (base 5s, factor 2, cap 320s)
6. **Auth retry limit** — `MAX_AUTH_RETRIES=3`, `process.exit(1)` after 3 consecutive failures
7. **Crash safety** — `try/finally` around `client.destroy()` in admin restart; antiCrash handler in index.js
8. **Health server hardening** — `requestTimeout=5000`, `headersTimeout=6000` (slow-loris mitigation)

### Scope of In-Place Hardening

These items were addressed with code changes (see commit history):

| ID  | Area | Mitigation |
| --- | ---- | ---------- |
| V2  | Token / webhook secret handling | `.env` (`MAIN_TOKEN`, `WEBHOOK_URL`) is the primary source; `config.json` tokens are deprecated (runtime warning) and ships with empty placeholders. `gitleaks` scanning (`.gitleaks.toml`). |
| V5  | Webhook `@everyone` mention | Removed `\|\|@everyone\|\|` content from webhook alerts. |
| S1  | Cluster crash-loop | `src/main.js` caps forks to 5 per 60s window with short backoff. |
| S2  | Dead `autostart` config | Wired and active via `src/core/ready.js`. |
| S3  | Inventory flag livelock | `src/modules/inventory.js` wraps `use()`/`inventory()` in `try/finally`. |
| S4  | Stuck runtime flags | `src/services/watchdog.js` force-clears `use`/`inventory` held >120s, stale `captchadetected` >30min. |
| L3  | Token shape validation | `checkToken` rejects malformed tokens. |
| L4  | Suppressed Node warnings | `src/core/bot.js` no longer overrides `process.emitWarning`. |
| T6  | Post-mortem logging | Alerts mirrored to `data/logs/alert.log` (`src/services/logger.js`). |

### Accepted Risks

The following item **cannot be resolved with code** and is accepted as residual risk.
Mitigation is limited to operational guidance.

#### V1 — Selfbot usage / Discord Terms of Service (account ban)

The bot logs in with a **user account token** (`discord.js-selfbot-v13`) and automates
the OwO bot on behalf of that account. Selfbots violate Discord's Terms of Service;
the irreducible consequence is an account (and possibly IP) ban. This is **by design**
for this project.

**Mitigations / good practice (operational, not code):**
- Keep the token in `.env` only (`MAIN_TOKEN`); never commit it.
- Use a secondary/disposable account rather than your primary.
- Enable `autopause`/safety so the bot pauses under rate-limit pressure.
- Respect `interval` minimums (the validator clamps aggressive values).
- Run at human-like cadence; do not lower intervals to the bare minimum.

## 📂 Codebase References

| Pattern | Implementation |
|---------|---------------|
| BotContext DI | `src/core/botContext.js` — DI container class |
| DI wiring | `src/core/bot.js` — wires all deps into BotContext |
| Self-looping module | `src/modules/farm.js` — farmAction + setTimeout loop |
| Command handler | `src/core/messageCreate.js:265-289` — commands map |
| Captcha detection | `src/core/messageCreate.js:147-260` — handleCaptchaDetection pipeline |
| Config validation | `src/services/configSchema.js` — valibot schema + checks |
| Rate limiting | `src/services/errors.js` — withRateLimit, nextRateLimitDelay |
| Token redaction | `src/core/index.js:27` — log sanitization regex |
| Code standards | (see Code Standards + Biome Config + Module Boundaries above) |
| Lint config | `biome.json` — Biome 2.5.4 strict configuration |
| Constants | `src/core/constants.js` — centralized constants |

## Related Files

- Business Domain (pending — run `/add-context --business` to create)
- Decisions Log (pending)
