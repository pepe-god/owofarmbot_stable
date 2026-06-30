# Graph Report - owofarmbot_stable  (2026-06-30)

## Corpus Check
- 36 files · ~179,985 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 284 nodes · 339 edges · 28 communities (26 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5791546d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_App Entry & Package Config|App Entry & Package Config]]
- [[_COMMUNITY_Farming & Luck Commands|Farming & Luck Commands]]
- [[_COMMUNITY_Auto Vote Config|Auto Vote Config]]
- [[_COMMUNITY_Bot Init & Config Loading|Bot Init & Config Loading]]
- [[_COMMUNITY_Biome Formatting Config|Biome Formatting Config]]
- [[_COMMUNITY_Huntbot & Inventory|Huntbot & Inventory]]
- [[_COMMUNITY_Biome Lint Rules|Biome Lint Rules]]
- [[_COMMUNITY_Main Command Router|Main Command Router]]
- [[_COMMUNITY_Package Lock Config|Package Lock Config]]
- [[_COMMUNITY_Message Event Handler|Message Event Handler]]
- [[_COMMUNITY_Logging System|Logging System]]
- [[_COMMUNITY_Huntbot Captcha Solver|Huntbot Captcha Solver]]
- [[_COMMUNITY_Giveaway Joiner|Giveaway Joiner]]
- [[_COMMUNITY_Auto Vote Script|Auto Vote Script]]
- [[_COMMUNITY_Captcha Detection|Captcha Detection]]
- [[_COMMUNITY_Windows Setup|Windows Setup]]
- [[_COMMUNITY_Admin Commands|Admin Commands]]
- [[_COMMUNITY_Client Ready Event|Client Ready Event]]
- [[_COMMUNITY_Anti-Crash Handler|Anti-Crash Handler]]
- [[_COMMUNITY_Handler Index|Handler Index]]

## God Nodes (most connected - your core abstractions)
1. `commandrandomizer()` - 14 edges
2. `OwO Farm Bot Stable — AGENTS.md` - 12 edges
3. `Logger` - 10 edges
4. `getrand()` - 10 edges
5. `scripts` - 7 edges
6. `showerr()` - 7 edges
7. `inventory()` - 6 edges
8. `smol()` - 6 edges
9. `OwO Farm Bot Stable` - 5 edges
10. `formatter` - 5 edges

## Surprising Connections (you probably didn't know these)
- `fetchInventoryData()` --calls--> `commandrandomizer()`  [EXTRACTED]
  src/modules/inventory.js → src/utils/globalutil.js
- `fetchQuestEmbed()` --calls--> `commandrandomizer()`  [EXTRACTED]
  src/modules/quest.js → src/utils/globalutil.js
- `questLoop()` --calls--> `getrand()`  [EXTRACTED]
  src/modules/quest.js → src/utils/globalutil.js
- `fetchChecklistEmbed()` --calls--> `commandrandomizer()`  [EXTRACTED]
  src/services/checklist.js → src/utils/globalutil.js
- `farmAction()` --calls--> `getrand()`  [EXTRACTED]
  src/modules/farm.js → src/utils/globalutil.js

## Import Cycles
- None detected.

## Communities (28 total, 2 thin omitted)

### Community 0 - "App Entry & Package Config"
Cohesion: 0.09
Nodes (20): { getrand }, capitalize(), { commandrandomizer, getrand }, farmAction(), handleMissingGems(), huntResult(), REQUIRED_GEMS, { commandrandomizer, getrand } (+12 more)

### Community 1 - "Farming & Luck Commands"
Cohesion: 0.07
Nodes (28): author, bugs, url, description, devDependencies, @biomejs/biome, homepage, keywords (+20 more)

### Community 2 - "Auto Vote Config"
Cohesion: 0.10
Nodes (19): files, includes, maxSize, formatter, enabled, indentStyle, indentWidth, lineEnding (+11 more)

