// OwO Bot Support sunucusunun sabit guild ID’si.
const OWO_SUPPORT_GUILD_ID = "420104212895105044";

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
    if (!client.basic.autostart) return;
    if (!client.global.paused) {
        return client.logger.warn(
            "Bot",
            "AutoStart",
            "Bot is already working!!!",
        );
    }

    if (client.global.captchadetected) {
        client.global.captchadetected = false;
    }
    client.global.paused = false;
    client.rpc("update");

    if (!client.global.temp.started) {
        client.global.temp.started = true;
        client.logger.info("Bot", "AutoStart", "BOT started have fun ;)");

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
 * Ready event’te yapılan hazırlık adımlarını yönetir:
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
