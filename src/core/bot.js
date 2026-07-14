/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-escape */

/**
 * Bot runtime bootstrap.
 *
 * Responsibilities:
 *  - Suppress Node deprecation warnings.
 *  - Load configuration and package metadata.
 *  - Build the shared global state object attached to the Discord client.
 *  - Wire Discord Rich Presence (RPC).
 *  - Validate config, then log in and register handlers/commands.
 */

process.emitWarning = (warning, type) => {
    if (type === "DeprecationWarning") {
        return;
    }
    console.warn(warning);
};

const cp = require("node:child_process");

const { config, DEVELOPER_MODE } = require("../services/runtimeConfig.js");
const packageJson = require("../../package.json");

const fs = require("node:fs");
const chalk = require("chalk");

const globalutil = require("./globalutil.js");
const configValidator = require("../services/configValidator.js");
const LoopManager = require("../services/loopManager.js");

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
function rpc(type) {
    const status = new RichPresence(client)
        .setApplicationId("1253757665520259173")
        .setType("PLAYING")
        .setName("OwO Farm Bot Stable")
        .setDetails("Auto Farming")
        .setState(`${client.global.paused ? "Paused" : "Running"}`)
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
                chalk.magenta(type) +
                " > " +
                chalk.green(`${client.global.paused ? "Paused" : "Running"}`),
        );
    }
}

/**
 * Attach shared utilities, config, and helpers directly onto the
 * Discord client instance so every module can access them via `client.X`.
 * This avoids passing the same objects through long call chains.
 */
// Attach shared singletons/helpers onto the client so every module can use
// them without long import/parameter chains. This is the single source of
// truth for logger, config, delay, global state, etc.
Object.assign(client, {
    chalk,
    fs,
    notifier,
    childprocess: cp,
    config,
    basic: config.main,
    delay,
    global: owofarmbot_stable,
    rpc,
    logger: require("../services/logger.js")(client),
    globalutil,
    // Central lifecycle controller for all self-looping subsystems: owns the
    // atomic first-start gate and the cancellable timer registry.
    loops: new LoopManager(),
    // Randomize between "owo" and the configured prefix to look less bot-like.
    prefix: () =>
        globalutil.commandrandomizer(["owo", client.config.settings.owoprefix]),
});

// Show the bot version in process listings (e.g. `ps aux`).
process.title = `OwO Farm Bot Stable v${packageJson.version}`;

/**
 * Use an IIFE to allow top-level async/await without requiring
 * the file to be fully module-exported. This bootstraps config
 * validation and login before the process continues.
 */
(async () => {
    // 1) Validate config shape, 2) load runtime/extra config into `client`.
    await configValidator.verifyconfig(client, config);
    await configValidator.getconfig(config, client);

    // 3) Wire collections, handlers/events, then log in to Discord.
    await initializeBot();

    client.logger.warn(
        "Bot",
        "Help",
        `Use "${client.prefix()}start" to start the bot, "${client.prefix()}resume" to resume, and "${client.prefix()}pause" to pause.`,
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
    require("./index.js")(client);

    client.logger.warn("Bot", "Startup", "Logging in...");
    await client.login(config.main.token);
}
