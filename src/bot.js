/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-escape */

process.emitWarning = (warning, type) => {
    if (type === "DeprecationWarning") {
        return;
    }
    console.warn(warning);
};

const cp = require("node:child_process");

const { config, DEVELOPER_MODE } = require("./services/configLoader.js");
const packageJson = require("../package.json");

const fs = require("node:fs");
const chalk = require("chalk");

const globalutil = require("./utils/globalutil.js");
const configValidator = require("./services/configValidator.js");

//client
const { Client, Collection, RichPresence } = require("discord.js-selfbot-v13");
const client = new Client();
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
    logger: require("./services/logger.js")(client),
    globalutil,
    prefix: () =>
        globalutil.commandrandomizer(["owo", client.config.settings.owoprefix]),
});

process.title = `OwO Farm Bot Stable v${packageJson.version}`;

(async () => {
    await configValidator.verifyconfig(client, config);
    await configValidator.getconfig(config, client);

    await initializeBot();

    client.logger.warn(
        "Bot",
        "Help",
        `Use "${client.prefix()}start" to start the bot, "${client.prefix()}resume" to resume, and "${client.prefix()}pause" to pause.`,
    );
})();

async function initializeBot() {
    for (const x of ["aliases", "commands"]) client[x] = new Collection();

    require("./handlers")(client);

    client.logger.warn("Bot", "Startup", "Logging in...");
    await client.login(config.main.token);
}
