const { commandrandomizer } = require("../core/globalutil.js");
const { OWO_ID, GEM_ITEMS } = require("../core/constants.js");

/**
 * Map of special inventory item codes -> how to consume them.
 * `setting` toggles the item on/off via config; `cmd` builds the use command.
 */
const ITEM_ACTIONS = {
    "050": {
        setting: "lootbox",
        cmd: () => commandrandomizer(["lb", "lootbox"]),
    },
    "049": { setting: "fabledlootbox", cmd: () => "lootbox fabled" },
    100: { setting: "crate", cmd: () => commandrandomizer(["wc", "crate"]) },
};

/**
 * Entry point: resolves the commands channel and runs the one-shot {@link inventory} routine (invoked on demand, not self-rescheduling).
 * @param {Client} ctx - The Discord ctx instance; carries config, logger and global state.
 * @returns {Promise<void>} Resolves once the inventory routine has finished.
 */
module.exports = async (ctx) => {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );
    await inventory(ctx, channel);
};

// Exported for unit testing (behavior unchanged).
module.exports.parseItemCodes = parseItemCodes;
module.exports.selectGemCodes = selectGemCodes;
module.exports.useItemsFromInventory = useItemsFromInventory;

/**
 * Send `owo inv`, wait for OwO's "Inventory =" reply (newer than the command); returns null on timeout or pause/captcha.
 * @param {Client} ctx - The Discord ctx instance (sets `global.inventory`).
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<string|null>} Raw inventory message content, or null on timeout/pause.
 */
async function fetchInventoryData(ctx, channel) {
    ctx.state.startInventory();
    ctx.logger.info(
        "Farm",
        "Inventory",
        "Paused: true! Retrieving inventory...",
    );

    const msg = await channel.send({
        content: `owo ${commandrandomizer(["inv", "inventory"])}`,
    });

    const reply = await ctx.globalutil.waitForMessage(
        ctx,
        channel,
        (m) =>
            m.content.includes("Inventory =") &&
            m.author.id === OWO_ID &&
            m.channel.id === channel.id &&
            m.id.localeCompare(msg.id) > 0,
    );

    if (reply == null) {
        ctx.logger.alert("Farm", "inventory", "Couldn't retrieve inventory");
        return null;
    }

    if (ctx.global.captchadetected || ctx.global.paused) return null;
    return reply.content;
}

/**
 * Extract backtick-quoted item codes (e.g. `` `057` ``) from the inventory response, in order of appearance.
 * @param {string} invContent - Raw inventory message content.
 * @returns {string[]} Array of item codes found between backticks.
 */
function parseItemCodes(invContent) {
    const values = [];
    // OwO lists item codes as 2-3 digit numbers wrapped in backticks
    // (e.g. `057`). Match only the backtick-quoted codes so arbitrary
    // numbers in the reply (quantities, ranks, ids) are ignored.
    const regex = /`(\d{2,3})`/g;
    let match;
    while ((match = regex.exec(invContent)) !== null) {
        values.push(match[1]);
    }
    return values;
}

/**
 * For each needed gem, append the weakest owned `GEM_ITEMS` code usable at the current `rareLevel` to `ctx.global.gems.use`.
 * @param {Client} ctx - The Discord ctx instance; reads `global.gems.need`, `global.rareLevel`, and writes `global.gems.use`.
 * @param {string[]} values - Extracted inventory item codes.
 * @returns {void} Mutates `ctx.global.gems.use`.
 */
function selectGemCodes(ctx, values) {
    if (
        ctx.global.gems.need.length === 0 ||
        !ctx.config.settings.inventory.use.gems
    )
        return;

    ctx.global.gems.need.forEach((gem) => {
        const codes = GEM_ITEMS[gem];
        if (!codes) return;
        // GEM_ITEMS lists strongest-first; pick the highest-quality owned code
        // OwO actually has (falls back to weaker ones if the best is absent).
        for (let i = 0; i < codes.length; i++) {
            if (values.includes(codes[i])) {
                ctx.global.gems.use += `${codes[i]} `;
                break;
            }
        }
    });
}

/**
 * For each enabled `ITEM_ACTIONS` code, send its use command ("all") and reset the hunt-since-inventory counter; 2.5s delay between uses.
 * @param {Client} ctx - The Discord ctx instance; reads `config.settings.inventory.use`.
 * @param {TextChannel} channel - The commands channel.
 * @param {string[]} values - Extracted inventory item codes.
 * @returns {Promise<void>} Resolves after all enabled items have been used.
 */
async function useItemsFromInventory(ctx, channel, values) {
    for (const code of values) {
        const action = ITEM_ACTIONS[code];
        if (!action) continue;
        if (ctx.config.settings.inventory.use[action.setting]) {
            await use(ctx, channel, action.cmd(), "all", "inventory");
            ctx.global.gems.huntssinceinv = 0;
        }
        await ctx.delay(2500);
    }
}

/**
 * Send one `use <gem codes>` command for everything queued by {@link selectGemCodes}, then clear gem need/use state and the "missing handled" flag.
 * @param {Client} ctx - The Discord ctx instance; reads/writes `global.gems`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves after the gem use command has been sent.
 */
async function applyGems(ctx, channel) {
    if (ctx.global.gems.use.length === 0) return;

    await use(ctx, channel, `use ${ctx.global.gems.use}`, "", "inventory");
    ctx.global.gems.need = [];
    ctx.global.gems.use = "";
    ctx.global.gems.huntssinceinv = 0;
    ctx.global.gems.missingHandled = false;
    await ctx.delay(3000);
}

/**
 * Core routine: fetch inventory, select gem codes, use enabled items, apply gems, then clear the inventory flag (always, via finally).
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves once the routine has completed (success or abort).
 */
async function inventory(ctx, channel) {
    if (ctx.global.captchadetected || ctx.global.paused || ctx.global.inventory)
        return;

    try {
        const invContent = await fetchInventoryData(ctx, channel);
        if (invContent == null) return;

        const codes = parseItemCodes(invContent);
        ctx.logger.info(
            "Farm",
            "Inventory",
            `Parsed codes: ${codes.join(",")}`,
        );
        selectGemCodes(ctx, codes);
        ctx.logger.info(
            "Farm",
            "Inventory",
            `Gems to use: "${ctx.global.gems.use}" (need: ${ctx.global.gems.need.join(",")})`,
        );

        await ctx.delay(4000);
        await useItemsFromInventory(ctx, channel, codes);
        await applyGems(ctx, channel);

        ctx.logger.info("Farm", "Inventory", `Paused: ${ctx.global.inventory}`);
    } finally {
        ctx.state.endInventory();
    }
}

/**
 * Send a generic use/item command; sets `global.use`, aborts on captcha or pause (except `"inventory"` caller), releases the flag after a 5s cooldown.
 * @param {Client} ctx - The Discord ctx instance (sets `global.use`).
 * @param {TextChannel} channel - The commands channel.
 * @param {string} item - The item/command string to send (after the prefix).
 * @param {string} count - Quantity such as `"all"`, or `""` for the default.
 * @param {string} where - Caller context; `"inventory"` is exempt from the pause guard.
 * @returns {Promise<void>} Resolves after the command is sent and the cooldown elapses.
 */
async function use(ctx, channel, item, count, where) {
    if (
        ctx.global.captchadetected ||
        (ctx.global.paused && where !== "inventory")
    )
        return;
    ctx.global.use = true;
    try {
        await channel.send({ content: `${ctx.prefix()} ${item} ${count}` });
        ctx.logger.info("Farm", "Use", item);
        await ctx.delay(5000);
    } finally {
        ctx.global.use = false;
    }
}
