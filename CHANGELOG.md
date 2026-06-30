## [0.1.0] — Refactor & Test Infrastructure

### Codebase:

- KISS/DRY/SRP/YAGNI refactor across entire codebase
- Split `globalutil.js` (353 → 61 lines): config validation extracted to `configValidator.js`
- Split `mainHandler.js` (319 → 88 lines): checklist and animals extracted
- Flattened `events/client/` → `events/` (flat), removed subdir loop
- Moved `src/utils/function/` → `src/modules/`, `data/` → `assets/`
- Renamed `src/utils/captcha.js` → `src/workers/`
- Moved vendor libs (autovote, hcaptchasolver, huntbot_captcha) → `src/vendor/`
- Simplified logger: removed table frame, `console.clear()`, ANSI strip
- Removed Knip (dead code tool, wasn't used)
- Enabled lint for vendor code (autovote, huntbot_captcha)
- All file moves done via `git mv` — history preserved

### Test Infrastructure:

- Added `node:test` runner (`pnpm test`) — zero dependencies
- `tests/globalutil.test.js` — 22 tests (removeInvisibleChars, parseDuration, getrand, commandrandomizer)
- `tests/checklist.test.js` — 8 tests (parseChecklistInterval, getIncompleteItems)
- `tests/configValidator.test.js` — 8 tests (verifyconfig with mock client)
- `tests/logger.test.js` — 14 tests (log levels, limits, IPC, SIGINT)
- `tests/mainHandler.test.js` — 15 tests (orchestrator decision logic)
- `tests/farm.test.js` — 18 tests (capitalize, huntResult, handleMissingGems)
- `tests/gamble.test.js` — 16 tests (processResult, GAME_CONFIG)
- `tests/quest.test.js` — 7 tests (parseQuests)
- **Total: 107 tests, all passing**

### Graph & Dev:

- Pre-commit hook: rebuilds graphify knowledge graph before each commit
- `graphify-out/` gitignored and untracked (local-only)
- Updated AGENTS.md with module boundaries, key patterns, remaining lint noise
- Updated README with test/lint commands, fork notice
- Cleaned package.json: fork metadata, `private: true`, version 0.1.0

## [0.0.9.4]

### Bot:

- Fixed issue with autovoter not downloading
- Updater system revamped

## [0.0.9.3.2]

### Bot:

- Added dynamic interval for checklist

## [0.0.9.3.1]

### Bot:

- Fixed a bug that make webui cannot auto reconnect
- Fixed a bug that make reboot function cause crash
- Fixed a bug that make rechecklist not work
- Fixed a bug when deleting old log file

**Note**: If somethings not working properly, use previous version (v0.0.9.2.2)

## [0.0.9.3]

### WebUI:

- Added "Quest" tab.
- Made minor changes to the layout.
- Value now updates correctly (should).
- Layout adjusted for mobile devices.
- **Bug**: If connected to WebUI before bot setup, it will not automatically connect to the bot (backend) and requires a manual reload.
- **Bug**: Reboot feature not working.

### Bot:

- Fixed notification error, now working properly.
- Made Empress and WebSocket use the same port to enable exposing localhost (documentation will come later).
- Rechecked the list.
- Random phrases now work even if hunt/battle (or both) are not enabled.
- Removed useless information used for debugging (does nothing).

**Note**: If this version causes any errors, use the previous version in the release.
