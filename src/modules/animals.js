const { getrand, capitalize } = require("../core/globalutil.js");
const { withRateLimit } = require("../services/errors.js");

/**
 * Self-looping sell/sacrifice for configured animal types; reschedules on pause/captcha or after the randomized `animals` interval.
 * @param {Client} ctx - The Discord ctx instance (carries config, logger and global state).
 * @param {TextChannel} channel - The text channel where commands are sent.
 * @param {string} choose - The action to perform, either `"sell"` or `"sacrifice"`.
 * @param {string} types - Space-separated animal type suffixes (e.g. `"cow duck"`).
 * @returns {void} Self-reschedules via setTimeout.
 */
async function sell(ctx, channel, choose, types) {
    if (ctx.global.captchadetected || ctx.global.paused) {
        ctx.loops.schedule(
            () => {
                sell(ctx, channel, choose, types);
            },
            16000,
            "animals",
        );
        return;
    }
    await withRateLimit(ctx, {
        type: "Farm",
        module: capitalize(choose),
        key: `animals:${choose}`,
        run: async () => {
            await channel.send({
                content: `${ctx.prefix()} ${choose} ${types}`,
            });
        },
        onSuccess: () => {
            ctx.loops.schedule(
                () => {
                    sell(ctx, channel, choose, types);
                },
                getrand(
                    ctx.config.interval.animals.min,
                    ctx.config.interval.animals.max,
                ),
                "animals",
            );
        },
    });
}

module.exports = { startAnimals: sell };
