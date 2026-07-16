/**
 * Discord event handlers + admin commands.
 *
 * Merged from: messageCreate.js, admin.js, ready.js
 * Exports:
 *   default — messageCreate handler
 *   handleReady — ready event handler
 *   commands — admin command definitions for dynamic registration
 */

import { notifyCaptcha } from "../modules/safety.js";
import { OWO_ID } from "./constants.js";
import { escapeRegex } from "./globalutil.js";
import type { Ctx, Message } from "./types.js";

export type { Ctx, Message };

// ─── CAPTCHA phrases ─────────────────────────────────────────────────────

const CAPTCHA_PHRASES = [
    "please complete your captcha",
    "verify that you are human",
    "are you a real human",
    "it may result in a ban",
    "please complete this within 10 minutes",
    "please use the link below so i can check",
    "captcha",
];

// ─── Captcha detection (messageCreate origin) ───────────────────────────

function handleCaptchaDetection(
    ctx: Ctx,
    message: Message,
    msgcontent: string,
) {
    const CHANNEL_IDS = [
        ctx.config.main.commandschannelid,
        ctx.config.main.owodmchannelid,
    ];

    if (!CHANNEL_IDS.includes(message.channel.id)) return;
    if (!message.content.toLowerCase().includes(`<@${ctx.client.user.id}>`))
        return;
    if (ctx.global.captchadetected) return;
    if (!CAPTCHA_PHRASES.some((p) => msgcontent.includes(p))) return;

    ctx.state.captcha();
    ctx.global.total.captcha++;
    ctx.logger.alert("Bot", "Captcha", "Captcha Detected!");
    ctx.logger.info(
        "Bot",
        "Captcha",
        `Total Captcha: ${ctx.global.total.captcha}`,
    );
    ctx.logger.warn("Bot", "Captcha", `Bot Paused: ${ctx.global.paused}`);

    notifyCaptcha(ctx as unknown as Parameters<typeof notifyCaptcha>[0]);
}

// ─── Captcha solved (messageCreate origin) ──────────────────────────────

function handleCaptchaSolved(ctx: Ctx, message: Message, msgcontent: string) {
    if (
        !msgcontent.includes("i have verified") ||
        message.channel.type !== "DM"
    )
        return;

    ctx.global.total.solvedcaptcha++;
    if (ctx.config.settings.autoresume) {
        ctx.state.captchaSolved(true);
        ctx.logger.warn(
            "Bot",
            "Captcha",
            "Captcha solved. Resuming bot automatically...",
        );
    } else {
        ctx.state.captchaSolved(false);
        ctx.logger.warn(
            "Bot",
            "Captcha",
            `Captcha Solved, please resume by using the command "${ctx.prefix()}resume" to resume`,
        );
    }
}

// ─── Command dispatch (messageCreate origin) ────────────────────────────

function handleCommand(ctx: Ctx, message: Message) {
    const PREFIX = ctx.prefix();
    const prefixRegex = new RegExp(
        `^(<@!?${ctx.client.user.id}>|${escapeRegex(PREFIX)})\\s*`,
    );
    if (!prefixRegex.test(message.content)) return;

    const [matchedPrefix] = message.content.match(
        prefixRegex,
    ) as RegExpMatchArray;
    const args = message.content
        .slice(matchedPrefix.length)
        .trim()
        .split(/ +/g);
    const command = args.shift()?.toLowerCase() ?? "";
    const cmd =
        ctx.client.commands.get(command) ||
        (command
            ? ctx.client.commands.get(ctx.client.aliases.get(command) ?? "")
            : undefined);

    if (!cmd) return;
    if (message.author.id !== ctx.config.main.userid) return;
    try {
        cmd.run!(ctx, message, args);
    } catch (err) {
        ctx.logger.alert(
            "Bot",
            "Command",
            `Error executing command: ${(err as Error).message}`,
        );
    }
}

// ─── Default export: messageCreate handler ──────────────────────────────

export default async function handleMessage(ctx: Ctx, message: Message) {
    if (message.author.id === OWO_ID) {
        const msgcontent = ctx.globalutil.removeInvisibleChars(
            message.content.toLowerCase(),
        );
        handleCaptchaDetection(ctx, message, msgcontent);
        handleCaptchaSolved(ctx, message, msgcontent);
    }
    handleCommand(ctx, message);
}

