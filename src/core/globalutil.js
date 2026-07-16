/**
 * General-purpose runtime utilities: removeInvisibleChars, waitForMessage, commandrandomizer, getrand, waitWhileBusy.
 */

/**
 * Capitalize the first character of a string.
 * @param {string} s - Input string.
 * @returns {string} The string with its first letter uppercased.
 */
exports.capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Escape special regex characters so a string can be used safely inside a RegExp constructor.
 * @param {string} str - Input string.
 * @returns {string} Regex-safe escaped string.
 */
exports.escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.removeInvisibleChars = (str) => {
    const invisibleRegex = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;
    return str.replace(invisibleRegex, "");
};

/**
 * Wait for a Discord message matching `filter`; uses an immediate listener, falling back to a MessageCollector after `timeout` ms.
 * @param {Object} ctx - The bot context (provides the Discord `client` for event listeners).
 * @param {TextChannel} channel - The channel to collect from.
 * @param {Function} filter - Predicate that returns true for the wanted message.
 * @param {number} [timeout=6100] - Milliseconds before collector fallback.
 * @returns {Promise<Message|null>} The matched message or null.
 */
exports.waitForMessage = (ctx, channel, filter, timeout = 6100) => {
    const discord = ctx.client;
    return new Promise((resolve) => {
        const listener = (msg) => {
            if (filter(msg)) {
                clearTimeout(timer);
                discord.off("messageCreate", listener);
                resolve(msg);
            }
        };

        const timer = setTimeout(() => {
            discord.off("messageCreate", listener);
            const collector = channel.createMessageCollector({
                filter,
                time: timeout,
            });
            collector.on("collect", (msg) => {
                collector.stop();
                resolve(msg);
            });
            collector.on("end", () => resolve(null));
        }, timeout);

        discord.on("messageCreate", listener);
    });
};

/**
 * Return a random element from the provided array.
 * @template T
 * @param {T[]} arr - Array to sample from.
 * @returns {T} Randomly selected element.
 */
exports.commandrandomizer = (arr) =>
    arr[Math.floor(Math.random() * arr.length)];

/**
 * Generate a random floating-point number between min and max.
 * @param {number} min - Lower bound (inclusive).
 * @param {number} max - Upper bound (exclusive).
 * @returns {number} Random float in [min, max).
 */
exports.getrand = (min, max) => Math.random() * (max - min) + min;

/**
 * Pause execution while any global busy flag (paused/captchadetected/inventory) is active.
 * @param {Object} ctx - The bot context (provides `state` and `delay`).
 * @returns {Promise<void>} Resolves when all flags are clear.
 */
exports.waitWhileBusy = async (ctx) => {
    await ctx.state.waitUntilIdle();
};
