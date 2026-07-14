/**
 * Send a reply message to the command channel and optionally delete
 * the triggering command message for a clean UX.
 *
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
 * Admin command definitions.
 *
 * Commands:
 *  - pause: Pause the bot.
 *  - restart: Restart the entire process.
 *  - start/resume: Resume or start the bot.
 *  - stats: Display runtime statistics.
 */
const commands = [
    {
        config: { name: "pause" },
        run: async (ctx, message) => {
            // Toggle the global pause flag and refresh the Discord RPC status.
            if (ctx.global.paused) {
                await replyAndDelete(ctx, message, "Bot is already paused!!!");
            } else {
                ctx.global.paused = true;
                ctx.rpc("update");
                await replyAndDelete(ctx, message, "Paused :)");
            }
        },
    },
    {
        config: { name: "restart", aliases: ["reboot", "stop"] },
        run: async (ctx, message) => {
            // Destroy the Discord connection and force-exit; a process manager
            // (or the cluster fork in main.js) is expected to restart us.
            await message.channel.send("The bot is being restarted...");
            ctx.client.destroy();
            setTimeout(() => process.exit(1), 1000);
        },
    },
    {
        config: { name: "start", aliases: ["resume"] },
        run: async (ctx, message) => {
            // Guard: can't resume something that isn't paused.
            if (!ctx.global.paused) {
                return replyAndDelete(
                    ctx,
                    message,
                    "Bot is already working!!!",
                );
            }
            // A captcha flag from a previous session must be cleared on resume.
            if (ctx.global.captchadetected) ctx.global.captchadetected = false;
            ctx.global.paused = false;
            ctx.rpc("update");
            // First ever start -> launch the full farming orchestrator.
            // `loops.tryStart()` is the single atomic gate; it returns true
            // exactly once, so a duplicate start becomes a plain resume.
            if (ctx.loops.tryStart()) {
                ctx.global.temp.started = true;
                await replyAndDelete(ctx, message, "BOT started have fun ;)");
                setTimeout(
                    () => require("../services/mainHandler.js")(ctx),
                    1000,
                );
            } else {
                // Already started before -> just unpause the existing loops.
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
- Hunt: ${totals.hunt}
- Battle: ${totals.battle}
- Captcha: ${totals.captcha}
- Pray: ${totals.pray}
- Curse: ${totals.curse}
- Vote: ${totals.vote}
- Giveaway: ${totals.giveaway}
===================
- Uptime: ${uptime}
        `;
            await replyAndDelete(ctx, message, `\`\`\`${stats}\`\`\``);
        },
    },
];

module.exports = commands;
