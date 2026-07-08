const { commandrandomizer } = require("../core/globalutil.js");

const OWO_ID = "408785106942164992";

/**
 * Map of gem type -> ordered list of inventory item codes.
 * Codes are listed weakest-first so {@link selectGemCodes} can pick the first
 * one the user owns at or below their current rarity level.
 */
const GEM_ITEMS = {
    gem1: ["057", "056", "055", "054", "053", "052", "051"],
    gem3: ["071", "070", "069", "068", "067", "066", "065"],
    gem4: ["078", "077", "076", "075", "074", "073", "072"],
    star: ["085", "084", "083", "082", "081", "080", "079"],
};

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
 * Inventory module entry point — runs the inventory consumption loop.
 *
 * Resolves the commands channel and runs the one-shot {@link inventory}
 * routine, which fetches the inventory, applies configured gems and consumable
 * items. Unlike the other farm modules this is not self-rescheduling; it is
 * invoked on demand (e.g. from the farm gem handler).
 *
 * @param {Client} client - The Discord client instance; carries config, logger and global state.
 * @returns {Promise<void>} Resolves once the inventory routine has finished.
 */
module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);
    await inventory(client, channel);
};

/**
 * Send the inventory command and wait for OwO's inventory reply.
 *
 * Marks the global inventory flag (which pauses competing actions), sends
 * `owo inv`, and waits for OwO's "Inventory =" embed/message newer than the
 * command. Returns null on timeout or if the bot becomes paused/captcha'd while
 * waiting, so the caller can abort gracefully.
 *
 * @param {Client} client - The Discord client instance (sets `global.inventory`).
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<string|null>} Raw inventory message content, or null on timeout/pause.
 */
async function fetchInventoryData(client, channel) {
    channel.sendTyping();
    client.global.inventory = true;
    client.logger.info(
        "Farm",
        "Inventory",
        "Paused: true! Retrieving inventory...",
    );

    const msg = await channel.send({
        content: `owo ${commandrandomizer(["inv", "inventory"])}`,
    });

    const reply = await client.globalutil.waitForMessage(
        client,
        channel,
        (m) =>
            m.content.includes("Inventory =") &&
            m.author.id === OWO_ID &&
            m.channel.id === channel.id &&
            m.id.localeCompare(msg.id) > 0,
    );

    if (reply == null) {
        client.logger.alert("Farm", "inventory", "Couldn't retrieve inventory");
        return null;
    }

    if (client.global.captchadetected || client.global.paused) return null;
    return reply.content;
}

/**
 * Extract inline item codes from the inventory response text.
 *
 * Scans the raw inventory message for backtick-quoted tokens (OwO uses these
 * for item codes, e.g. `` `057` ``) and returns them in order of appearance.
 *
 * @param {string} invContent - Raw inventory message content.
 * @returns {string[]} Array of item codes found between backticks.
 */
