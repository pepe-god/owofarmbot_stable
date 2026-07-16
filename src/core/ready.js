/**
 * Handle the autostart flow on ready: if `autostart` is enabled, clears stale captcha flag, unpauses, and triggers `mainHandler` (first start vs. resume via `temp.started`).
 * @param {Object} ctx - The bot context.
 */
async function handleAutoStart(ctx) {
    // Respect the `autostart` toggle in config.
    if (!ctx.config.main.autostart) return;
    // If already running, there is nothing to do.
    if (!ctx.global.paused) {
        return ctx.logger.warn("Bot", "AutoStart", "Bot is already working!!!");
    }

    const firstStart = require("../services/mainHandler.js").startOrResume(ctx);
    if (firstStart) {
        ctx.logger.info("Bot", "AutoStart", "BOT started have fun ;)");
    } else {
        ctx.logger.info("Bot", "AutoStart", "Restarted BOT after a pause :3");
    }
}

/**
 * Ready event handler: logs startup, sets up the cache sweeper, and runs autostart.
 */
module.exports = async (ctx) => {
    ctx.logger.info(
        "Bot",
        "Startup",
        `${ctx.chalk.red(`${ctx.client.user.username}`)} is ready!`,
    );
    setupSweeper(ctx);

    ctx.global.temp.isready = true;

    await handleAutoStart(ctx);
};

/**
 * Periodically trim the Discord message cache (oldest 85% every 5 min) via LoopManager so it is trackable/cancellable on restart.
 * @param {Client} ctx - The Discord ctx instance.
 */
function setupSweeper(ctx) {
    const SWEEPER_INTERVAL = 5 * 60 * 1000;

    async function sweep() {
        for (const channel of ctx.client.channels.cache.values()) {
            if (!channel.messages) continue;
            if (channel.messages.cache.size === 0) continue;

            // Delete first 85% by Map insertion order (no O(n log n) sort).
            const messagesToDelete = Math.floor(
                channel.messages.cache.size * 0.85,
            );
            let i = 0;
            for (const [id] of channel.messages.cache) {
                if (i >= messagesToDelete) break;
                channel.messages.cache.delete(id);
                i++;
            }
        }

        ctx.logger.warn(
            "Bot",
            "Cache",
            `Cleared oldest 85% of message cache for [${ctx.client.user.username}].`,
        );

        // Self-reschedule through LoopManager so the timer is trackable.
        ctx.loops.schedule(sweep, SWEEPER_INTERVAL, "sweeper");
    }

    ctx.loops.schedule(sweep, SWEEPER_INTERVAL, "sweeper");
}
