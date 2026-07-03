/**
 * Safety module entry point.
 *
 * Implements an automatic cooldown cycle: after a configured runtime
 * duration, the bot pauses itself for a shorter duration to reduce
 * the risk of rate limits or bans from OwO.
 *
 * @param {Client} client - The Discord client instance.
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
