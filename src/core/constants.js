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

// OwO Bot Support guild, used for giveaway auto-join membership checks.
const OWO_SUPPORT_GUILD_ID = "420104212895105044";

// Giveaway announcement channels inside the OwO support guild.
const GIVEAWAY_CHANNEL_IDS = [
    "1099453684691243098",
    "1168797748343099444",
    "1168797827464429618",
];

// Unpacked hCaptcha solver extension shipped under src/vendor/hcaptchasolver.
const HCAPTCHA_EXTENSION_ID = "pnfknmgliopmihbgmclhbalafndgmjkl";

module.exports = {
    OWO_ID,
    OWO_SUPPORT_GUILD_ID,
    GIVEAWAY_CHANNEL_IDS,
    HCAPTCHA_EXTENSION_ID,
};
