const { getrand } = require("../utils/globalutil.js");

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);

    if (client.basic.commands.pray) prayOrCurse(client, channel, "pray");
    else if (client.basic.commands.curse) prayOrCurse(client, channel, "curse");
};

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
