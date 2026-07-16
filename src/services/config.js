/**
 * Configuration loading and validation.
 *
 * Responsibilities:
 *  - loadConfig: read config.json, apply .env overrides, default owoprefix.
 *  - validateConfig: ensure a usable token is present (fatal exit) and fill
 *    in missing interval defaults so the farm loops always have bounds.
 */

const { DEFAULT_PREFIX } = require("../core/constants.js");
const dotenv = require("dotenv");
// Suppress dotenvx promotional messages (they spam every .env load).
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config();

/**
 * Load and resolve the configuration object.
 *
 * @returns {{ config: Object }}
 */
function loadConfig() {
    const config = require("../../config.json");

    // Environment variables take precedence over config.json for secrets.
    const tokenFromEnv = Boolean(process.env.MAIN_TOKEN);
    if (tokenFromEnv) config.main.token = process.env.MAIN_TOKEN;
    if (process.env.MAIN_USERID) config.main.userid = process.env.MAIN_USERID;
    if (process.env.WEBHOOK_URL)
        config.settings.captcha.alerttype.webhookurl = process.env.WEBHOOK_URL;

    // Backward-compat: a token stored directly in config.json is deprecated.
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

/**
 * Validate the resolved config: fatal-exit on missing token, fill interval
 * defaults for any action type not present in config.
 *
 * @param {Object} config - The resolved config object from loadConfig.
 * @returns {Object} The same config object, with interval defaults applied.
 */
function validateConfig(config) {
    const token = config?.main?.token;
    if (!token || token.length < 10 || token.startsWith("(use ")) {
        console.error(
            "FATAL: config.json / .env içinde geçerli bir MAIN_TOKEN yok!",
        );
        process.exit(1);
    }

    // Default min/max intervals (ms) per action type.
    const INTERVAL_DEFAULTS = {
        hunt: [12000, 16000],
        battle: [12000, 16000],
        pray: [316000, 332000],
        animals: [610000, 661000],
    };

    config.interval = config.interval || {};
    for (const [type, [min, max]] of Object.entries(INTERVAL_DEFAULTS)) {
        if (
            !config.interval[type] ||
            typeof config.interval[type].min !== "number" ||
            typeof config.interval[type].max !== "number"
        ) {
            config.interval[type] = { min, max };
        }
    }

    return config;
}

module.exports = { loadConfig, validateConfig };
