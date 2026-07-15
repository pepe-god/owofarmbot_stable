const { getrand } = require("../core/globalutil.js");
const {
    handleModuleError,
    RateLimitError,
    nextRateLimitDelay,
} = require("../services/errors.js");

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

module.exports = { startAutophrases };
