const { getrand } = require("../utils/globalutil.js");

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Luck module entry point.
 *
 * Sends pray or curse commands on a randomized interval to maintain
 * the luck buff. Only one mode (pray or curse) is active at a time.
 *
 * @param {Client} client - The Discord client instance.
 */
module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);

    if (client.basic.commands.pray) prayOrCurse(client, channel, "pray");
    else if (client.basic.commands.curse) prayOrCurse(client, channel, "curse");
};

/**
 * Self-looping pray or curse command sender.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel.
 * @param {string} type - "pray" or "curse".
 */
async function prayOrCurse(client, channel, type) {
    await client.globalutil.waitWhileBusy(client);
    const interval = getrand(
        client.config.interval.pray.min,
        client.config.interval.pray.max,
    );
    try {
        channel.sendTyping();
        const target = client.basic.commands.tomain
            ? ` <@${client.config.main.userid}>`
            : "";
        const content = `${client.prefix()}${type}${target}`;
        await channel.send({ content });
        client.global.total[type]++;
        client.logger.info(
            "Farm",
            capitalize(type),
            `Total ${type}ed time: ${client.global.total[type]}`,
        );
    } catch (err) {
        client.logger.alert(
            "Farm",
            capitalize(type),
            `Error while ${type}ing: ${err}`,
        );
        client.logger.debug(err);
    } finally {
        setTimeout(() => {
            prayOrCurse(client, channel, type);
        }, interval);
    }
}
