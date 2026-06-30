# OwO Farm Bot Stable

Auto farm bot for OwO Discord bot.

Fork with refactored codebase, test infrastructure, and cleaned-up dependencies.

## Requirements

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/installation)

## Install & Run

```bash
pnpm install
```

Edit `config.json` with your token and channel IDs, then:

```bash
pnpm start
```

Type `owostart` in your farm channel to begin.

## Commands

| Command | Action |
|---------|--------|
| `owostart` | Start farming |
| `owopause` | Pause farming |
| `oworesume` | Resume farming |
| `oworestart` | Restart farming |
| `owostats` | Show stats |

## Test

```bash
pnpm test
```

## Lint

```bash
pnpm lint
pnpm lint:fix
```

Originally created by [Mid0aria / Mid0Hub](https://github.com/Mid0Hub).

## License

[CC BY-NC-SA 4.0](LICENSE) — Attribution required, non-commercial, share-alike.
