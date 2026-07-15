const { commandrandomizer, getrand } = require("../core/globalutil.js");
const { OWO_ID, REQUIRED_GEMS } = require("../core/constants.js");

/**
 * Analyze a hunt result for missing gems or the active event star, then queue
 * inventory usage if any required item is absent.
 *
 * Only runs when gem usage is enabled in config. Waits for OwO's hunt-result
 * reply (a catch or "You found:" message newer than the sent command), then
 * recomputes `ctx.global.gems.need`: any of the `REQUIRED_GEMS` missing from
 * the message, plus the event `star` the first time it is expected (and clears
 * the event flag if it never appears). When items are missing, {@link
 * handleMissingGems} is invoked to decide how to resolve them.
 *
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
 * Decide how to resolve missing gems detected by {@link huntResult}.
 *
 * Policy:
 *  - First time gems are missing: immediately open **all** lootboxes, then run
 *    the inventory module 5s later to apply gems.
 *  - If the current hunt dropped a lootbox: run the inventory module 2s later.
 *  - Otherwise: once enough hunts have passed without an inventory check
 *    (random 15–30), run the inventory module 2s later.
 *
 * No-op when the inventory command is disabled in config.
 *
 * @param {Client} ctx - The Discord ctx instance; holds gem/inventory state.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {string} huntContent - Raw content of the hunt result message.
 * @returns {void} May schedule inventory runs via setTimeout; does not return a value.
 */
function handleMissingGems(ctx, channel, huntContent) {
    ctx.logger.warn("Farm", "Hunt", `Missing gems: ${ctx.global.gems.need}`);
    if (!ctx.config.main.commands.inventory) return;

    if (!ctx.global.gems.missingHandled) {
        ctx.global.gems.missingHandled = true;
        ctx.global.gems.huntssinceinv = 0;
        channel.send({
            content: `${ctx.prefix()} ${commandrandomizer(["lb", "lootbox"])} all`,
        });
        ctx.loops.schedule(
            () => {
                require("./inventory.js")(ctx);
            },
            5000,
            "farm:inventory",
        );
        return;
    }

    if (huntContent?.includes("lootbox")) {
        ctx.global.gems.huntssinceinv = 0;
        ctx.loops.schedule(
            () => {
                require("./inventory.js")(ctx);
            },
            2000,
            "farm:inventory",
        );
        return;
    }

    if (ctx.global.gems.huntssinceinv >= getrand(15, 30)) {
        ctx.global.gems.huntssinceinv = 0;
        ctx.loops.schedule(
            () => {
                require("./inventory.js")(ctx);
            },
            2000,
            "farm:inventory",
        );
    }
}

module.exports = { REQUIRED_GEMS, huntResult, handleMissingGems };
