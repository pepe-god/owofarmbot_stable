/**
 * Watchdog — recovers from stuck runtime flags (livelock / forgotten state).
 *
 * The bot tracks a handful of boolean flags on `ctx.global` that pause
 * competing actions (use, inventory) or the whole bot (captcha).
 * If a module throws after raising one of these flags and its normal cleanup
 * path is skipped, the flag can stay set forever and freeze farming. This
 * watchdog periodically force-clears any flag held longer than a threshold and
 * raises an alert so the operator can see the recovery.
 *
 * It is intentionally non-invasive: it does not require the flag setters to
 * record timestamps — the watchdog tracks how long it has continuously seen a
 * flag as `true` using its own rolling memory.
 */

// Flags that should never stay set longer than `STUCK_FLAG_MS`.
const STUCK_FLAGS = ["use", "inventory"];

// How long a transient flag may stay set before being force-cleared.
const DEFAULT_STUCK_FLAG_MS = 120000;
// A captcha flag held this long is treated as a forgotten/stuck captcha.
const DEFAULT_CAPTCHA_MAX_MS = 30 * 60 * 1000;
// Watchdog tick interval.
const DEFAULT_TICK_MS = 30000;

/**
 * Check one transient flag: if it has been held continuously longer than
 * `stuckMs`, force-clear it and raise an alert. Tracks the first-seen
 * timestamp in `flagSince` so only *continuous* holds count.
 *
 * @param {Client} ctx - The bot ctx; reads/writes the flag on `ctx.global`.
 * @param {string} flag - Flag name on `ctx.global`.
 * @param {Object<string, number>} flagSince - Per-flag first-seen timestamps.
 * @param {number} now - Current epoch millis.
 * @param {number} stuckMs - Hold threshold in millis.
 * @returns {void}
 */
function checkStuckFlag(ctx, flag, flagSince, now, stuckMs) {
    if (!ctx.global[flag]) {
        flagSince[flag] = 0;
        return;
    }
    if (!flagSince[flag]) {
        flagSince[flag] = now;
        return;
    }
    if (now - flagSince[flag] > stuckMs) {
        ctx.global[flag] = false;
        ctx.logger.alert(
            "Bot",
            "Watchdog",
            `Force-cleared stuck flag '${flag}' (held > ${stuckMs}ms).`,
        );
        flagSince[flag] = 0;
    }
}

/**
 * Check the captcha flag: if it has been held continuously longer than
 * `captchaMs`, force-clear it (and unpause when autoresume is enabled).
 *
 * @param {Client} ctx - The bot ctx; reads/writes the captcha flag.
 * @param {number} captchaSince - First-seen timestamp (0 when not held).
 * @param {number} now - Current epoch millis.
 * @param {number} captchaMs - Hold threshold in millis.
 * @returns {number} The updated first-seen timestamp.
 */
function checkCaptcha(ctx, captchaSince, now, captchaMs) {
    if (!ctx.global.captchadetected) return 0;
    if (!captchaSince) return now;
    if (now - captchaSince > captchaMs) {
        ctx.global.captchadetected = false;
        // If the user wants auto-resume, also unpause so farming continues.
        if (ctx.config.settings.autoresume) ctx.global.paused = false;
        ctx.logger.alert(
            "Bot",
            "Watchdog",
            `Force-cleared captcha flag held > ${captchaMs}ms.`,
        );
        return 0;
    }
    return captchaSince;
}

/**
 * Start the watchdog interval.
 *
 * @param {Client} ctx - The Discord ctx instance; reads/writes `global` flags.
 * @param {Object} [options] - Override thresholds (mainly for tests).
 * @param {number} [options.stuckMs] - Override STUCK_FLAG_MS.
 * @param {number} [options.captchaMs] - Override CAPTCHA_MAX_MS.
 * @param {number} [options.tick] - Override TICK_MS.
 * @returns {NodeJS.Timeout} The interval handle (so callers can clear it).
 */
function startWatchdog(ctx, options = {}) {
    const stuckMs = options.stuckMs ?? DEFAULT_STUCK_FLAG_MS;
    const captchaMs = options.captchaMs ?? DEFAULT_CAPTCHA_MAX_MS;
    const tick = options.tick ?? DEFAULT_TICK_MS;

    // Timestamp (ms) since each flag was first observed as continuously `true`.
    const flagSince = {};
    let captchaSince = 0;

    ctx.logger.info("Bot", "Watchdog", "Watchdog started.");

    return setInterval(() => {
        const now = Date.now();
        for (const flag of STUCK_FLAGS) {
            checkStuckFlag(ctx, flag, flagSince, now, stuckMs);
        }
        captchaSince = checkCaptcha(ctx, captchaSince, now, captchaMs);
    }, tick);
}

module.exports = {
    startWatchdog,
    STUCK_FLAGS,
    DEFAULT_STUCK_FLAG_MS,
    DEFAULT_CAPTCHA_MAX_MS,
    DEFAULT_TICK_MS,
};
