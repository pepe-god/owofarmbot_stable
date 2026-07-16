const { getrand, capitalize } = require("../core/globalutil.js");
const { withRateLimit } = require("../services/errors.js");

/**
 * Starts the pray/curse loop (whichever is enabled in config) via {@link prayOrCurse}.
 * @param {Client} ctx - The Discord ctx instance; carries config, logger and global state.
 * @param {Message} [message] - The originating command message (unused, kept for API compatibility).
 * @returns {void}
 */
async function startLuck(ctx) {
    if (ctx.config.main.commands.pray) prayOrCurse(ctx, "pray");
    else if (ctx.config.main.commands.curse) prayOrCurse(ctx, "curse");
}

/**
 * Self-looping pray/curse sender: resolves the channel each iteration, waits for idle, sends the command (mentioning the user if `tomain`), then reschedules after a randomized interval.
 * @param {Client} ctx - The Discord ctx instance.
 * @param {"pray"|"curse"} type - Which luck command to send.
 * @returns {void} Self-reschedules via setTimeout.
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
                `Total ${type}: ${ctx.global.total[type]}`,
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

module.exports = { startLuck };
