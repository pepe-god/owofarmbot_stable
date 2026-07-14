const { getrand } = require("../core/globalutil.js");

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Luck module entry point — starts the pray/curse loop.
 *
 * Sends either `pray` or `curse` commands (never both) to maintain the luck
 * buff, depending on which option is enabled in config. The actual sending
 * and rescheduling is delegated to {@link prayOrCurse}, which loops itself.
 *
 * @param {Client} ctx - The Discord ctx instance; carries config, logger and global state.
 * @returns {void} This function only kicks off the self-looping handler.
 */
module.exports = async (ctx) => {
    const channel = ctx.client.channels.cache.get(ctx.basic.commandschannelid);

    if (ctx.basic.commands.pray) prayOrCurse(ctx, channel, "pray");
    else if (ctx.basic.commands.curse) prayOrCurse(ctx, channel, "curse");
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
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {"pray"|"curse"} type - Which luck command to send.
 * @returns {void} Self-reschedules via setTimeout; never resolves a meaningful value.
 */
async function prayOrCurse(ctx, channel, type) {
    await ctx.globalutil.waitWhileBusy(ctx);
    const interval = getrand(
        ctx.config.interval.pray.min,
        ctx.config.interval.pray.max,
    );
    try {
        channel.sendTyping();
        const target = ctx.basic.commands.tomain
            ? ` <@${ctx.config.main.userid}>`
            : "";
        const content = `${ctx.prefix()}${type}${target}`;
        await channel.send({ content });
        ctx.global.total[type]++;
        ctx.logger.info(
            "Farm",
            capitalize(type),
            `Total ${type}ed time: ${ctx.global.total[type]}`,
        );
    } catch (err) {
        ctx.logger.alert(
            "Farm",
            capitalize(type),
            `Error while ${type}ing: ${err}`,
        );
        ctx.logger.debug(err);
    } finally {
        ctx.loops.schedule(
            () => {
                prayOrCurse(ctx, channel, type);
            },
            interval,
            `luck:${type}`,
        );
    }
}