// ─── Ready handler (ready.js origin) ────────────────────────────────────

async function handleAutoStart(ctx: Ctx) {
    if (!ctx.config.main.autostart) return;
    if (!ctx.global.paused) {
        return ctx.logger.warn("Bot", "AutoStart", "Bot is already working!!!");
    }

    const { startOrResume } = require("../services/mainHandler.js");
    const firstStart = startOrResume(ctx);
    if (firstStart) {
        ctx.logger.info("Bot", "AutoStart", "BOT started have fun ;)");
    } else {
        ctx.logger.info("Bot", "AutoStart", "Restarted BOT after a pause :3");
    }
}

function setupSweeper(ctx: Ctx) {
    const SWEEPER_INTERVAL = 5 * 60 * 1000;

    async function sweep() {
        for (const channel of ctx.client.channels.cache.values()) {
            const ch = channel as {
                messages?: { cache: Map<string, unknown> };
            };
            if (!ch.messages) continue;
            if (ch.messages.cache.size === 0) continue;

            const messagesToDelete = Math.floor(ch.messages.cache.size * 0.85);
            let i = 0;
            for (const [id] of ch.messages.cache) {
                if (i >= messagesToDelete) break;
                ch.messages.cache.delete(id);
                i++;
            }
        }

        ctx.logger.warn("Bot", "Cache", `Cleared oldest 85% of message cache.`);
        ctx.loops.schedule(sweep, SWEEPER_INTERVAL, "sweeper");
    }

    ctx.loops.schedule(sweep, SWEEPER_INTERVAL, "sweeper");
}

export async function handleReady(ctx: Ctx) {
    ctx.logger.info("Bot", "Startup", `${ctx.client.user.username} is ready!`);
    setupSweeper(ctx);
    ctx.global.temp.isready = true;
    await handleAutoStart(ctx);
}

// ─── Admin commands (admin.js origin) ────────────────────────────────────

async function replyAndDelete(ctx: Ctx, message: Message, text: string) {
    await message.delete();
    if (ctx.config.settings.chatfeedback) {
        await message.channel.send({ content: text });
    }
}

export const commands = [
    {
        config: { name: "pause" },
        run: async (ctx: Ctx, message: Message) => {
            if (ctx.global.paused) {
                await replyAndDelete(ctx, message, "Bot is already paused!!!");
            } else {
                ctx.state.pause();
                await replyAndDelete(ctx, message, "Paused :)");
            }
        },
    },
    {
        config: { name: "restart", aliases: ["reboot", "stop"] },
        run: async (ctx: Ctx, message: Message) => {
            await message.channel.send({
                content: "The bot is being restarted...",
            });
            ctx.loops.stopAll();
            try {
                await ctx.client.destroy();
            } finally {
                setTimeout(() => process.exit(0), 2000);
            }
        },
    },
    {
        config: { name: "start", aliases: ["resume"] },
        run: async (ctx: Ctx, message: Message) => {
            if (!ctx.global.paused) {
                return replyAndDelete(
                    ctx,
                    message,
                    "Bot is already working!!!",
                );
            }
            const { startOrResume } = require("../services/mainHandler.js");
            const firstStart = startOrResume(ctx, () =>
                replyAndDelete(ctx, message, "BOT started have fun ;)"),
            );
            if (!firstStart) {
                await replyAndDelete(ctx, message, "Resuming :)");
            }
        },
    },
    {
        config: { name: "stats" },
        run: async (ctx: Ctx, message: Message) => {
            const totals = ctx.global.total;
            const seconds = Math.floor(process.uptime());
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const uptime = `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
            const stats = `
OwO Farm Bot Stable Statistics:
===================
- State: ${ctx.state?.status ?? "unknown"}
- Hunt: ${totals.hunt}
- Battle: ${totals.battle}
- Captcha: ${totals.captcha}
- Pray: ${totals.pray}
- Curse: ${totals.curse}
===================
- Uptime: ${uptime}
        `;
            await replyAndDelete(ctx, message, `\`\`\`${stats}\`\`\``);
        },
    },
];
