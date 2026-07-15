const {
    commandrandomizer,
    getrand,
    capitalize,
} = require("../core/globalutil.js");
const { withRateLimit } = require("../services/errors.js");
const { huntResult } = require("./gemHandler.js");
const { startAutophrases } = require("./autophrases.js");

/**
 * Farm module entry point — boots the hunt/battle loop and optional autophrases.
 *
 * Resolves the command channel, optionally starts the autophrases background
 * loop, then launches the self-looping {@link farmAction} handler. When hunt is
 * enabled, a battle loop is started 2s later (if battle is also enabled) so the
 * two actions alternate rather than collide on the same cooldown.
 *
 * @param {Client} ctx - The Discord ctx instance; carries config, logger and global state.
 * @returns {void} Kicks off the looping handlers; does not return a meaningful value.
 */
module.exports = async (ctx) => {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );

    if (ctx.config.settings.autophrases) {
        startAutophrases(ctx, channel);
    }

    if (ctx.config.main.commands.hunt) {
        await farmAction(ctx, channel, {
            type: "hunt",
            cmd: () => commandrandomizer(["h", "hunt"]),
            onResult: huntResult,
        });
        await ctx.delay(2000);
        if (ctx.config.main.commands.battle)
            await farmAction(ctx, channel, {
                type: "battle",
                cmd: () => commandrandomizer(["b", "battle"]),
            });
    } else if (ctx.config.main.commands.battle)
        await farmAction(ctx, channel, {
            type: "battle",
            cmd: () => commandrandomizer(["b", "battle"]),
        });
};

/**
 * Generic self-looping action for hunt or battle.
 *
 * Waits for the bot to be idle, then blocks other competing actions via the
 * `ctx.global[type]` flag and sends the randomized command. The global
 * counter for the action is incremented and logged. If an `onResult` handler is
 * supplied (hunt only) it is awaited to process the response (e.g. gem checks).
 * The `ctx.global[type]` flag is always cleared in the `finally` block and
 * the next iteration is scheduled after a randomized interval from config.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {Object} opts - Action configuration.
 * @param {"hunt"|"battle"} opts.type - Which action this loop performs.
 * @param {() => string} opts.cmd - Returns the randomized base command token (without prefix).
 * @param {(ctx: Client, channel: TextChannel, msg: Object) => Promise<void>} [opts.onResult] - Optional handler run against the sent message's reply.
 * @returns {void} Self-reschedules via setTimeout; does not return a value.
 */
async function farmAction(ctx, channel, { type, cmd, onResult }) {
    await ctx.globalutil.waitWhileBusy(ctx);
    while (ctx.global.use || ctx.global[type]) {
        await ctx.delay(500);
    }

    const interval = getrand(
        ctx.config.interval[type].min,
        ctx.config.interval[type].max,
    );

    const moduleName = capitalize(type);

    await withRateLimit(ctx, {
        type: "Farm",
        module: moduleName,
        key: `farm:${type}`,
        run: async () => {
            if (ctx.global[type === "hunt" ? "battle" : "hunt"])
                await ctx.delay(1500);
            ctx.global[type] = true;
            const msg = await channel.send({
                content: `${ctx.prefix()} ${cmd()}`,
            });
            ctx.global.total[type]++;
            ctx.logger.info(
                "Farm",
                moduleName,
                `Total ${type}: ${ctx.global.total[type]}`,
            );
            if (onResult) await onResult(ctx, channel, msg);
            await ctx.delay(1000);
        },
        onFinally: () => {
            ctx.global[type] = false;
        },
        onSuccess: () => {
            ctx.loops.schedule(
                () => farmAction(ctx, channel, { type, cmd, onResult }),
                interval,
                `farm:${type}`,
            );
        },
    });
}
