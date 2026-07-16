const {
    commandrandomizer,
    getrand,
    capitalize,
} = require("../core/globalutil.js");
const { withRateLimit } = require("../services/errors.js");
const { huntResult } = require("./gemHandler.js");
const { startAutophrases } = require("./autophrases.js");

/**
 * Boots the hunt/battle loop (battle starts 2s after hunt) and optional autophrases.
 * @param {Client} ctx - The Discord ctx instance; carries config, logger and global state.
 * @param {Message} [message] - The originating command message (unused, kept for API compatibility).
 * @returns {void}
 */
async function startFarm(ctx, message) {
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
}

/**
 * Self-looping hunt/battle sender: waits for idle, sends the randomized command, increments the counter, and reschedules after a randomized interval.
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {Object} opts - Action configuration.
 * @param {"hunt"|"battle"} opts.type - Which action this loop performs.
 * @param {() => string} opts.cmd - Returns the randomized base command token (without prefix).
 * @param {(ctx: Client, channel: TextChannel, msg: Object) => Promise<void>} [opts.onResult] - Optional handler run against the sent message's reply.
 * @returns {void} Self-reschedules via setTimeout.
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

module.exports = { startFarm, farmAction };
module.exports.default = startFarm;