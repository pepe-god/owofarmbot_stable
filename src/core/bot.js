/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-escape */

/**
 * Bot runtime bootstrap.
 *
 * Responsibilities:
 *  - Load configuration and package metadata.
 *  - Build the shared global state object attached to the Discord client.
 *  - Wire Discord Rich Presence (RPC).
 *  - Validate config, then log in and register handlers/commands.
 */

const cp = require("node:child_process");

const { config, DEVELOPER_MODE } = require("../services/runtimeConfig.js");
const packageJson = require("../../package.json");

const fs = require("node:fs");
const chalk = require("chalk");

const globalutil = require("./globalutil.js");
const configSchema = require("../services/configSchema.js");
const LoopManager = require("../services/loopManager.js");
const { attachState } = require("../services/botState.js");
const BotContext = require("./botContext.js");
const { initializeBootstrap } = require("./bootstrap.js");
const { startWatchdog } = require("../services/watchdog.js");

//client
const { Client, Collection, RichPresence } = require("discord.js-selfbot-v13");
const client = new Client();

/**
 * Factory that creates the shared global state object stored at
 * `client.global`. This object tracks runtime flags (paused, captcha,
 * inventory, checklist) and counters for every bot feature.
 *
 * @param {string} name - Identifier for this state instance.
 * @param {string} type - Display type used in logs/RPC.
 * @returns {Object} The initialized global state object.
 */
function createGlobalState(name, type) {
    return {
        name,
        type,
        devmod: DEVELOPER_MODE,
        captchadetected: false,
        paused: true,
        owosupportserver: false,
        use: false,
        inventory: false,
        checklist: false,
        hunt: false,
        battle: false,
        total: {
            hunt: 0,
            battle: 0,
            pray: 0,
            curse: 0,
            huntbot: 0,
            captcha: 0,
            solvedcaptcha: 0,
            vote: 0,
            giveaway: 0,
        },
        gems: {
            need: [],
            use: "",
            isevent: true,
            rareLevel: 0,
            huntssinceinv: 0,
            missingHandled: false,
        },
        gamble: {
            coinflip: 0,
            slot: 0,
            cowoncywon: 0,
        },
        quest: {
            title: "Waiting...",
            reward: "",
            progress: "",
        },
        temp: {
            usedevent: false,
            usedcookie: false,
            animaltype: "",
            huntbot: {
                maxtime: "",
                recalltime: 0,
                essence: false,
            },
            intervals: {
                checklist: 0,
            },
            isready: false,
            started: false,
        },
    };
}

const owofarmbot_stable = createGlobalState("owofarmbot_stable", "Main");

// Bind the event-driven state machine to the busy flags. This makes the flag
// reads/writes flow through `BotState` so `waitWhileBusy` can resolve on state
// changes instead of polling (see globalutil.js).
const botState = attachState(owofarmbot_stable);

const notifier = require("node-notifier");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sets or updates the Discord Rich Presence activity shown on the
 * bot owner's profile. Presence reflects whether the bot is currently
 * paused or running.
 *
 * @param {string} type - The subsystem triggering the RPC update
 *   (e.g. "Farm", "Quest", "Huntbot").
 */
function rpc(_type) {
    const status = new RichPresence(client)
        .setApplicationId("1253757665520320259173")
        .setType("PLAYING")
        .setName("OwO Farm Bot Stable")
        .setDetails("Auto Farming")
        .setState(`${ctx.global.paused ? "Paused" : "Running"}`)
        .setStartTimestamp(Date.now())
        .setAssetsLargeImage("1253758464816054282")
        .setAssetsLargeText("OwO Farm Bot Stable")
        .addButton("Farm Bot", "https://github.com/Mid0Hub/owofarmbot_stable")
        .addButton("Discord", "https://discord.gg/WzYXVbXt6C");

    if (config.settings.discordrpc) {
        client.user.setPresence({ activities: [status] });
        console.log(
            chalk.blue("RPC") +
                " > " +
                chalk.magenta("update") +
                " > " +
                chalk.green(`${ctx.global.paused ? "Paused" : "Running"}`),
        );
    }
}

/**
 * Build the explicit dependency-injection container.
 *
 * Previously every service was monkeypatched onto the Discord client
 * (`Object.assign(client, {...})`), turning `client` into a god object.
 * Now the dependencies are grouped in a `BotContext` so modules receive an
 * explicit `ctx` and the Discord client is only used as the Discord API
 * (`ctx.client`).
 */
const prefix = () =>
    globalutil.commandrandomizer(["owo", config.settings.owoprefix]);

const ctx = new BotContext({
    client,
    config,
    basic: config.main,
    global: owofarmbot_stable,
    state: botState,
    loops: new LoopManager(),
    globalutil,
    delay,
    prefix,
    chalk,
    childprocess: cp,
    notifier,
    fs,
});
// The logger and rpc need the context itself, so wire them in after creation.
ctx.logger = require("../services/logger.js")(ctx);
ctx.rpc = rpc;

// Centralize process-wide side effects (SIGINT dump + crash/flag watchdog).
initializeBootstrap(ctx);
startWatchdog(ctx);

// Opt-in health/metrics endpoint. Only starts when HEALTH_PORT is set so the
// default runtime opens no ports (see src/services/health.js).
if (process.env.HEALTH_PORT) {
    const { startHealthServer } = require("../services/health.js");
    startHealthServer(ctx, { port: Number(process.env.HEALTH_PORT) });
}

// Show the bot version in process listings (e.g. `ps aux`).
process.title = `OwO Farm Bot Stable v${packageJson.version}`;

/**
 * Use an IIFE to allow top-level async/await without requiring
 * the file to be fully module-exported. This bootstraps config
 * validation and login before the process continues.
 */
(async () => {
    ctx.logger.info("Bot", "Config", "Verifying Config... Please wait...");

    const result = configSchema.validateConfig(ctx, config);
    configSchema.parseConfigErrors(result.errors, ctx);

    if (result.success) {
        ctx.logger.info(
            "Bot",
            "Config",
            "Config verified, things seem to be okey :3",
        );
    }

    ctx.logger.debug(configSchema.getDebugConfig(ctx, config));

    await initializeBot();

    ctx.logger.warn(
        "Bot",
        "Help",
        `Use "${ctx.prefix()}start" to start the bot, "${ctx.prefix()}resume" to resume, and "${ctx.prefix()}pause" to pause.`,
    );
})();

/**
 * Finalizes client setup: initializes command/alias collections,
 * loads handlers, and logs into Discord using the configured token.
 */
async function initializeBot() {
    // Discord.js uses Collection maps to store registered commands/aliases.
    for (const x of ["aliases", "commands"]) client[x] = new Collection();

    // Run the consolidated handler loader (anti-crash, commands, events).
    require("./index.js")(ctx);

    ctx.logger.warn("Bot", "Startup", "Logging in...");
    await ctx.client.login(config.main.token);
}
