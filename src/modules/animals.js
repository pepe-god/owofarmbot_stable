const { getrand } = require("../core/globalutil.js");

/**
 * Animal module entry point.
 *
 * Self-looping module that periodically sends sell or sacrifice commands
 * for the configured animal types. Retries after a randomized interval
 * if the bot is paused or a captcha is detected.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel.
 * @param {string} choose - "sell" or "sacrifice".
 * @param {string} types - Space-separated animal type suffixes.
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
