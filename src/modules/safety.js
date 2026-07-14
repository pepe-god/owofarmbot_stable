/**
 * Safety module entry point — enforces a periodic pause cycle.
 *
 * Implements an automatic cooldown to lower the risk of rate limits or bans.
 * After running for `pauseafter` minutes the bot pauses itself for `pausefor`
 * minutes, then automatically resumes and repeats. The cycle is started by
 * scheduling the first pause after the runtime duration.
 *
 * @param {Client} client - The Discord client instance; reads `settings.safety` and mutates `global.paused`.
 * @returns {void} Seeds the self-rescheduling pause/resume timers; never returns a value.
 */
module.exports = async (client) => {
    const safetyInterval = client.config.settings.safety.pauseafter * 60 * 1000;
    const pauseDuration = client.config.settings.safety.pausefor * 60 * 1000;

    client.loops.schedule(
        () => pause(client, pauseDuration, safetyInterval),
        safetyInterval,
        "safety:pause",
    );
};

/**
 * Pause the bot for a cooldown window.
 *
 * No-op if the bot is already paused or a captcha is being handled. Otherwise
 * sets `global.paused`, logs the action, and schedules {@link resume} after
 * `pauseDuration` ms.
 *
 * @param {Client} client - The Discord client instance; mutates `global.paused`.
 * @param {number} pauseDuration - Cooldown length in ms before resuming.
 * @param {number} safetyInterval - Cooldown length in ms before the next pause.
 * @returns {void} Schedules {@link resume}; does not return a value.
 */
function pause(client, pauseDuration, safetyInterval) {
    if (client.global.paused || client.global.captchadetected) return;
    client.global.paused = true;
    client.logger.warn("Bot", "Safety", "Safety paused to reduce bot rate.");
    client.loops.schedule(
        () => resume(client, pauseDuration, safetyInterval),
        pauseDuration,
        "safety:resume",
    );
}

/**
 * Resume the bot after a safety pause.
 *
 * If a captcha is still being handled, the resume is deferred by 30s instead of
 * clearing the pause. Otherwise clears `global.paused`, logs, and schedules the
 * next {@link pause} after `safetyInterval` ms.
 *
 * @param {Client} client - The Discord client instance; mutates `global.paused`.
 * @param {number} pauseDuration - Cooldown length in ms (passed through to {@link pause}).
 * @param {number} safetyInterval - Cooldown length in ms before the next pause.
 * @returns {void} Schedules the next pause (or a deferred resume); does not return a value.
 */
function resume(client, pauseDuration, safetyInterval) {
    if (client.global.captchadetected) {
        client.loops.schedule(
            () => resume(client, pauseDuration, safetyInterval),
            30000,
            "safety:resume",
        );
        return;
    }
    client.global.paused = false;
    client.logger.warn("Bot", "Safety", "Resuming after a safety pause.");
    client.loops.schedule(
        () => pause(client, pauseDuration, safetyInterval),
        safetyInterval,
        "safety:pause",
    );
}

module.exports.pause = pause;
module.exports.resume = resume;
