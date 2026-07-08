const { getrand } = require("../core/globalutil.js");

/**
 * Animal module entry point — sells or sacrifices animals on a loop.
 *
 * Self-looping module that periodically sends a sell or sacrifice command for
 * the configured animal types. If the bot is paused or a captcha is detected,
 * the function re-schedules itself after a fixed cooldown instead of sending.
 * On completion (success or error) it reschedules the next run using the
 * randomized `animals` interval defined in config.
 *
 * @param {Client} client - The Discord client instance (carries config, logger and global state).
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {string} choose - The action to perform, either `"sell"` or `"sacrifice"`.
 * @param {string} types - Space-separated animal type suffixes (e.g. `"cow duck"`).
 * @returns {void} This function does not return a value; it self-reschedules via setTimeout.
 */
module.exports = async function sell(client, channel, choose, types) {
    if (client.global.captchadetected || client.global.paused) {
        setTimeout(() => {
            sell(client, channel, choose, types);
        }, 16000);
        return;
    }
    try {
        channel.sendTyping();
        await channel.send({
            content: `${client.prefix()} ${choose} ${types}`,
        });
    } catch (err) {
        client.logger.alert("Farm", "Sell", `Failed to sell: ${err}`);
        client.logger.debug(err);
    } finally {
        setTimeout(
            () => {
                sell(client, channel, choose, types);
            },
            getrand(
                client.config.interval.animals.min,
                client.config.interval.animals.max,
            ),
        );
    }
};
