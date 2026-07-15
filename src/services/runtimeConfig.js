/**
 * Runtime config loader and environment resolver.
 *
 * Responsibilities:
 *  - Load config.json (production or developer override).
 *  - Apply .env overrides for token, user ID, and webhook URL.
 *  - Detect developer mode from env or current username.
 *  - Ensure owoprefix has a sensible default.
 *
 * The module executes its side effects at require time (loads config, applies
 * overrides, resolves developer mode) and exports the resolved `config` plus the
 * `DEVELOPER_MODE` flag for downstream consumers.
 */

const { DEFAULT_PREFIX } = require("../core/constants.js");
const dotenv = require("dotenv");
// Suppress dotenvx promotional messages (they spam every .env load).
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config();

/**
 * Detect developer mode based on environment variable or current username.
 * Developer mode loads the developer-specific config file.
 *
 * Order of resolution:
 *  1. `DEV_MODE=true` env var.
 *  2. OS username equals `"Mido"` (best-effort; ignored if `os.userInfo()` throws).
 *
 * @type {boolean}
 */
let DEVELOPER_MODE = process.env.DEV_MODE === "true";
if (!DEVELOPER_MODE) {
    try {
        const os = require("node:os");
        if (os.userInfo().username === "Mido") {
            DEVELOPER_MODE = true;
        }
    } catch (_error) {
        /* os.userInfo() failed, skip */
    }
}

/**
 * The resolved configuration object.
 *
 * Attempts the developer config first (when `DEVELOPER_MODE`), falling back to
 * the production `config.json`. Any load failure silently falls back to the
 * production config. `.env` overrides (token/userid/webhook) are applied after
 * load, and `owoprefix` is defaulted to `"owo"` when empty.
 *
 * @type {Object} The parsed and normalized config object.
 */
let config;
try {
    if (DEVELOPER_MODE) {
        config = require("../../developer/config.json");
    } else {
        config = require("../../config.json");
    }
} catch (_error) {
    config = require("../../config.json");
}

// Environment variables take precedence over config.json for secrets. This
// keeps tokens out of the git-tracked config and makes `.env` the single
// source of truth (`.env` is gitignored).
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

module.exports = { config, DEVELOPER_MODE };
