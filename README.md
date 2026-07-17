# OwO Farm Bot Stable

An automated farming bot for the OwO Discord bot.

> **Disclaimer**: This bot uses a selfbot token, which is against Discord's ToS. Use at your own risk. Your account may be banned.

---

## Requirements

- [Node.js](https://nodejs.org/) v22 or newer
- pnpm — run `corepack enable pnpm` after installing Node.js
- **Termux (Android):** `pkg install nodejs git` then `npm install -g pnpm`

## Quick Start

### Desktop / Server

```bash
git clone <repo-url>
cd owofarmbot_stable
pnpm install
cp .env.example .env
# Edit .env with your Discord token and user ID
# Edit config.json — set your channel IDs and toggle features
pnpm start
```

### Termux (Android)

```bash
pkg update && pkg upgrade
pkg install nodejs git
npm install -g pnpm
git clone <repo-url>
cd owofarmbot_stable
pnpm install
cp .env.example .env
# Edit .env with your Discord token and user ID
# Edit config.json — set your channel IDs and toggle features

# ⚠ Important for Termux: disable the Windows-only CAPTCHA popup
# Edit config.json and set: "prompt": false
# (Under settings → captcha → alerttype → desktop)

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

**Q: Does this work on Termux (Android)?**  
A: Yes. Install Node.js via `pkg install nodejs`, then follow the Termux quick-start above.  
   The only change needed is setting `"prompt": false` in config.json (the CAPTCHA popup uses `powershell.exe` which is Windows-only — the webhook notification still works).

---

## License

[CC BY-NC-SA 4.0](LICENSE)
