---
type: "query_insight"
date: "2026-06-29T09:55:57.893020+00:00"
question: "What does safety.js connect to?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["safety", "mainHandler", "client.global.paused"]
---

# Q: What does safety.js connect to?

## Answer

safety.js sets client.global.paused flag (read by waitWhileBusy across all modules), reads client.config.settings.safety (pauseafter/pausefor/autopause), called from mainHandler.js via require(). Its edges were invisible to AST because it uses runtime client.property access instead of explicit imports.

## Outcome

- Signal: useful

## Source Nodes

- safety
- mainHandler
- client.global.paused