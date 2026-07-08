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

    const pause = () => {
        if (client.global.paused || client.global.captchadetected) return;
        client.global.paused = true;
        client.logger.warn(
            "Bot",
            "Safety",
            "Safety paused to reduce bot rate.",
        );
        setTimeout(resume, pauseDuration);
    };

    const resume = () => {
        if (client.global.captchadetected) {
            setTimeout(resume, 30000);
            return;
        }
        client.global.paused = false;
        client.logger.warn("Bot", "Safety", "Resuming after a safety pause.");
        setTimeout(pause, safetyInterval);
    };

    setTimeout(pause, safetyInterval);
};