function parseItemCodes(invContent) {
    const values = [];
    const regex = /`([^`]+)`/g;
    let match;
    while ((match = regex.exec(invContent)) !== null) {
        values.push(match[1]);
    }
    return values;
}

/**
 * Mark gem item codes for use based on config and current rarity level.
 *
 * For every gem the farm loop still needs, finds the weakest owned code
 * (`GEM_ITEMS`) that the user can use at their current `rareLevel`, and appends
 * it to `client.global.gems.use`. No-op when gem usage is disabled or no gems
 * are needed.
 *
 * @param {Client} client - The Discord client instance; reads `global.gems.need`, `global.rareLevel`, and writes `global.gems.use`.
 * @param {string[]} values - Extracted inventory item codes.
 * @returns {void} Mutates `client.global.gems.use`; does not return a value.
 */
function selectGemCodes(client, values) {
    if (
        client.global.gems.need.length === 0 ||
        !client.config.settings.inventory.use.gems
    )
        return;

    client.global.gems.need.forEach((gem) => {
        const codes = GEM_ITEMS[gem];
        if (!codes) return;
        for (let i = 0; i < codes.length; i++) {
            if (values.includes(codes[i]) && client.global.rareLevel >= 7 - i) {
                client.global.gems.use += `${codes[i]} `;
                break;
            }
        }
    });
}

/**
 * Use inventory items that are enabled in config.
 *
 * Iterates the extracted codes; for each code present in `ITEM_ACTIONS` whose
 * `setting` is enabled in config, sends the appropriate use command (quantity
 * "all") and resets the hunt-since-inventory counter. A short delay separates
 * each use to respect rate limits.
 *
 * @param {Client} client - The Discord client instance; reads `config.settings.inventory.use`.
 * @param {TextChannel} channel - The commands channel.
 * @param {string[]} values - Extracted inventory item codes.
 * @returns {Promise<void>} Resolves after all enabled items have been used.
 */
async function useItemsFromInventory(client, channel, values) {
    for (const code of values) {
        const action = ITEM_ACTIONS[code];
        if (!action) continue;
        if (client.config.settings.inventory.use[action.setting]) {
            await use(client, channel, action.cmd(), "all", "inventory");
            client.global.gems.huntssinceinv = 0;
        }
        await client.delay(2500);
    }
}

/**
 * Apply the selected gem codes with a single `use` command.
 *
 * Sends one `use <gem codes>` command for everything queued by
 * {@link selectGemCodes}, then clears the gem need/use state and the
 * "missing handled" flag so the next shortage is treated as fresh.
 *
 * @param {Client} client - The Discord client instance; reads/writes `global.gems`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves after the gem use command has been sent.
 */
async function applyGems(client, channel) {
    if (client.global.gems.use.length === 0) return;

    await use(
        client,
        channel,
        `use ${client.global.gems.use}`,
        "",
        "inventory",
    );
    client.global.gems.need = [];
    client.global.gems.use = "";
    client.global.gems.huntssinceinv = 0;
    client.global.gems.missingHandled = false;
    await client.delay(3000);
}

/**
 * Core inventory routine: fetch, parse, use items, apply gems.
 *
 * Guards against concurrent/blocked runs, fetches the inventory, selects gem
 * codes, uses enabled consumables, applies gems, then clears the global
 * inventory flag. Always clears the flag on the failure path so the bot does
 * not get stuck "paused".
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves once the routine has completed (success or abort).
 */
async function inventory(client, channel) {
    if (
        client.global.captchadetected ||
        client.global.paused ||
        client.global.inventory
    )
        return;

    const invContent = await fetchInventoryData(client, channel);
    if (invContent == null) {
        client.global.inventory = false;
        return;
    }

    const codes = parseItemCodes(invContent);
    selectGemCodes(client, codes);

    await client.delay(4000);
    await useItemsFromInventory(client, channel, codes);
    await applyGems(client, channel);

    client.global.inventory = false;
    client.logger.info(
        "Farm",
        "Inventory",
        `Paused: ${client.global.inventory}`,
    );
}

/**
 * Send a generic use/item command with rate-limit and pause awareness.
 *
 * Marks the global `use` flag, sends the command, logs it, then releases the
 * flag after a cooldown. Aborts early when a captcha is detected, or when the
 * bot is paused (unless the caller is the inventory routine itself, which is
 * allowed to proceed so gems can be applied while the inventory flag is held).
 *
 * @param {Client} client - The Discord client instance (sets `global.use`).
 * @param {TextChannel} channel - The commands channel.
 * @param {string} item - The item/command string to send (after the prefix).
 * @param {string} count - Quantity such as `"all"`, or `""` for the default.
 * @param {string} where - Caller context; `"inventory"` is exempt from the pause guard.
 * @returns {Promise<void>} Resolves after the command is sent and the cooldown elapses.
 */
async function use(client, channel, item, count, where) {
    if (
        client.global.captchadetected ||
        (client.global.paused && where !== "inventory")
    )
        return;
    client.global.use = true;
    await channel.send({ content: `${client.prefix()} ${item} ${count}` });
    client.logger.info("Farm", "Use", item);
    await client.delay(5000);
    client.global.use = false;
}
