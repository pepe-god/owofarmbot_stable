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
 * This function only triggers their initial launch.
 *
 * @param {Client} client - The Discord client instance.
 * @param {Message} message - The command message that triggered start/resume.
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
 */
async function initGambling(client, message) {
    if (
        client.basic.commands.gamble.coinflip ||
        client.basic.commands.gamble.slot
    ) {
        await client.globalutil.waitWhileBusy(client);
        require("../modules/gamble.js")(client, message);
        await client.delay(8000);
    }
}

/**
 * Start the quest tracking module, or mark quests as disabled.
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
 * @param {TextChannel} channel - The commands channel.
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
 */
async function initPrayer(client, message) {
    if (client.basic.commands.pray || client.basic.commands.curse) {
        await client.globalutil.waitWhileBusy(client);
        await client.delay(32000);
        require("../modules/luck.js")(client, message);
    }
}

/**
 * Start the huntbot automation module.
 */
function initHuntbot(client) {
    if (client.basic.commands.huntbot.enable) {
        require("../modules/huntbot.js")(client);
    }
}

/**
 * Start the safety auto-pause module.
 */
function initSafety(client) {
    if (client.config.settings.safety.autopause) {
        require("../modules/safety.js")(client);
    }
}
