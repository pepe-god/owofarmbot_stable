// OwO Bot Support sunucusunun sabit guild ID'si.
const { OWO_SUPPORT_GUILD_ID } = require("./constants.js");

/**
 * Handle the autostart flow on ready.
 *
 * If `autostart` is enabled, clears any stale captcha flag, unpauses
 * the bot, updates RPC, and triggers `mainHandler` after a short delay.
 * Distinguishes first start from resume-after-pause via `temp.started`.
 *
 * @param {Client} client - The Discord client instance.
 */
async function handleAutoStart(client) {
    // Respect the `autostart` toggle in config.
    if (!client.basic.autostart) return;
    // If already running, there is nothing to do.
    if (!client.global.paused) {
        return client.logger.warn(
            "Bot",
            "AutoStart",
            "Bot is already working!!!",
        );
    }

    // Clear a stale captcha flag from a previous session, then unpause.
    if (client.global.captchadetected) {
        client.global.captchadetected = false;
    }
    client.global.paused = false;
    client.rpc("update");

    // loops.tryStart() is the single atomic gate for first-start vs. resume.
    // First time -> start the orchestrator; later (after a pause) -> just resume.
    if (client.loops.tryStart()) {
        client.global.temp.started = true;
        client.logger.info("Bot", "AutoStart", "BOT started have fun ;)");

        // Small delay so the client/RPC is fully settled before orchestrating.
        setTimeout(() => {
            require("../services/mainHandler.js")(client);
        }, 1000);
    } else {
        client.logger.info(
            "Bot",
            "AutoStart",
            "Restarted BOT after a pause :3",
        );
    }
}

/**
 * Ready event'te yapılan hazırlık adımlarını yönetir:
 *   - OwO support sunucusu üyeliği kontrolü
 *   - RPC durumu güncelleme
 *   - autostart açıksa botu ilk/tekrar başlatma
 */
module.exports = async (client) => {
    client.logger.info(
        "Bot",
        "Startup",
        `${client.chalk.red(`${client.user.username}`)} is ready!`,
    );
    setupSweeper(client);

    client.global.temp.isready = true;
    if (client.config.settings.autojoingiveaways) {
        // Check membership of the OwO support server; giveaways are only
        // auto-joinable if we are a member.
        const guild = client.guilds.cache.get(OWO_SUPPORT_GUILD_ID);

        if (guild) {
            client.logger.info(
                "Bot",
                "Startup",
                "You are in the OwO Bot Support server. I will automatically enter the giveaways :)",
            );
            client.global.owosupportserver = true;
        } else {
            client.logger.alert(
                "Bot",
                "Startup",
                "You are not in the OwO Bot Support server. Please join to the server and restart the bot to automatically enter giveaways",
            );
        }
    }

    client.rpc("start");
    await handleAutoStart(client);
};

/**
 * Periodically trim the Discord message cache to avoid unbounded memory
 * growth. Runs every 5 minutes and deletes the oldest ~85% of cached
 * messages across all visible channels.
 *
 * @param {Client} botClient - The Discord client instance.
 */
function setupSweeper(botClient) {
    setInterval(
        () => {
            botClient.channels.cache.forEach((channel) => {
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
                `Cleared oldest 85% of message cache for [${botClient.user.username}].`,
            );
        },
        5 * 60 * 1000,
    );
}
