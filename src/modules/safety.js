/**
 * Enforces a periodic pause cycle: after `pauseafter` min runtime, pause for `pausefor` min, then resume and repeat.
 * @param {Client} ctx - The Discord ctx instance; reads `settings.safety` and mutates `global.paused`.
 * @returns {void} Seeds the self-rescheduling pause/resume timers.
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
 * Pause the bot (no-op if already paused or captcha'd), set `global.paused`, and schedule {@link resume} after `pauseDuration` ms.
 * @param {Client} ctx - The Discord ctx instance; mutates `global.paused`.
 * @param {number} pauseDuration - Cooldown length in ms before resuming.
 * @param {number} safetyInterval - Cooldown length in ms before the next pause.
 * @returns {void} Schedules {@link resume}.
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
 * Resume after a safety pause; if a captcha is still active, defer by 30s, otherwise clear `global.paused` and schedule the next {@link pause}.
 * @param {Client} ctx - The Discord ctx instance; mutates `global.paused`.
 * @param {number} pauseDuration - Cooldown length in ms (passed through to {@link pause}).
 * @param {number} safetyInterval - Cooldown length in ms before the next pause.
 * @returns {void} Schedules the next pause (or a deferred resume).
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
