const { commandrandomizer, getrand } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const REQUIRED_GEMS = ["gem1", "gem3", "gem4"];

/**
 * Farm module entry point — boots the hunt/battle loop and optional autophrases.
 *
 * Resolves the command channel, optionally starts the autophrases background
 * loop, then launches the self-looping {@link farmAction} handler. When hunt is
 * enabled, a battle loop is started 2s later (if battle is also enabled) so the
 * two actions alternate rather than collide on the same cooldown.
 *
 * @param {Client} client - The Discord client instance; carries config, logger and global state.
 * @returns {void} Kicks off the looping handlers; does not return a meaningful value.
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
 * Waits for the bot to be idle, then blocks other competing actions via the
 * `client.global[type]` flag and sends the randomized command. The global
 * counter for the action is incremented and logged. If an `onResult` handler is
 * supplied (hunt only) it is awaited to process the response (e.g. gem checks).
 * The `client.global[type]` flag is always cleared in the `finally` block and
 * the next iteration is scheduled after a randomized interval from config.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {Object} opts - Action configuration.
 * @param {"hunt"|"battle"} opts.type - Which action this loop performs.
 * @param {() => string} opts.cmd - Returns the randomized base command token (without prefix).
 * @param {(client: Client, channel: TextChannel, msg: Object) => Promise<void>} [opts.onResult] - Optional handler run against the sent message's reply.
 * @returns {void} Self-reschedules via setTimeout; does not return a value.
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
        client.loops.schedule(
            () => {
                farmAction(client, channel, { type, cmd, onResult });
            },
            interval,
            `farm:${type}`,
        );
    }
}

/**
 * Analyze a hunt result for missing gems or the active event star, then queue
 * inventory usage if any required item is absent.
 *
 * Only runs when gem usage is enabled in config. Waits for OwO's hunt-result
 * reply (a catch or "You found:" message newer than the sent command), then
 * recomputes `client.global.gems.need`: any of the `REQUIRED_GEMS` missing from
 * the message, plus the event `star` the first time it is expected (and clears
 * the event flag if it never appears). When items are missing, {@link
 * handleMissingGems} is invoked to decide how to resolve them.
 *
 * @param {Client} client - The Discord client instance; holds gem and event state.
 * @param {TextChannel} channel - The text channel where the hunt was sent.
 * @param {Object} huntmsg - The message object of the sent hunt command (used as a reply floor).
 * @returns {Promise<void>} Resolves once gem needs are computed (or aborts on timeout/empty result).
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
 * @param {Client} client - The Discord client instance; holds gem/inventory state.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {string} huntContent - Raw content of the hunt result message.
 * @returns {void} May schedule inventory runs via setTimeout; does not return a value.
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
        client.loops.schedule(
            () => {
                require("./inventory.js")(client);
            },
            5000,
            "farm:inventory",
        );
        return;
    }

    if (huntContent?.includes("lootbox")) {
        client.global.gems.huntssinceinv = 0;
        client.loops.schedule(
            () => {
                require("./inventory.js")(client);
            },
            2000,
            "farm:inventory",
        );
        return;
    }

    if (client.global.gems.huntssinceinv >= getrand(15, 30)) {
        client.global.gems.huntssinceinv = 0;
        client.loops.schedule(
            () => {
                require("./inventory.js")(client);
            },
            2000,
            "farm:inventory",
        );
    }
}

let phrasesCache = null;

/**
 * Start the autophrases background loop.
 *
 * Lazily loads phrases from `src/core/phrases.json` (cached for the process
 * lifetime), then repeatedly sends a random phrase at a randomized 8–25s
 * interval. Consecutive phrases avoid repeating the previous one, and the loop
 * skips a round (and reschedules) while paused/captcha'd or if the channel is
 * lost. Exits silently when the channel is missing or the phrase list is empty.
 *
 * @param {Client} client - The Discord client instance; provides `fs`, logger and global state.
 * @param {TextChannel} [channel] - The text channel where phrases are sent; undefined disables the loop.
 * @returns {void} Runs an IIFE that self-schedules; does not return a value.
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
            client.loops.schedule(sendPhrase, delay, "farm:phrases");
        }

        client.logger.info("Farm", "Phrases", "Phrases interval started.");
        scheduleNext();
    })();
}

module.exports.capitalize = capitalize;
module.exports.huntResult = huntResult;
module.exports.handleMissingGems = handleMissingGems;
