const { getrand, capitalize } = require("../core/globalutil.js");
const { withRateLimit } = require("../services/errors.js");

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
    if (ctx.config.main.commands.pray) prayOrCurse(ctx, "pray");
    else if (ctx.config.main.commands.curse) prayOrCurse(ctx, "curse");
};

/**
 * Self-looping pray/curse command sender.
 *
 * Resolves the current commands channel from ctx each iteration so that a
 * channel change mid-session doesn't cause the loop to silently fail.
 * Waits for the bot to be idle (no captcha, no pause, no busy flags), then
 * sends the chosen command to the configured channel. If `tomain` is enabled
 * in config, the command is targeted at the main user via a mention. The total
 * count for the action is incremented and logged, and the next run is scheduled
 * after a randomized interval drawn from the `pray` config range.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {"pray"|"curse"} type - Which luck command to send.
 * @returns {void} Self-reschedules via setTimeout; never resolves a meaningful value.
 */
async function prayOrCurse(ctx, type) {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );
    await ctx.globalutil.waitWhileBusy(ctx);
    const interval = getrand(
        ctx.config.interval.pray.min,
        ctx.config.interval.pray.max,
    );

    await withRateLimit(ctx, {
        type: "Farm",
        module: capitalize(type),
        key: `luck:${type}`,
        run: async () => {
            const target = ctx.config.main.commands.tomain
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
        },
        onSuccess: () => {
            ctx.loops.schedule(
                () => prayOrCurse(ctx, type),
                interval,
                `luck:${type}`,
            );
        },
    });
}
