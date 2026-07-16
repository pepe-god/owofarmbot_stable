/**
 * Automatic background phrases — sends a random phrase every 8-25s.
 *
 * Phrase list is cached from core/phrases.json on first start. Avoids
 * repeating the previous phrase. Skips while paused/captcha'd.
 */

import type { Channel, Ctx } from "../core/types.js";
import { handleModuleError } from "../services/errors.js";
import { selfLoop } from "./loop.js";

let phrasesCache: string[] | null = null;

/**
 * Pick a random phrase, avoiding repetition of the previous one.
 */
function pickPhrase(lastIndex: number): { text: string; idx: number } {
    const cache = phrasesCache!;
    let idx = Math.floor(Math.random() * cache.length);
    if (cache.length > 1 && idx === lastIndex) {
        idx = (idx + 1) % cache.length;
    }
    return { text: cache[idx], idx };
}

/**
 * Background loop that sends a random phrase every 8–25s (no repeats).
 * Skips while paused/captcha'd or if the channel is lost.
 * Phrase list is loaded from core/phrases.json on first start.
 */
function startAutophrases(ctx: Ctx, channel?: Channel): void {
    if (!channel) {
        ctx.logger.debug("Commands channel not found, autophrases disabled.");
        return;
    }

    // Load phrases.json once (cached) before starting the loop.
    (async () => {
        if (!phrasesCache) {
            try {
                const data = await ctx.fs!.promises.readFile(
                    `${__dirname}/../core/phrases.json`,
                    "utf8",
                );
                const phrasesObject = JSON.parse(data);
                const items = phrasesObject.phrases || [];
                if (!items.length) {
                    ctx.logger.alert(
                        "Farm",
                        "Phrases",
                        "Phrases array is empty.",
                    );
                    return;
                }
                phrasesCache = items;
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
                    ctx.global.temp.lastPhraseIndex!,
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

export { startAutophrases };
