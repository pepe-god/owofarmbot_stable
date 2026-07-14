/**
 * Centralized constants shared across the bot.
 *
 * Hardcoding IDs/strings in many modules makes them fragile and hard to
 * audit. Anything that is a fixed external identifier (Discord/OwO ids,
 * channel ids, the bundled extension id) lives here instead.
 */

// OwO (408785106942164992) is the only bot that can issue captcha prompts,
// quest logs, hunt results, inventory replies, etc.
const OWO_ID = "408785106942164992";

// Unpacked hCaptcha solver extension shipped under src/vendor/hcaptchasolver.
const HCAPTCHA_EXTENSION_ID = "pnfknmgliopmihbgmclhbalafndgmjkl";

module.exports = {
    OWO_ID,
    HCAPTCHA_EXTENSION_ID,
};
