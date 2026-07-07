const { commandrandomizer, getrand } = require("../core/globalutil.js");

const OWO_ID = "408785106942164992";
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const REQUIRED_GEMS = ["gem1", "gem3", "gem4"];

/**
 * Farm module entry point.
 *
 * Starts optional autophrases, then begins the hunt/battle loop.
 * If hunt is enabled, battle is executed after each hunt.
 *
 * @param {Client} client - The Discord client instance.
 */
module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.commandschannelid);

    if (client.config.settings.autophrases) {
        startAutophrases(client, channel);
    }

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
};

/**
 * Generic self-looping action for hunt or battle.
 *
 * Waits for the bot to be free, sends the command, increments the
 * action counter, optionally processes the result, then schedules
 * the next run after a randomized interval.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel.
 * @param {Object} opts - Action configuration.
 * @param {string} opts.type - "hunt" or "battle".
 * @param {Function} opts.cmd - Returns the randomized command string.
 * @param {Function} [opts.onResult] - Optional post-result handler.
 */
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

/**
 * Analyze the hunt result for missing gems or event stars,
 * then trigger inventory usage if needed.
 */
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

/**
 * Decide how to resolve missing gems:
 *  - First missing: open all lootboxes immediately.
 *  - Subsequent: wait until enough hunts have passed without inventory check.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel.
 * @param {string} huntContent - Raw hunt result message content.
 */
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

let phrasesCache = null;

/**
 * Start the autophrases background loop.
 * Loads phrases from `assets/phrases.json` and sends them at
 * randomized intervals between 8s and 25s.
 */
function startAutophrases(client, channel) {
    if (!channel) {
        client.logger.debug(
            "Farm",
            "Phrases",
            "Commands channel not found, autophrases disabled.",
        );
        return;
    }

    (async () => {
        if (!phrasesCache) {
            try {
                const data = await client.fs.promises.readFile(
                    `${__dirname}/../core/phrases.json`,
                    "utf8",
                );
                const phrasesObject = JSON.parse(data);
                phrasesCache = phrasesObject.phrases || [];
                if (!phrasesCache.length) {
                    client.logger.alert(
                        "Farm",
                        "Phrases",
                        "Phrases array is empty.",
                    );
                    return;
                }
            } catch (err) {
                client.logger.alert(
                    "Farm",
                    "Phrases",
                    `Failed to load phrases.json: ${err}`,
                );
                return;
            }
        }

        const MIN_DELAY = 8000;
        const MAX_DELAY = 25000;

        async function sendPhrase() {
            if (client.global.captchadetected || client.global.paused) {
                scheduleNext();
                return;
            }

            if (!channel) {
                client.logger.debug(
                    "Farm",
                    "Phrases",
                    "Channel lost, stopping autophrases.",
                );
                return;
            }

            try {
                await client.globalutil.waitWhileBusy(client);

                let idx = Math.floor(Math.random() * phrasesCache.length);
                if (
                    phrasesCache.length > 1 &&
                    idx === client.global.temp.lastPhraseIndex
                ) {
                    idx = (idx + 1) % phrasesCache.length;
                }
                const text = phrasesCache[idx];

                await channel.sendTyping();
                await client.delay(800);
                await channel.send({ content: text });
                client.global.temp.lastPhraseIndex = idx;
                client.logger.info("Farm", "Phrases", "Successfully sent.");
            } catch (err) {
                client.logger.alert(
                    "Farm",
                    "Phrases",
                    `Error sending phrase: ${err}`,
                );
            }

            scheduleNext();
        }

        function scheduleNext() {
            const delay = getrand(MIN_DELAY, MAX_DELAY);
            client.logger.debug("Farm", "Phrases", `Next phrase in ${delay}ms`);
            setTimeout(sendPhrase, delay);
        }

        client.logger.info("Farm", "Phrases", "Phrases interval started.");
        scheduleNext();
    })();
}

module.exports.capitalize = capitalize;
module.exports.huntResult = huntResult;
module.exports.handleMissingGems = handleMissingGems;
