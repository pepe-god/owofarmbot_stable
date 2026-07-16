/**
 * Safety module entry point — enforces a periodic pause cycle.
 *
 * Implements an automatic cooldown to lower the risk of rate limits or bans.
 * After running for `pauseafter` minutes the bot pauses itself for `pausefor`
 * minutes, then automatically resumes and repeats. The cycle is started by
 * scheduling the first pause after the runtime duration.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `settings.safety` and mutates `global.paused`.
 * @returns {void} Seeds the self-rescheduling pause/resume timers; never returns a value.
 */
function startSafety(ctx) {
    const safetyInterval = ctx.config.settings.safety.pauseafter * 60 * 1000;
    const pauseDuration = ctx.config.settings.safety.pausefor * 60 * 1000;

    ctx.loops.schedule(
        () => pause(ctx, pauseDuration, safetyInterval),
        safetyInterval,
        "safety:pause",
    );
}

/**
 * Pause the bot for a cooldown window.
 *
 * No-op if the bot is already paused or a captcha is being handled. Otherwise
 * sets `global.paused`, logs the action, and schedules {@link resume} after
 * `pauseDuration` ms.
 *
 * @param {Client} ctx - The Discord ctx instance; mutates `global.paused`.
 * @param {number} pauseDuration - Cooldown length in ms before resuming.
 * @param {number} safetyInterval - Cooldown length in ms before the next pause.
 * @returns {void} Schedules {@link resume}; does not return a value.
 */
function pause(ctx, pauseDuration, safetyInterval) {
    if (ctx.global.paused || ctx.global.captchadetected) return;
    ctx.state.pause();
    ctx.logger.warn("Bot", "Safety", "Safety paused to reduce bot rate.");
    ctx.loops.schedule(
        () => resume(ctx, pauseDuration, safetyInterval),
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
 * @param {Client} ctx - The Discord ctx instance; mutates `global.paused`.
 * @param {number} pauseDuration - Cooldown length in ms (passed through to {@link pause}).
 * @param {number} safetyInterval - Cooldown length in ms before the next pause.
 * @returns {void} Schedules the next pause (or a deferred resume); does not return a value.
 */
function resume(ctx, pauseDuration, safetyInterval) {
    if (ctx.global.captchadetected) {
        ctx.loops.schedule(
            () => resume(ctx, pauseDuration, safetyInterval),
            30000,
            "safety:resume",
        );
        return;
    }
    ctx.state.resume();
    ctx.logger.warn("Bot", "Safety", "Resuming after a safety pause.");
    ctx.loops.schedule(
        () => pause(ctx, pauseDuration, safetyInterval),
        safetyInterval,
        "safety:pause",
    );
}

module.exports = { startSafety, pause, resume };
module.exports.default = startSafety;