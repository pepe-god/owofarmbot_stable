const { commandrandomizer } = require("../utils/globalutil.js");

const OWO_ID = "408785106942164992";

const GEM_ITEMS = {
    gem1: ["057", "056", "055", "054", "053", "052", "051"],
    gem3: ["071", "070", "069", "068", "067", "066", "065"],
    gem4: ["078", "077", "076", "075", "074", "073", "072"],
    star: ["085", "084", "083", "082", "081", "080", "079"],
};

const ITEM_ACTIONS = {
    "050": {
        setting: "lootbox",
        cmd: () => commandrandomizer(["lb", "lootbox"]),
    },
    "049": { setting: "fabledlootbox", cmd: () => "lootbox fabled" },
    100: { setting: "crate", cmd: () => commandrandomizer(["wc", "crate"]) },
};

module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);
    await inventory(client, channel);
};

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

function parseItemCodes(invContent) {
    const values = [];
    const regex = /`([^`]+)`/g;
    let match;
    while ((match = regex.exec(invContent)) !== null) {
        values.push(match[1]);
    }
    return values;
}

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
