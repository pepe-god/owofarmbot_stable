const { getrand } = require("../utils/globalutil.js");

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
