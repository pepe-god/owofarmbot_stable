const { capitalize } = require("../core/globalutil.js");
const { selfLoop } = require("./loop.js");

/**
 * Self-looping sell/sacrifice for configured animal types.
 * @param {Object} ctx - The bot context (carries config, logger and global state).
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {string} choose - The action to perform, either "sell" or "sacrifice".
 * @param {string} types - Space-separated animal type suffixes (e.g. "cow duck").
 * @returns {void} Self-reschedules via ctx.loops.schedule.
 */
async function sell(ctx, channel, choose, types) {
    // If paused or solving a captcha, retry later instead of sending.
    if (ctx.global.captchadetected || ctx.global.paused) {
        ctx.loops.schedule(
            () => sell(ctx, channel, choose, types),
            16000,
            "animals",
        );
        return;
    }

    selfLoop(ctx, channel, {
        type: choose,
        key: `animals:${choose}`,
        intervalKey: "animals",
        logModule: capitalize(choose),
        buildContent: () => `${ctx.prefix()} ${choose} ${types}`,
    });
}

module.exports = { startAnimals: sell };
