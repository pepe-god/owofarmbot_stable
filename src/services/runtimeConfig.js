/**
 * Runtime config loader and environment resolver.
 *
 * Responsibilities:
 *  - Load config.json.
 *  - Apply .env overrides for token, user ID, and webhook URL.
 *  - Ensure owoprefix has a sensible default.
 *
 * The module exports a factory function `loadConfig()` that performs all side
 * effects (file I/O, env reads, console.warn) and returns the resolved config.
 * This makes the module testable and avoids module-level side effects.
 */

const { DEFAULT_PREFIX } = require("../core/constants.js");
const dotenv = require("dotenv");
// Suppress dotenvx promotional messages (they spam every .env load).
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config();

/**
 * Load and resolve the configuration object.
 *
 * Loads `config.json`. Any load failure throws. `.env` overrides
 * (token/userid/webhook) are applied after load, and `owoprefix` is defaulted
 * to `"owo"` when empty.
 *
 * @returns {{ config: Object }}
 */
function loadConfig() {
    const config = require("../../config.json");

    // Environment variables take precedence over config.json for secrets.
    // This keeps tokens out of the git-tracked config and makes `.env` the
    // single source of truth (`.env` is gitignored).
    const tokenFromEnv = Boolean(process.env.MAIN_TOKEN);
    if (tokenFromEnv) config.main.token = process.env.MAIN_TOKEN;
    if (process.env.MAIN_USERID) config.main.userid = process.env.MAIN_USERID;
    if (process.env.WEBHOOK_URL)
        config.settings.captcha.alerttype.webhookurl = process.env.WEBHOOK_URL;

    // Backward-compat: a token stored directly in config.json is deprecated
    // because config.json is git-tracked. The logger is not wired yet at this
    // require-time, so we use console.warn (transient) to nudge the user toward
    // `.env`. No warning is emitted once the token comes from the env override.
    // Placeholder strings like "(use MAIN_TOKEN in .env)" are skipped.
    if (
        !tokenFromEnv &&
        config.main.token &&
        config.main.token.length > 0 &&
        !config.main.token.startsWith("(use ")
    ) {
        console.warn(
            "[DEPRECATED] Found a token in config.json. Storing tokens in " +
                "config.json is deprecated and a security risk. Set MAIN_TOKEN in " +
                "your .env file instead (it is gitignored).",
        );
    }

    if (!config.settings.owoprefix || config.settings.owoprefix.length <= 0) {
        config.settings.owoprefix = DEFAULT_PREFIX;
    }

    return { config };
}

module.exports = { loadConfig };
