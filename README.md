# OwO Farm Bot Stable

Originally created by [Mido](https://github.com/Mid0Hub). Licensed under [CC BY-NC-SA 4.0](LICENSE).

Auto farm bot for OwO Discord bot.

## Requirements

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/installation)

## Install & Run

```bash
git clone https://github.com/Mid0Hub/owofarmbot_stable
cd owofarmbot_stable
pnpm install
```

Edit `config.json` with your token and channel IDs, then:

```bash
node src/main.js
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

## License

[CC BY-NC-SA 4.0](LICENSE) — Attribution required, non-commercial, share-alike.
