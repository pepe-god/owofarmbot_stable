# Security

This document records the threat-model findings for **OwO Farm Bot Stable** and
which items are mitigated in code versus explicitly accepted as residual risk.

## Scope of in-place hardening

The following items were addressed with code changes (see commit history):

| ID  | Area                                   | Mitigation |
| --- | -------------------------------------- | ---------- |
| V2  | Token / webhook secret handling        | `.env` (`MAIN_TOKEN`, `WEBHOOK_URL`) is the primary source; `config.json` tokens are deprecated (runtime warning) and the file ships with empty placeholders. `gitleaks` scanning added (`.gitleaks.toml`). |
| V5  | Webhook `@everyone` mention            | Removed the `||@everyone||` content from webhook alerts. |
| S1  | Cluster crash-loop                     | `src/main.js` caps forks to 5 per 60s window with a short backoff. |
| S2  | Dead `autostart` config                | Wired and active via `src/core/ready.js` (auto-starts after login when `config.main.autostart` is true). |
| S3  | Inventory flag livelock               | `src/modules/inventory.js` wraps `use()` / `inventory()` in `try/finally` so flags always clear. |
| S4  | Stuck runtime flags                    | New `src/services/watchdog.js` force-clears `use`/`inventory` held >120s and a stale `captchadetected` held >30min. |
| L3  | Token shape validation                 | `checkToken` rejects malformed tokens (not just short ones). |
| L4  | Suppressed Node warnings               | `src/core/bot.js` no longer overrides `process.emitWarning`; all warnings surface. |
| T6  | Post-mortem logging                    | Alerts are mirrored to `data/logs/alert.log` (`src/services/logger.js`). |

## Accepted risks

The following item **cannot be resolved with code** for this project and is
accepted as residual risk. Mitigation is limited to operational guidance.

### V1 — Selfbot usage / Discord Terms of Service (account ban)

The bot logs in with a **user account token** (`discord.js-selfbot-v13`) and
automates the OwO bot on behalf of that account. Selfbots violate Discord's
Terms of Service; the irreducible consequence is an account (and possibly IP)
ban.

This is **by design** for this project: the entire architecture assumes a user
token. Migrating to a sanctioned model (a real Discord bot application + the
OwO bot's public API, if any) is a separate, out-of-scope rewrite (tracked as
"V1" in the assessment, explicitly excluded from this plan).

**Mitigations / good practice (operational, not code):**

- Keep the token in `.env` only (`MAIN_TOKEN`); never commit it.
- Use a secondary/disposable account rather than your primary.
- Enable `autopause`/safety so the bot pauses under rate-limit pressure.
- Respect `interval` minimums (the validator clamps aggressive values).
- Run at human-like cadence; do not lower intervals to the bare minimum.

## Reporting

Do not open public issues for account-ban risk (V1); it is accepted and documented here. For genuine code-level security
issues (e.g. a secret accidentally committed, or a new injection surface),
report privately per the project's issue tracker.
