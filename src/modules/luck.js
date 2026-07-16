const { capitalize } = require("../core/globalutil.js");
const { selfLoop } = require("./loop.js");

/**
 * Starts the pray/curse loop (whichever is enabled in config).
 * @param {Object} ctx - The bot context; carries config, logger and global state.
 * @returns {void}
 */
async function startLuck(ctx) {
    if (ctx.config.main.commands.pray) prayOrCurse(ctx, "pray");
    else if (ctx.config.main.commands.curse) prayOrCurse(ctx, "curse");
}

/**
 * Self-looping pray/curse sender.
 * @param {Object} ctx - The bot context.
 * @param {"pray"|"curse"} type - Which luck command to send.
 */
function prayOrCurse(ctx, type) {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );
    const target = ctx.config.main.commands.tomain
        ? ` <@${ctx.config.main.userid}>`
        : "";

    selfLoop(ctx, channel, {
        type,
        key: `luck:${type}`,
        intervalKey: "pray",
        buildContent: () => `${ctx.prefix()}${type}${target}`,
        onRun: (c) => {
            c.global.total[type]++;
            c.logger.info(
                "Farm",
                capitalize(type),
                `Total ${type}: ${c.global.total[type]}`,
            );
        },
    });
}

module.exports = { startLuck };
