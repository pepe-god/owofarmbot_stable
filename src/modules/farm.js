const { commandrandomizer, capitalize } = require("../core/globalutil.js");
const { selfLoop } = require("./loop.js");
const { huntResult } = require("./gemHandler.js");
const { startAutophrases } = require("./autophrases.js");

/**
 * Boots the hunt/battle loop (battle starts 2s after hunt) and optional autophrases.
 * @param {Object} ctx - The bot context; carries config, logger and global state.
 * @returns {void}
 */
async function startFarm(ctx) {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );

    if (ctx.config.settings.autophrases) {
        startAutophrases(ctx, channel);
    }

    if (ctx.config.main.commands.hunt) {
        startFarmAction(ctx, channel, "hunt", () =>
            commandrandomizer(["h", "hunt"]),
        );
        await ctx.delay(2000);
        if (ctx.config.main.commands.battle)
            startFarmAction(ctx, channel, "battle", () =>
                commandrandomizer(["b", "battle"]),
            );
    } else if (ctx.config.main.commands.battle)
        startFarmAction(ctx, channel, "battle", () =>
            commandrandomizer(["b", "battle"]),
        );
}

/**
 * Start a hunt or battle self-loop.
 * @param {Object} ctx - The bot context.
 * @param {TextChannel} channel - Channel to send in.
 * @param {"hunt"|"battle"} type - Which action this loop performs.
 * @param {() => string} cmd - Returns the randomized base command token.
 */
function startFarmAction(ctx, channel, type, cmd) {
    const other = type === "hunt" ? "battle" : "hunt";
    selfLoop(ctx, channel, {
        type,
        key: `farm:${type}`,
        intervalKey: type,
        buildContent: () => `${ctx.prefix()} ${cmd()}`,
        onRun: async (c, ch, msg) => {
            // Avoid running hunt and battle in the same instant.
            if (c.global[other]) await c.delay(1500);
            c.global.total[type]++;
            c.logger.info(
                "Farm",
                capitalize(type),
                `Total ${type}: ${c.global.total[type]}`,
            );
            if (type === "hunt") await huntResult(c, ch, msg);
        },
        onFinally: () => {
            ctx.global[type] = false;
        },
        // Mark the busy flag before sending so concurrent loops coordinate.
        beforeRun: () => {
            ctx.global[type] = true;
        },
    });
}

module.exports = { startFarm };
