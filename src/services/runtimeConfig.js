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

const dotenv = require("dotenv");
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
    console.log(
        "Failed to load developer config, falling back to production config.",
    );
    config = require("../../config.json");
}

if (process.env.MAIN_TOKEN) config.main.token = process.env.MAIN_TOKEN;
if (process.env.MAIN_USERID) config.main.userid = process.env.MAIN_USERID;
if (process.env.WEBHOOK_URL)
    config.settings.captcha.alerttype.webhookurl = process.env.WEBHOOK_URL;

if (!config.settings.owoprefix || config.settings.owoprefix.length <= 0) {
    config.settings.owoprefix = "owo";
}

module.exports = { config, DEVELOPER_MODE };
