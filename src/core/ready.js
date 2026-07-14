// OwO Bot Support sunucusunun sabit guild ID'si.
const { OWO_SUPPORT_GUILD_ID } = require("./constants.js");

/**
 * Handle the autostart flow on ready.
 *
 * If `autostart` is enabled, clears any stale captcha flag, unpauses
 * the bot, updates RPC, and triggers `mainHandler` after a short delay.
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
    ctx.rpc("update");

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
 *   - OwO support sunucusu üyeliği kontrolü
 *   - RPC durumu güncelleme
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
    if (ctx.config.settings.autojoingiveaways) {
        // Check membership of the OwO support server; giveaways are only
        // auto-joinable if we are a member.
        const guild = ctx.client.guilds.cache.get(OWO_SUPPORT_GUILD_ID);

        if (guild) {
            ctx.logger.info(
                "Bot",
                "Startup",
                "You are in the OwO Bot Support server. I will automatically enter the giveaways :)",
            );
            ctx.global.owosupportserver = true;
        } else {
            ctx.logger.alert(
                "Bot",
                "Startup",
                "You are not in the OwO Bot Support server. Please join to the server and restart the bot to automatically enter giveaways",
            );
        }
    }

    ctx.rpc("start");
    await handleAutoStart(ctx);
};

/**
 * Periodically trim the Discord message cache to avoid unbounded memory
 * growth. Runs every 5 minutes and deletes the oldest ~85% of cached
 * messages across all visible channels.
 *
 * @param {Client} botClient - The Discord ctx instance.
 */
function setupSweeper(botClient) {
    setInterval(
        () => {
            botClient.client.channels.cache.forEach((channel) => {
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

            botClient.logger.warn(
                "Bot",
                "Cache",
                `Cleared oldest 85% of message cache for [${botClient.client.user.username}].`,
            );
        },
        5 * 60 * 1000,
    );
}
