/**
 * Handle the autostart flow on ready.
 *
 * If `autostart` is enabled, clears any stale captcha flag, unpauses
 * the bot, and triggers `mainHandler` after a short delay.
 * Distinguishes first start from resume-after-pause via `temp.started`.
 *
 * @param {Client} ctx - The Discord ctx instance.
 */
async function handleAutoStart(ctx) {
    // Respect the `autostart` toggle in config.
    if (!ctx.basic.autostart) return;
    // If already running, there is nothing to do.
    if (!ctx.global.paused) {
        return ctx.logger.warn("Bot", "AutoStart", "Bot is already working!!!");
    }

    // Clear a stale captcha flag from a previous session, then unpause.
    if (ctx.global.captchadetected) {
        ctx.state.captchaSolved();
    }
    ctx.state.resume();

    // loops.tryStart() is the single atomic gate for first-start vs. resume.
    // First time -> start the orchestrator; later (after a pause) -> just resume.
    if (ctx.loops.tryStart()) {
        ctx.global.temp.started = true;
        ctx.logger.info("Bot", "AutoStart", "BOT started have fun ;)");

        // Small delay so the ctx/RPC is fully settled before orchestrating.
        setTimeout(() => {
            require("../services/mainHandler.js")(ctx);
        }, 1000);
    } else {
        ctx.logger.info("Bot", "AutoStart", "Restarted BOT after a pause :3");
    }
}

/**
 * Ready event'te yapılan hazırlık adımlarını yönetir:
 *   - autostart açıksa botu ilk/tekrar başlatma
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
 * Periodically trim the Discord message cache to avoid unbounded memory
 * growth. Runs every 5 minutes via {@link LoopManager} and deletes the
 * oldest ~85% of cached messages across all visible channels.
 *
 * Using LoopManager instead of a raw `setInterval` ensures the sweeper is
 * tracked and can be cancelled by {@link LoopManager#stopAll} during restarts,
 * preventing duplicate sweepers on reconnection.
 *
 * @param {Client} ctx - The Discord ctx instance.
 */
function setupSweeper(ctx) {
    const SWEEPER_INTERVAL = 5 * 60 * 1000;

    async function sweep() {
        ctx.client.channels.cache.forEach((channel) => {
            if (channel.messages) {
                const messagesArray = Array.from(
                    channel.messages.cache.values(),
                );
                messagesArray.sort(
                    (a, b) => a.createdTimestamp - b.createdTimestamp,
                );
                // Keep only the newest ~15% of cached messages to bound RAM.
                const messagesToDelete = Math.floor(
                    messagesArray.length * 0.85,
                );
                for (let i = 0; i < messagesToDelete; i++) {
                    channel.messages.cache.delete(messagesArray[i].id);
                }
            }
        });

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
