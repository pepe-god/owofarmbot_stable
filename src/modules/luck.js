const { getrand } = require("../core/globalutil.js");

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Luck module entry point — starts the pray/curse loop.
 *
 * Sends either `pray` or `curse` commands (never both) to maintain the luck
 * buff, depending on which option is enabled in config. The actual sending
 * and rescheduling is delegated to {@link prayOrCurse}, which loops itself.
 *
 * @param {Client} client - The Discord client instance; carries config, logger and global state.
 * @returns {void} This function only kicks off the self-looping handler.
 */
module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);

    if (client.basic.commands.pray) prayOrCurse(client, channel, "pray");
    else if (client.basic.commands.curse) prayOrCurse(client, channel, "curse");
};

/**
 * Self-looping pray/curse command sender.
 *
 * Waits for the bot to be idle (no captcha, no pause, no busy flags), then
 * sends the chosen command to the configured channel. If `tomain` is enabled
 * in config, the command is targeted at the main user via a mention. The total
 * count for the action is incremented and logged, and the next run is scheduled
 * after a randomized interval drawn from the `pray` config range.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {"pray"|"curse"} type - Which luck command to send.
 * @returns {void} Self-reschedules via setTimeout; never resolves a meaningful value.
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
