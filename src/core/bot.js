/**
 * Bot runtime bootstrap: load config, build global state, validate, register
 * handlers/commands, then log in.
 */

const cp = require("node:child_process");

const { DEFAULT_PREFIX } = require("./constants.js");
const { loadConfig, validateConfig } = require("../services/config.js");
const { config } = loadConfig();
const packageJson = require("../../package.json");

const fs = require("node:fs");
const chalk = require("chalk");

const globalutil = require("./globalutil.js");
const { BotState, LoopManager } = require("../services/runtime.js");

// Discord.js selfbot client
const { Client, Collection } = require("discord.js-selfbot-v13");
const client = new Client();

/**
 * Factory that creates the shared global state object (runtime flags + counters).
 * @param {string} name - Identifier for this state instance.
 * @param {string} type - Display type used in logs.
 * @returns {Object} The initialized global state object.
 */
function createGlobalState(name, type) {
    return {
        name,
        type,
        captchadetected: false,
        paused: true,
        use: false,
        inventory: false,
        hunt: false,
        battle: false,
        total: {
            hunt: 0,
            battle: 0,
            pray: 0,
            curse: 0,
            captcha: 0,
            solvedcaptcha: 0,
        },
        gems: {
            need: [],
            use: "",
            isevent: true,
            rareLevel: 7,
            huntssinceinv: 0,
            missingHandled: false,
        },
        temp: {
            usedevent: false,
            animaltype: "",
            isready: false,
            started: false,
        },
    };
}

const owofarmbot_stable = createGlobalState("owofarmbot_stable", "Main");

// Bind the state helper to the shared global flags (plain booleans).
const botState = new BotState(owofarmbot_stable);

const notifier = require("node-notifier");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const prefix = () =>
    globalutil.commandrandomizer([DEFAULT_PREFIX, config.settings.owoprefix]);

// Plain context object (replaces the old BotContext DI class — modules just
// read what they need off `ctx`).
const ctx = {
    client,
    config,
    global: owofarmbot_stable,
    state: botState,
    loops: new LoopManager(),
    globalutil,
    delay,
    prefix,
    chalk,
    child_process: cp,
    notifier,
    fs,
};
// The logger needs the context itself, so wire it in after creation.
ctx.logger = require("../services/logger.js")(ctx);

// Suppress non-DeprecationWarning noise from Node internals.
process.emitWarning = (warning, type) => {
    if (type === "DeprecationWarning") return;
    console.warn(warning);
};
// On SIGINT, flush buffered logs then exit cleanly.
process.on("SIGINT", () => {
    ctx.logger?.dumpExitLog?.();
    process.exit(0);
});

// Show the bot version in process listings (e.g. `ps aux`).
process.title = `OwO Farm Bot Stable v${packageJson.version}`;

/**
 * Install global process-level error listeners (unhandledRejection, uncaughtException).
 */
function setupAntiCrash() {
    const { RateLimitError, describeError } = require("../services/errors.js");

    const logError = (type, err, origin = null) => {
        // EPIPE means the stdout/stderr reader closed — never log it (would
        // itself throw EPIPE again, spiraling into an alert storm).
        if (err && err.code === "EPIPE") return;

        // Redact anything that looks like a Discord token to prevent secrets in logs.
        const sanitize = (text) =>
            typeof text === "string"
                ? text.replace(
                      /[a-zA-Z0-9_-]{24,30}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,40}/g,
                      "[REDACTED_TOKEN]",
                  )
                : text;
        const errMessage = `--------------------------------------
Error: ${sanitize(err?.message) || err}
Stack: ${sanitize(err?.stack) || "No stack trace available"}
Origin: ${origin || "N/A"}
Classification: ${describeError(err)}
--------------------------------------`;

        const classified =
            err instanceof RateLimitError
                ? "Rate limited"
                : "An crash happened!";
        ctx.logger.alert(
            "Bot",
            "Anticrash",
            `${classified} (${type})\n${errMessage}`,
        );
    };

    process.on("unhandledRejection", (reason, p) => {
        logError("Unhandled Rejection", reason, p);
    });
    process.on("uncaughtException", (err, origin) => {
        logError("Uncaught Exception", err, origin);
    });
}

/**
 * Register a single command file (supports single or array exports).
 */
function registerCommand(pull) {
    const list = Array.isArray(pull) ? pull : [pull];
    for (const cmd of list) {
        if (!cmd.config?.name) continue;
        ctx.client.commands.set(cmd.config.name, cmd);
        if (cmd.config.aliases)
            for (const a of cmd.config.aliases)
                ctx.client.aliases.set(a, cmd.config.name);
    }
}

/**
 * Discover and register all commands/events from src/core/.
 */
async function registerHandlers() {
    const EXCLUDE = new Set([
        "bot.js",
        "globalutil.js",
        "constants.js",
        "messageCreate.js",
    ]);
    let files;
    try {
        files = (await fs.promises.readdir(__dirname)).filter(
            (d) => d.endsWith(".js") && !EXCLUDE.has(d),
        );
    } catch (err) {
        ctx.logger.alert(
            "Handler",
            "Discovery",
            `Failed to read core directory: ${err.message}`,
        );
        return;
    }
    for (const file of files) {
        try {
            const pull = require(`./${file}`);
            if (typeof pull === "function") {
                // Event handler: event name = filename.
                const eName = file.split(".")[0];
                ctx.client.on(eName, pull.bind(null, ctx));
            } else {
                registerCommand(pull);
            }
        } catch (err) {
            ctx.logger.alert(
                "Handler",
                "Discovery",
                `Failed to load ${file}: ${err.message}`,
            );
        }
    }
}

/**
 * Top-level async bootstrap: validate config, register handlers, then log in.
 */
(async () => {
    validateConfig(config);
    setupAntiCrash();

    for (const x of ["aliases", "commands"]) client[x] = new Collection();
    await registerHandlers();

    ctx.logger.info("Bot", "Startup", "Logging in...");
    await ctx.client.login(config.main.token);

    ctx.logger.warn(
        "Bot",
        "Help",
        `Use "${ctx.prefix()}start" to start the bot, "${ctx.prefix()}resume" to resume, and "${ctx.prefix()}pause" to pause.`,
    );
})();
