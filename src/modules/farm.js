const { commandrandomizer, getrand } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");
const {
    handleModuleError,
    RateLimitError,
    nextRateLimitDelay,
    resetRateLimitBackoff,
} = require("../services/errors.js");

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
 * @param {Client} ctx - The Discord ctx instance; carries config, logger and global state.
 * @returns {void} Kicks off the looping handlers; does not return a meaningful value.
 */
module.exports = async (ctx) => {
    const channel = ctx.client.channels.cache.get(ctx.basic.commandschannelid);

    if (ctx.config.settings.autophrases) {
        startAutophrases(ctx, channel);
    }

    if (ctx.basic.commands.hunt) {
        await farmAction(ctx, channel, {
            type: "hunt",
            cmd: () => commandrandomizer(["h", "hunt"]),
            onResult: huntResult,
        });
        await ctx.delay(2000);
        if (ctx.basic.commands.battle)
            await farmAction(ctx, channel, {
                type: "battle",
                cmd: () => commandrandomizer(["b", "battle"]),
            });
    } else if (ctx.basic.commands.battle)
        await farmAction(ctx, channel, {
            type: "battle",
            cmd: () => commandrandomizer(["b", "battle"]),
        });
};

/**
 * Generic self-looping action for hunt or battle.
 *
 * Waits for the bot to be idle, then blocks other competing actions via the
 * `ctx.global[type]` flag and sends the randomized command. The global
 * counter for the action is incremented and logged. If an `onResult` handler is
 * supplied (hunt only) it is awaited to process the response (e.g. gem checks).
 * The `ctx.global[type]` flag is always cleared in the `finally` block and
 * the next iteration is scheduled after a randomized interval from config.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {Object} opts - Action configuration.
 * @param {"hunt"|"battle"} opts.type - Which action this loop performs.
 * @param {() => string} opts.cmd - Returns the randomized base command token (without prefix).
 * @param {(ctx: Client, channel: TextChannel, msg: Object) => Promise<void>} [opts.onResult] - Optional handler run against the sent message's reply.
 * @returns {void} Self-reschedules via setTimeout; does not return a value.
 */
async function farmAction(ctx, channel, { type, cmd, onResult }) {
    await ctx.globalutil.waitWhileBusy(ctx);
    while (ctx.global.use || ctx.global[type]) {
        await ctx.delay(16000);
    }

    const interval = getrand(
        ctx.config.interval[type].min,
        ctx.config.interval[type].max,
    );

    let rateLimited = false;
    try {
        channel.sendTyping();
        if (ctx.global[type === "hunt" ? "battle" : "hunt"])
            await ctx.delay(1500);
        ctx.global[type] = true;
        const msg = await channel.send({
            content: `${ctx.prefix()} ${cmd()}`,
        });
        ctx.global.total[type]++;
        ctx.logger.info(
            "Farm",
            capitalize(type),
            `Total ${type}: ${ctx.global.total[type]}`,
        );

        if (onResult) await onResult(ctx, channel, msg);
        await ctx.delay(1000);
    } catch (err) {
        const wrapped = handleModuleError(ctx, err, {
            type: "Farm",
            module: capitalize(type),
            fallback: `Error while ${type}ing`,
        });
        if (wrapped instanceof RateLimitError) {
            rateLimited = true;
            const key = `farm:${type}`;
            const delay = nextRateLimitDelay(ctx, key);
            ctx.logger.warn(
                "Farm",
                capitalize(type),
                `Rate limited, backing off ${delay}ms before retry.`,
            );
            ctx.loops.schedule(
                () => farmAction(ctx, channel, { type, cmd, onResult }),
                delay,
                `farm:${type}:ratelimit`,
            );
        }
    } finally {
        ctx.global[type] = false;
        if (!rateLimited) {
            resetRateLimitBackoff(ctx, `farm:${type}`);
            ctx.loops.schedule(
                () => {
                    farmAction(ctx, channel, { type, cmd, onResult });
                },
                interval,
                `farm:${type}`,
            );
        }
    }
}

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
    if (!ctx.basic.commands.inventory) return;

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

