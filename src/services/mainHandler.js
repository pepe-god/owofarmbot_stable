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

function initAutoJoin(client) {
    if (
        client.config.settings.autojoingiveaways &&
        client.global.owosupportserver
    ) {
        require("../modules/joingiveaways.js")(client);
    }
}

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

async function initQuest(client, message) {
    if (client.basic.commands.autoquest) {
        await client.globalutil.waitWhileBusy(client);
        require("../modules/quest.js")(client, message);
    } else {
        client.global.quest.title = "Quest not enabled";
    }
}

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

async function initPrayer(client, message) {
    if (client.basic.commands.pray || client.basic.commands.curse) {
        await client.globalutil.waitWhileBusy(client);
        await client.delay(32000);
        require("../modules/luck.js")(client, message);
    }
}

function initHuntbot(client) {
    if (client.basic.commands.huntbot.enable) {
        require("../modules/huntbot.js")(client);
    }
}

function initSafety(client) {
    if (client.config.settings.safety.autopause) {
        require("../modules/safety.js")(client);
    }
}
