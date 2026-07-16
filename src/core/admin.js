/**
 * Delete the triggering command message and optionally send a reply (if chatfeedback is on).
 * @param {Client} ctx - The Discord ctx instance.
 * @param {Message} message - The command message to delete.
 * @param {string} text - The reply text to send.
 */
async function replyAndDelete(ctx, message, text) {
    await message.delete();
    if (ctx.config.settings.chatfeedback) {
        await message.channel.send({ content: text });
    }
}

/**
 * Admin command definitions: pause, restart, start/resume, stats.
 */
const commands = [
    {
        config: { name: "pause" },
        run: async (ctx, message) => {
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
        run: async (ctx, message) => {
            // Graceful shutdown: stop loops, close Discord, force-exit (cluster primary re-forks).
            await message.channel.send("The bot is being restarted...");
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
        run: async (ctx, message) => {
            if (!ctx.global.paused) {
                return replyAndDelete(
                    ctx,
                    message,
                    "Bot is already working!!!",
                );
            }
            // Clear a stale captcha flag from a previous session on resume.
            if (ctx.global.captchadetected) ctx.state.captchaSolved();
            ctx.state.resume();
            // `loops.tryStart()` is the atomic gate: true exactly once (first start), else plain resume.
            if (ctx.loops.tryStart()) {
                ctx.global.temp.started = true;
                await replyAndDelete(ctx, message, "BOT started have fun ;)");
                setTimeout(
                    () => require("../services/mainHandler.js")(ctx),
                    1000,
                );
            } else {
                await replyAndDelete(ctx, message, "Resuming :)");
            }
        },
    },
    {
        config: { name: "stats" },
        run: async (ctx, message) => {
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

module.exports = commands;
