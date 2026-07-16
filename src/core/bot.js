/**
 * Bot runtime bootstrap: load config, build global state, validate, then log in and register handlers/commands.
 */

const cp = require("node:child_process");

const { DEFAULT_PREFIX } = require("../core/constants.js");
const { loadConfig } = require("../services/runtimeConfig.js");
const { config } = loadConfig();
const packageJson = require("../../package.json");

const fs = require("node:fs");
const chalk = require("chalk");

const globalutil = require("./globalutil.js");
const configSchema = require("../services/configSchema.js");
const LoopManager = require("../services/loopManager.js");
const { attachState } = require("../services/botState.js");
const BotContext = require("./botContext.js");
const { startWatchdog } = require("../services/watchdog.js");

// Discord.js selfbot client
const { Client, Collection } = require("discord.js-selfbot-v13");
const client = new Client();

/**
 * Factory that creates the shared global state object stored at `client.global` (runtime flags + per-feature counters).
 * @param {string} name - Identifier for this state instance.
 * @param {string} type - Display type used in logs/RPC.
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
            rareLevel: 0,
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

// Bind the event-driven state machine to the busy flags so `waitWhileBusy` resolves on state changes instead of polling.
const botState = attachState(owofarmbot_stable);

const notifier = require("node-notifier");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build the explicit dependency-injection container (replaces the old `Object.assign(client, {...})` god object).
 */
const prefix = () =>
    globalutil.commandrandomizer([DEFAULT_PREFIX, config.settings.owoprefix]);

const ctx = new BotContext({
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
});
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
startWatchdog(ctx);

// Show the bot version in process listings (e.g. `ps aux`).
process.title = `OwO Farm Bot Stable v${packageJson.version}`;

/**
 * Top-level async bootstrap: validate config, then log in.
 */
(async () => {
    const result = configSchema.validateConfig(ctx, config);
    configSchema.parseConfigErrors(result.errors, ctx);
    ctx.logger.debug(configSchema.getDebugConfig(ctx, config));

    await initializeBot();

    ctx.logger.warn(
        "Bot",
        "Help",
        `Use "${ctx.prefix()}start" to start the bot, "${ctx.prefix()}resume" to resume, and "${ctx.prefix()}pause" to pause.`,
    );
})();

/**
 * Finalizes client setup: init command/alias collections, load handlers, and log in.
 */
async function initializeBot() {
    for (const x of ["aliases", "commands"]) client[x] = new Collection();

    await require("./index.js")(ctx);

    ctx.logger.info("Bot", "Startup", "Logging in...");
    await ctx.client.login(config.main.token);
}
