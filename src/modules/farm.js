const { commandrandomizer, getrand } = require("../utils/globalutil.js");

const OWO_ID = "408785106942164992";
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const REQUIRED_GEMS = ["gem1", "gem3", "gem4"];

module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);

    if (client.basic.commands.hunt) {
        await farmAction(client, channel, {
            type: "hunt",
            cmd: () => commandrandomizer(["h", "hunt"]),
            onResult: huntResult,
        });
        await client.delay(2000);
        if (client.basic.commands.battle)
            await farmAction(client, channel, {
                type: "battle",
                cmd: () => commandrandomizer(["b", "battle"]),
            });
    } else if (client.basic.commands.battle)
        await farmAction(client, channel, {
            type: "battle",
            cmd: () => commandrandomizer(["b", "battle"]),
        });
    else if (client.config.settings.autophrases) {
        setInterval(() => {
            elaina2(client, channel);
        }, 16000);
    }
};

async function farmAction(client, channel, { type, cmd, onResult }) {
    await client.globalutil.waitWhileBusy(client);
    while (client.global.use || client.global[type]) {
        await client.delay(16000);
    }

    const interval = getrand(
        client.config.interval[type].min,
        client.config.interval[type].max,
    );

    try {
        channel.sendTyping();
        if (client.global[type === "hunt" ? "battle" : "hunt"])
            await client.delay(1500);
        client.global[type] = true;
        const msg = await channel.send({
            content: `${client.prefix()} ${cmd()}`,
        });
        client.global.total[type]++;
        client.logger.info(
            "Farm",
            capitalize(type),
            `Total ${type}: ${client.global.total[type]}`,
        );

        if (onResult) await onResult(client, channel, msg);
        await client.delay(1000);
    } catch (err) {
        client.logger.alert(
            "Farm",
            capitalize(type),
            `Error while ${type}ing: ${err}`,
        );
        client.logger.debug(err);
    } finally {
        client.global[type] = false;
        setTimeout(() => {
            farmAction(client, channel, { type, cmd, onResult });
        }, interval);
    }
}

async function huntResult(client, channel, huntmsg) {
    if (!client.config.settings.inventory.use.gems) return;

    const message = await client.globalutil.waitForMessage(
        client,
        channel,
        (msg) =>
            (msg.content.includes("and caught a") ||
                msg.content.includes("You found:")) &&
            msg.author.id === OWO_ID &&
            msg.channel.id === channel.id &&
            msg.id.localeCompare(huntmsg.id) > 0,
    );

    if (message == null) {
        client.logger.alert(
            "Farm",
            "Hunt",
            "Couldn't retrieve hunting result!",
        );
        return;
    }

    const huntmsgcontent = message.content;
    client.global.gems.need = [];
    client.global.gems.use = "";
    client.global.gems.huntssinceinv++;

    if (!huntmsgcontent) return;

    for (const gem of REQUIRED_GEMS) {
        if (!huntmsgcontent.includes(gem)) client.global.gems.need.push(gem);
    }

    if (client.global.gems.isevent) {
        if (!huntmsgcontent.includes("star")) {
            if (!client.global.temp.usedevent) {
                client.global.gems.need.push("star");
                client.global.temp.usedevent = true;
            } else {
                client.global.gems.isevent = false;
                client.logger.info("Farm", "Hunt", "Event not found");
            }
        } else client.global.temp.usedevent = false;
    }

    if (client.global.gems.need.length > 0) {
        handleMissingGems(client, channel, message.content);
    }
}

function handleMissingGems(client, channel, huntContent) {
    client.logger.warn(
        "Farm",
        "Hunt",
        `Missing gems: ${client.global.gems.need}`,
    );
    if (!client.basic.commands.inventory) return;

    if (!client.global.gems.missingHandled) {
        client.global.gems.missingHandled = true;
        client.global.gems.huntssinceinv = 0;
        channel.send({
            content: `${client.prefix()} ${commandrandomizer(["lb", "lootbox"])} all`,
        });
        setTimeout(() => {
            require("./inventory.js")(client);
        }, 5000);
        return;
    }

    if (huntContent?.includes("lootbox")) {
        client.global.gems.huntssinceinv = 0;
        setTimeout(() => {
            require("./inventory.js")(client);
        }, 2000);
        return;
    }

    if (client.global.gems.huntssinceinv >= getrand(15, 30)) {
        client.global.gems.huntssinceinv = 0;
        setTimeout(() => {
            require("./inventory.js")(client);
        }, 2000);
    }
}

async function elaina2(client, channel) {
    if (client.global.captchadetected || client.global.paused) return;
    try {
        const data = await client.fs.readFile(
            `${__dirname}/../assets/phrases.json`,
            "utf8",
        );
        const phrasesObject = JSON.parse(data);
        const phrases = phrasesObject.phrases;
        if (!phrases?.length) {
            return client.logger.alert(
                "Farm",
                "Phrases",
                "Phrases array is undefined or empty.",
            );
        }
        const result = Math.floor(Math.random() * phrases.length);
        channel.sendTyping();
        await channel.send({ content: phrases[result] });
        client.logger.info("Farm", "Phrases", "Successfuly sent.");
    } catch (err) {
        client.logger.alert(
            "Farm",
            "Phrases",
            `Error reading phrases.json: ${err}`,
        );
    }
}

module.exports.capitalize = capitalize;
module.exports.huntResult = huntResult;
module.exports.handleMissingGems = handleMissingGems;
