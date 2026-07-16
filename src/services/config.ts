/**
 * Configuration loading and validation.
 *
 * Responsibilities:
 *  - loadConfig: read config.json, apply .env overrides, default owoprefix.
 *  - validateConfig: ensure a usable token is present (fatal exit) and fill
 *    in missing interval defaults so the farm loops always have bounds.
 */

import dotenv from "dotenv";
import { DEFAULT_PREFIX } from "../core/constants.js";

// Suppress dotenvx promotional messages (they spam every .env load).
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config();

interface IntervalEntry {
    min: number;
    max: number;
}

interface BotConfig {
    main: {
        token: string;
        userid: string;
        commandschannelid: string;
        owodmchannelid: string;
        autostart: boolean;
        commands: Record<string, boolean>;
        maximum_gem_rarity: string;
    };
    settings: {
        owoprefix: string;
        chatfeedback: boolean;
        autoresume: boolean;
        autophrases: boolean;
        inventory: {
            use: Record<string, boolean>;
        };
        safety: {
            autopause: boolean;
            pauseafter: number;
            pausefor: number;
        };
        captcha: {
            alerttype: {
                webhook: boolean;
                webhookurl: string;
                desktop: {
                    force: boolean;
                    notification: boolean;
                    prompt: boolean;
                };
            };
        };
        [key: string]: unknown;
    };
    interval: Record<string, IntervalEntry>;
}

/**
 * Load and resolve the configuration object.
 */
function loadConfig(): { config: BotConfig } {
    const config: BotConfig = require("../../config.json");

    // Environment variables take precedence over config.json for secrets.
    const tokenFromEnv = Boolean(process.env.MAIN_TOKEN);
    if (tokenFromEnv) config.main.token = process.env.MAIN_TOKEN!;
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

interface LooseConfig {
    main?: { token?: string };
    interval?: Record<string, unknown>;
}

/**
 * Validate the resolved config: fatal-exit on missing token, fill interval
 * defaults for any action type not present in config.
 */
function validateConfig(config: BotConfig | LooseConfig): BotConfig {
    const token = (config as BotConfig).main?.token;
    if (!token || token.length < 10 || token.startsWith("(use ")) {
        console.error(
            "FATAL: config.json / .env içinde geçerli bir MAIN_TOKEN yok!",
        );
        process.exit(1);
    }

    // Default min/max intervals (ms) per action type.
    const INTERVAL_DEFAULTS: Record<string, [number, number]> = {
        hunt: [12000, 16000],
        battle: [12000, 16000],
        pray: [316000, 332000],
        animals: [610000, 661000],
    };

    const cfg = config as BotConfig;
    cfg.interval = cfg.interval || {};
    for (const [type, [min, max]] of Object.entries(INTERVAL_DEFAULTS)) {
        const existing = cfg.interval[type] as IntervalEntry | undefined;
        if (
            !existing ||
            typeof existing.min !== "number" ||
            typeof existing.max !== "number"
        ) {
            cfg.interval[type] = { min, max };
        }
    }

    return cfg;
}

export type { BotConfig, IntervalEntry };
export { loadConfig, validateConfig };
