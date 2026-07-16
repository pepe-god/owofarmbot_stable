# OwO Farm Bot Stable

An automated farming bot for the OwO Discord bot.

> **Disclaimer**: This bot uses a selfbot token, which is against Discord's ToS. Use at your own risk. Your account may be banned.

---

## Requirements

- [Node.js](https://nodejs.org/) v22 or newer
- pnpm — run `corepack enable pnpm` after installing Node.js

## Quick Start

```bash
# 1. Download & install
git clone <repo-url>
cd owofarmbot_stable
pnpm install

# 2. Create .env from the example file and fill in your token & user ID
cp .env.example .env
# Edit .env with your Discord token and user ID

# 3. Edit config.json — set your channel IDs and toggle features

# 4. Start the bot
pnpm start
```

Type `<prefix>start` in your farm channel to begin (default prefix: `owo`, e.g. `owostart`).

## Configuration

### `.env` (secrets — never share these)

| Variable     | Required | Description        |
|-------------|----------|--------------------|
| MAIN_TOKEN  | ✅       | Your Discord token |
| MAIN_USERID | ✅       | Your Discord user ID |

### `config.json` (settings)

| Field                  | Description                                  |
|------------------------|----------------------------------------------|
| `main.commandschannelid` | Channel where the bot sends commands       |
| `main.owodmchannelid`    | OwO bot's DM channel ID                    |
| `main.autostart`         | Auto-start farming on launch (true/false)  |
| `main.commands.*`        | Toggle hunt, battle, pray, etc. on/off     |
| `settings.owoprefix`     | Command prefix (default: `owo`)            |

## Commands

| Command               | Action                      |
|-----------------------|-----------------------------|
| `<prefix>start`       | Start / resume farming      |
| `<prefix>pause`       | Pause farming               |
| `<prefix>restart`     | Restart the bot             |
| `<prefix>stats`       | Show session statistics     |

## Production Build

```bash
pnpm run build
node dist/bot.js
```

## Scripts

| Command             | Description                    |
|---------------------|--------------------------------|
| `pnpm start`        | Run in development mode        |
| `pnpm run build`    | Build production bundle        |
| `pnpm run test`     | Run tests                      |

## FAQ

**Q: "MAIN_TOKEN not found" error?**  
A: You didn't create `.env` or it's empty. Copy `.env.example` to `.env` and fill in your token.

**Q: How do I get my Discord token?**  
A: Discord → `Ctrl+Shift+I` → Storage → Local Storage → Copy `token` value.

**Q: How do I get my user/channel ID?**  
A: Enable Developer Mode in Discord settings, then right-click → Copy ID.

When you get a CAPTCHA, the bot pauses until you solve it and type `oworesume`.

---

## License

[CC BY-NC-SA 4.0](LICENSE)
