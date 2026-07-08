/**
 * Main orchestration entry point for the `start`/`resume` command.
 *
 * Coordinates the initialization of every bot subsystem in sequence:
 *  - auto-join giveaways
 *  - farming (hunt/battle) or checklist
 *  - gambling (coinflip/slot)
 *  - quest tracking
 *  - animal sell/sacrifice
 *  - pray/curse luck buffs
 *  - huntbot automation
 *  - safety auto-pause
 *
 * Each subsystem is a self-looping module that manages its own timers.
 * This function only triggers their initial launch (with small inter-subsystem
 * delays to avoid command floods). It also normalizes an empty `owoprefix`.
 *
 * @param {Client} client - The Discord client instance; carries config and global state.
 * @param {Message} message - The command message that triggered start/resume (passed to modules that need it).
 * @returns {Promise<void>} Resolves once every enabled subsystem has been kicked off.
 * @sideeffect Launches all enabled subsystem loops and may set `config.settings.owoprefix` to `"owo"`.
 */
module.exports = async (client, message) => {
    await client.globalutil.waitWhileBusy(client);
    const channel = client.channels.cache.get(client.basic.commandschannelid);
    if (!client.config.settings.owoprefix.length)
        client.config.settings.owoprefix = "owo";

    initAutoJoin(client);
    await initFarming(client, channel, message);
    await client.delay(2000);
    await initGambling(client, message);
    await initQuest(client, message);
    await initAnimals(client, channel);
    await initPrayer(client, message);
    initHuntbot(client);
    initSafety(client);
};

/**
 * Conditionally start the giveaway auto-join module.
 * Requires both the config flag and the OwO support server presence.
 *
 * @param {Client} client - The Discord client instance; reads `config.settings.autojoingiveaways` and `global.owosupportserver`.
 * @returns {void} Kicks off the `joingiveaways` module; does not return a value.
 * @sideeffect Loads and starts the giveaway auto-join loop when enabled.
 */
function initAutoJoin(client) {
    if (
        client.config.settings.autojoingiveaways &&
        client.global.owosupportserver
    ) {
        require("../modules/joingiveaways.js")(client);
    }
}

/**
 * Start either the checklist subsystem or direct farm commands.
 * Checklist takes priority when enabled in config.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel.
 * @param {Message} message - The originating command message.
 * @returns {Promise<void>} Resolves once the chosen subsystem has been started.
 * @sideeffect Starts the checklist subsystem (which also launches farming) or the farm module directly.
 */
async function initFarming(client, channel, message) {
    if (client.basic.commands.checklist) {
        await client.globalutil.waitWhileBusy(client);
        await require("./checklist.js")(client, channel);
    } else {
        await client.globalutil.waitWhileBusy(client);
        await client.delay(2000);
        require("../modules/farm.js")(client, message);
    }
}

/**
 * Start gambling loops if coinflip or slot is enabled.
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.gamble`.
 * @param {Message} message - The originating command message.
 * @returns {Promise<void>} Resolves after the gamble loop is launched (plus an 8s buffer).
 * @sideeffect Starts the gamble module loop(s) when enabled.
 */
async function initGambling(client, message) {
    if (
        client.basic.commands.gamble.coinflip ||
        client.basic.commands.gamble.slot
    ) {
        await client.globalutil.waitWhileBusy(client);
        require("../modules/gamble.js")(client, message);
        // Small buffer before launching next subsystem.
        await client.delay(8000);
    }
}

/**
 * Start the quest tracking module, or mark quests as disabled.
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.autoquest`.
 * @param {Message} message - The originating command message.
 * @returns {Promise<void>} Resolves once quest tracking is started (or disabled).
 * @sideeffect Starts the quest module, or sets `global.quest.title = "Quest not enabled"`.
 */
async function initQuest(client, message) {
    if (client.basic.commands.autoquest) {
        await client.globalutil.waitWhileBusy(client);
        require("../modules/quest.js")(client, message);
    } else {
        client.global.quest.title = "Quest not enabled";
    }
}

/**
 * Start the animal sell/sacrifice loop.
 *
 * Selects "sell" vs "sacrifice" from config and passes the resolved, concatenated
 * animal-type suffix string (`global.temp.animaltype`) to the module.
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.animals`, `config.animals.type.sell`, and `global.temp.animaltype`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves once the animal loop is launched.
 * @sideeffect Starts the animals module loop when enabled.
 */
async function initAnimals(client, channel) {
    if (client.basic.commands.animals) {
        await client.globalutil.waitWhileBusy(client);
        await require("../modules/animals.js")(
            client,
            channel,
            client.config.animals.type.sell ? "sell" : "sacrifice",
            client.global.temp.animaltype,
        );
    }
}

/**
 * Start the pray/curse luck buff loop.
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.pray`/`curse`.
 * @param {Message} message - The originating command message.
 * @returns {Promise<void>} Resolves after the luck loop is launched (after a 32s spacing delay).
 * @sideeffect Starts the luck module loop when pray or curse is enabled.
 */
async function initPrayer(client, message) {
    if (client.basic.commands.pray || client.basic.commands.curse) {
        await client.globalutil.waitWhileBusy(client);
        // Initial wait to space out luck buffs from farming actions.
        await client.delay(32000);
        require("../modules/luck.js")(client, message);
    }
}

/**
 * Start the huntbot automation module.
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.huntbot.enable`.
 * @returns {void} Kicks off the huntbot module; does not return a value.
 * @sideeffect Starts the huntbot module loop when enabled.
 */
function initHuntbot(client) {
    if (client.basic.commands.huntbot.enable) {
        require("../modules/huntbot.js")(client);
    }
}

/**
 * Start the safety auto-pause module.
 *
 * @param {Client} client - The Discord client instance; reads `config.settings.safety.autopause`.
 * @returns {void} Kicks off the safety module; does not return a value.
 * @sideeffect Starts the safety auto-pause loop when enabled.
 */
function initSafety(client) {
    if (client.config.settings.safety.autopause) {
        require("../modules/safety.js")(client);
    }
}
