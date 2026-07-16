const { selfLoop } = require("./loop.js");
const { handleModuleError } = require("../services/errors.js");

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
 * Background loop that sends a random phrase every 8–25s (no repeats); skips
 * while paused/captcha'd or if the channel is lost. Phrase list is loaded from
 * core/phrases.json on first start.
 * @param {Object} ctx - The bot context; provides `fs`, logger and global state.
 * @param {TextChannel} [channel] - The text channel where phrases are sent; undefined disables the loop.
 * @returns {void}
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

    // Load phrases.json once (cached) before starting the loop.
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
        selfLoop(ctx, channel, {
            type: "phrases",
            key: "farm:phrases",
            min: 8000,
            max: 25000,
            logModule: "Phrases",
            logType: "Farm",
            buildContent: () => {
                const { text, idx } = pickPhrase(
                    ctx.global.temp.lastPhraseIndex,
                );
                ctx.global.temp.lastPhraseIndex = idx;
                return text;
            },
            onRun: async () => {
                await ctx.delay(800);
            },
        });
    })();
}

module.exports = { startAutophrases };
