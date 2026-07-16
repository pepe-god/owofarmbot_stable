# OwO Farm Bot Stable

An automated farming bot for the OwO Discord bot.

A cleaned-up fork with a refactored codebase, test infrastructure, and trimmed dependencies.

## Requirements

- [Node.js](https://nodejs.org/) v22 or newer
- [pnpm](https://pnpm.io/installation)

## Setup & Run

```bash
pnpm install
```

Fill in your token and channel IDs in `config.json`, then start the bot:

```bash
pnpm start
```

Type `<prefix>start` in your farm channel to begin (default prefix is `owo`, e.g. `owostart`).

## Commands

Commands use your configured prefix (default `owo`). Replace `<prefix>` below with yours.

| Command            | Action            |
| ------------------ | ----------------- |
| `<prefix>start`    | Start farming (alias: `resume`) |
| `<prefix>pause`    | Pause farming     |
| `<prefix>restart`  | Restart farming (aliases: `reboot`, `stop`) |
| `<prefix>stats`    | Show current stats |

## Credits

Originally created by [Mid0aria / Mid0Hub](https://github.com/Mid0Hub).

## License

[CC BY-NC-SA 4.0](LICENSE) — Attribution required, non-commercial, share-alike.
