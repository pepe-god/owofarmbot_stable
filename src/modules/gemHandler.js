const { commandrandomizer, getrand } = require("../core/globalutil.js");
const { OWO_ID, REQUIRED_GEMS } = require("../core/constants.js");

/**
 * Recompute `ctx.global.gems.need` from the hunt reply (missing REQUIRED_GEMS + first-time event star) and delegate to handleMissingGems.
 * @param {Client} ctx - The Discord ctx instance; holds gem and event state.
 * @param {TextChannel} channel - The text channel where the hunt was sent.
 * @param {Object} huntmsg - The message object of the sent hunt command (used as a reply floor).
 * @returns {Promise<void>} Resolves once gem needs are computed (or aborts on timeout/empty result).
 */
async function huntResult(ctx, channel, huntmsg) {
    if (!ctx.config.settings.inventory.use.gems) return;

    const message = await ctx.globalutil.waitForMessage(
        ctx,
        channel,
        (msg) =>
            (msg.content.includes("and caught a") ||
                msg.content.includes("You found:")) &&
            msg.author.id === OWO_ID &&
            msg.channel.id === channel.id &&
            msg.id.localeCompare(huntmsg.id) > 0,
    );

    if (message == null) {
        ctx.logger.alert("Farm", "Hunt", "Couldn't retrieve hunting result!");
        return;
    }

    const huntmsgcontent = message.content;
    ctx.global.gems.need = [];
    ctx.global.gems.use = "";
    ctx.global.gems.huntssinceinv++;

    if (!huntmsgcontent) return;

    for (const gem of REQUIRED_GEMS) {
        if (!huntmsgcontent.includes(gem)) ctx.global.gems.need.push(gem);
    }

    if (ctx.global.gems.isevent) {
        if (!huntmsgcontent.includes("star")) {
            if (!ctx.global.temp.usedevent) {
                ctx.global.gems.need.push("star");
                ctx.global.temp.usedevent = true;
            } else {
                ctx.global.gems.isevent = false;
                ctx.logger.info("Farm", "Hunt", "Event not found");
            }
        } else ctx.global.temp.usedevent = false;
    }

    if (ctx.global.gems.need.length > 0) {
        handleMissingGems(ctx, channel, message.content);
    }
}

/**
 * Resolve missing gems: first shortage opens all lootboxes + inventory in 5s; a lootbox drop or 15–30 hunts since last check triggers inventory in 2s.
 * @param {Client} ctx - The Discord ctx instance; holds gem/inventory state.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {string} huntContent - Raw content of the hunt result message.
 * @returns {void} May schedule inventory runs via setTimeout.
 */
/**
 * Schedule an inventory run after `delay` ms (tracked so it cancels on restart).
 * @param {Object} ctx - The bot context.
 * @param {number} delay - Milliseconds before the inventory module runs.
 */
function triggerInventory(ctx, delay) {
    ctx.loops.schedule(
        () => require("./inventory.js")(ctx),
        delay,
        "farm:inventory",
    );
}

function handleMissingGems(ctx, channel, huntContent) {
    ctx.logger.warn("Farm", "Hunt", `Missing gems: ${ctx.global.gems.need}`);
    if (!ctx.config.main.commands.inventory) return;

    if (!ctx.global.gems.missingHandled) {
        ctx.global.gems.missingHandled = true;
        ctx.global.gems.huntssinceinv = 0;
        channel.send({
            content: `${ctx.prefix()} ${commandrandomizer(["lb", "lootbox"])} all`,
        });
        triggerInventory(ctx, 5000);
        return;
    }

    if (huntContent?.includes("lootbox")) {
        ctx.global.gems.huntssinceinv = 0;
        triggerInventory(ctx, 2000);
        return;
    }

    if (ctx.global.gems.huntssinceinv >= getrand(15, 30)) {
        ctx.global.gems.huntssinceinv = 0;
        triggerInventory(ctx, 2000);
    }
}

module.exports = { huntResult };
