const { commandrandomizer, getrand } = require("../utils/globalutil.js");

const OWO_ID = "408785106942164992";

const REWARD_KINDS = {
    weaponshard: " Weapon Shard",
    cowoncy: " Cowoncy",
    box: "Bunch of lootbox",
    crate: "Bunch of weapon crate",
};

module.exports = async (client) => {
    client.logger.warn("Farm", "Quest", "Waiting");
    const channel = client.channels.cache.get(client.basic.autoquestchannelid);
    client.logger.info("Farm", "Quest", "Ready!");
    questHandler(client, channel);
};

async function questHandler(client, channel) {
    await client.globalutil.waitWhileBusy(client);

    try {
        client.logger.info("Farm", "Questing", "Getting quest...");
        const embed = await fetchQuestEmbed(client, channel);

        if (embed == null) {
            await client.globalutil.waitWhileBusy(client);
            client.logger.alert(
                "Farm",
                "Quest",
                "Cannot get quest! Recheck after 61 seconds.",
            );
            setTimeout(() => questHandler(client, channel), 61000);
            return;
        }

        const embedContent = embed.embeds[0].description;
        await client.delay(1600);

        if (embedContent.includes("You finished all of your quests!")) {
            client.logger.info("Farm", "Quest", "All quests completed!");
            client.global.quest.title = "All quests completed!";
            client.global.quest.reward = "";
            client.global.quest.progress = "";
            return;
        }

        const quests = parseQuests(embedContent);
        await selectQuest(client, channel, quests);
    } catch (err) {
        client.logger.alert(
            "Farm",
            "Quest",
            `Error while getting quest: ${err}\nRecheck after 61 seconds.`,
        );
        client.logger.debug(err);
        setTimeout(() => questHandler(client, channel), 61000);
    }
}

async function fetchQuestEmbed(client, channel) {
    channel.sendTyping();
    const questmsg = await channel.send({
        content: `${client.prefix()} ${commandrandomizer(["q", "quest"])}`,
    });

    const message = await client.globalutil.waitForMessage(
        client,
        channel,
        (msg) =>
            msg.embeds[0]?.author?.name.includes("Quest Log") &&
            msg.channel.id === channel.id &&
            msg.author.id === OWO_ID &&
            msg.id.localeCompare(questmsg.id) > 0,
        16000,
    );

    return message;
}

function parseQuests(embedDescription) {
    const questLines = embedDescription
        .split(/\n(?=\*\*\d+\.)/)
        .filter((line) => line.startsWith("**"));

    return questLines.map((line) => {
        const title = line.match(/\*\*\d+\.\s(.+?)\*\*/)[1];
        const rewardGroup = line.match(
            /Reward:`\s*(?<reward>\d*)\s*<:(?<rewardtype>[\w]+):\d+>/,
        );
        const progressGroup = line.match(/Progress:\s*\[(\d+)\/(\d+)\]/);

        return {
            title,
            reward: rewardGroup?.groups?.reward ?? "",
            type: rewardGroup?.groups?.rewardtype ?? "",
            pro1: progressGroup ? parseInt(progressGroup[1], 10) : 0,
            pro2: progressGroup ? parseInt(progressGroup[2], 10) : 0,
            isLocked: line.includes("🔒 Locked"),
        };
    });
}

async function selectQuest(client, channel, quests) {
    for (const quest of quests) {
        if (quest.isLocked) continue;

        switch (true) {
            case quest.title.includes("Say 'owo'"):
                questOwO(client, channel, quest);
                break;
            case quest.title.includes("Gamble"):
                if (
                    !client.basic.commands.gamble.coinflip &&
                    !client.basic.commands.gamble.slot
                ) {
                    questGamble(client, channel, quest);
                } else continue;
                break;
            case quest.title.includes("Use an action command on someone"):
                questActionOther(client, channel, quest);
                break;
            default:
                continue;
        }

        const rwKind = REWARD_KINDS[quest.type] ?? "";
        client.global.quest.title = quest.title;
        client.global.quest.reward = quest.reward + rwKind;
        client.global.quest.progress = `${quest.pro1} / ${quest.pro2}`;
        client.logger.info("Farm", "Quest", `Quest found: ${quest.title}`);
        return;
    }

    client.logger.info("Farm", "Quest", "No active quest found!");
    client.global.quest.title = "No active quest found";
    client.global.quest.reward = "";
    client.global.quest.progress = "Recheck after 61 seconds";
}

async function questLoop(client, channel, quest, opts) {
    const delayMs = opts.delay || 16000;

    if (opts.delayBefore) await client.delay(opts.delayBefore);

    const condition = () =>
        opts.loopMinus != null
            ? quest.pro1 + opts.loopMinus < quest.pro2
            : quest.pro1 < quest.pro2;

    while (condition()) {
        await client.globalutil.waitWhileBusy(client);
        try {
            channel.sendTyping();
            await channel.send({
                content: opts.build(client, commandrandomizer),
            });
            quest.pro1++;
            client.global.quest.progress = `${quest.pro1} / ${quest.pro2}`;
            await client.delay(
                opts.useGetRand ? getrand(12000, 16000) : delayMs,
            );
        } catch (err) {
            client.logger.alert(
                "Farm",
                "Quest",
                `Error while doing quest: ${err}`,
            );
            client.logger.debug(err);
            quest.pro1--;
            client.global.quest.progress = `${quest.pro1} / ${quest.pro2}`;
        }
    }

    client.global.quest.progress = "Completed!";
    setTimeout(() => questHandler(client, channel), 16000);
}

async function questOwO(client, channel, quest) {
    await questLoop(client, channel, quest, {
        build: () => commandrandomizer(["owo", "Owo", "owO", "OwO"]),
        loopMinus: -10,
        useGetRand: true,
    });
}

async function questGamble(client, channel, quest) {
    await questLoop(client, channel, quest, {
        build: (_c, cr) =>
            `${cr(["owo", "Owo", "owO", "OwO"])} ${cr(["cf", "coinflip"])} ${cr(["head", "h", "t", "tail"])}`,
        useGetRand: true,
    });
}

async function questActionOther(client, channel, quest) {
    await questLoop(client, channel, quest, {
        build: (_c, cr) =>
            `${cr(["owo", "Owo", "owO", "OwO"])} ${cr(["cuddle", "hug", "kiss", "lick", "nom", "pat", "poke", "slap", "bite", "punch", "wave", "snuggle", "highfive"])} <@408785106942164992>`,
        useGetRand: true,
    });
}

module.exports.parseQuests = parseQuests;