### Community 3 - "Bot Init & Config Loading"
Cohesion: 0.11
Nodes (12): chalk, client, { Client, Collection, RichPresence }, { config, DEVELOPER_MODE }, configValidator, cp, fs, globalutil (+4 more)

### Community 4 - "Biome Formatting Config"
Cohesion: 0.18
Nodes (13): ANIMAL_TYPE_MAP, checkDuplicateChannels(), checkGambleAmount(), checkPrayCurseConflict(), checkSellSacrificeConflict(), checkToken(), _fse, INTERVAL_DEFAULTS (+5 more)

### Community 5 - "Huntbot & Inventory"
Cohesion: 0.14
Nodes (14): noExcessiveCognitiveComplexity, noExcessiveLinesPerFunction, useMaxParams, linter, enabled, rules, level, options (+6 more)

### Community 6 - "Biome Lint Rules"
Cohesion: 0.21
Nodes (3): ANSI_RE, chalk, Logger

### Community 7 - "Main Command Router"
Cohesion: 0.15
Nodes (12): Biome (lint config), Commands, Config, Entrypoint & Architecture, File Organization, Ignored Directories, Key Files, Key Patterns (+4 more)

### Community 8 - "Package Lock Config"
Cohesion: 0.17
Nodes (12): dependencies, axios, chalk, discord.js-selfbot-v13, dotenv, fs-extra, node-notifier, puppeteer (+4 more)

### Community 9 - "Message Event Handler"
Cohesion: 0.29
Nodes (11): { commandrandomizer }, executeChecklistLine(), fetchChecklistEmbed(), getIncompleteItems(), handleCookie(), handleDaily(), handleVote(), parseChecklistInterval() (+3 more)

### Community 10 - "Logging System"
Cohesion: 0.31
Nodes (10): applyGems(), { commandrandomizer }, fetchInventoryData(), GEM_ITEMS, inventory(), ITEM_ACTIONS, parseItemCodes(), selectGemCodes() (+2 more)

### Community 11 - "Huntbot Captcha Solver"
Cohesion: 0.35
Nodes (10): { commandrandomizer, getrand }, fetchQuestEmbed(), parseQuests(), questActionOther(), questGamble(), questHandler(), questLoop(), questOwO() (+2 more)

### Community 12 - "Giveaway Joiner"
Cohesion: 0.20
Nodes (9): [0.0.9.3], [0.0.9.3.1], [0.0.9.3.2], [0.0.9.4], Bot:, Bot:, Bot:, Bot: (+1 more)

### Community 13 - "Auto Vote Script"
Cohesion: 0.31
Nodes (8): CAPTCHA_PHRASES, escapeRegex(), handleCaptchaDetection(), handleCommand(), isWebCaptchaMessage(), launchAutoSolve(), sendDesktopNotifications(), sendWebhookNotification()

### Community 14 - "Captcha Detection"
Cohesion: 0.22
Nodes (8): adblockcachedir, { connect }, delay(), extensionPath, fse, path, waitForCaptchaResult(), yargs

### Community 16 - "Windows Setup"
Cohesion: 0.32
Nodes (6): CHANNEL_IDS, findActiveButtons(), fs, getEnteredList(), path, pressButtonsSequentially()

### Community 17 - "Admin Commands"
Cohesion: 0.33
Nodes (5): Commands, Install & Run, License, OwO Farm Bot Stable, Requirements

### Community 18 - "Client Ready Event"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: What does safety.js connect to?, Source Nodes

## Knowledge Gaps
- **124 isolated node(s):** `Commands`, `Entrypoint & Architecture`, `Config`, `Key Patterns`, `File Organization` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Package Lock Config` to `Farming & Luck Commands`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `commandrandomizer()` connect `App Entry & Package Config` to `Message Event Handler`, `Logging System`, `Huntbot Captcha Solver`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `Commands`, `Entrypoint & Architecture`, `Config` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Entry & Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09243697478991597 - nodes in this community are weakly interconnected._
- **Should `Farming & Luck Commands` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Auto Vote Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Bot Init & Config Loading` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._