let phrasesCache = null;

/**
 * Pick a random phrase, avoiding repetition of the previous one.
 * @param {number} lastIndex - The previously used phrase index.
 * @returns {{ text: string, idx: number }} Selected phrase and its index.
 */
function pickPhrase(lastIndex) {
    let idx = Math.floor(Math.random() * phrasesCache.length);
    if (phrasesCache.length > 1 && idx === lastIndex) {
        idx = (idx + 1) % phrasesCache.length;
    }
    return { text: phrasesCache[idx], idx };
}

/**
 * Start the autophrases background loop.
 *
 * Lazily loads phrases from `src/core/phrases.json` (cached for the process
 * lifetime), then repeatedly sends a random phrase at a randomized 8–25s
 * interval. Consecutive phrases avoid repeating the previous one, and the loop
 * skips a round (and reschedules) while paused/captcha'd or if the channel is
 * lost. Exits silently when the channel is missing or the phrase list is empty.
 *
 * @param {Client} ctx - The Discord ctx instance; provides `fs`, logger and global state.
 * @param {TextChannel} [channel] - The text channel where phrases are sent; undefined disables the loop.
 * @returns {void} Runs an IIFE that self-schedules; does not return a value.
 */
function startAutophrases(ctx, channel) {
    if (!channel) {
        ctx.logger.debug(
            "Farm",
            "Phrases",
            "Commands channel not found, autophrases disabled.",
        );
        return;
    }

    const MIN_DELAY = 8000;
    const MAX_DELAY = 25000;

    async function scheduleNext() {
        const delay = getrand(MIN_DELAY, MAX_DELAY);
        ctx.logger.debug("Farm", "Phrases", `Next phrase in ${delay}ms`);
        ctx.loops.schedule(sendPhrase, delay, "farm:phrases");
    }

    async function sendPhrase() {
        if (ctx.global.captchadetected || ctx.global.paused) {
            scheduleNext();
            return;
        }
        if (!channel) {
            ctx.logger.debug(
                "Farm",
                "Phrases",
                "Channel lost, stopping autophrases.",
            );
            return;
        }

        try {
            await ctx.globalutil.waitWhileBusy(ctx);
            const { text, idx } = pickPhrase(ctx.global.temp.lastPhraseIndex);
            await channel.sendTyping();
            await ctx.delay(800);
            await channel.send({ content: text });
            ctx.global.temp.lastPhraseIndex = idx;
            ctx.logger.info("Farm", "Phrases", "Successfully sent.");
        } catch (err) {
            const wrapped = handleModuleError(ctx, err, {
                type: "Farm",
                module: "Phrases",
                fallback: "Error sending phrase",
            });
            if (wrapped instanceof RateLimitError) {
                const delay = nextRateLimitDelay(ctx, "farm:phrases");
                ctx.logger.warn(
                    "Farm",
                    "Phrases",
                    `Rate limited, backing off ${delay}ms.`,
                );
                ctx.loops.schedule(sendPhrase, delay, "farm:phrases:ratelimit");
                return;
            }
        }
        scheduleNext();
    }

    (async () => {
        if (!phrasesCache) {
            try {
                const data = await ctx.fs.promises.readFile(
                    `${__dirname}/../core/phrases.json`,
                    "utf8",
                );
                const phrasesObject = JSON.parse(data);
                phrasesCache = phrasesObject.phrases || [];
                if (!phrasesCache.length) {
                    ctx.logger.alert(
                        "Farm",
                        "Phrases",
                        "Phrases array is empty.",
                    );
                    return;
                }
            } catch (err) {
                handleModuleError(ctx, err, {
                    type: "Farm",
                    module: "Phrases",
                    fallback: "Failed to load phrases.json",
                });
                return;
            }
        }
        ctx.logger.info("Farm", "Phrases", "Phrases interval started.");
        scheduleNext();
    })();
}

module.exports.capitalize = capitalize;
module.exports.huntResult = huntResult;
module.exports.handleMissingGems = handleMissingGems;
