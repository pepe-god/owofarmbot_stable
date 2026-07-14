const { commandrandomizer, getrand } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");

/**
 * Human-readable suffixes appended to a quest reward amount based on its type.
 * Used purely for logging/display of the active quest's reward.
 */
const REWARD_KINDS = {
    weaponshard: " Weapon Shard",
    cowoncy: " Cowoncy",
    box: "Bunch of lootbox",
    crate: "Bunch of weapon crate",
};

/**
 * Quest module entry point — starts the quest loop.
 *
 * Resolves the auto-quest channel and hands off to {@link questHandler}, which
 * fetches the quest log and drives execution. Logs a brief "Waiting"/"Ready!"
 * status around startup.
 *
 * @param {Client} client - The Discord client instance; reads `basic.autoquestchannelid` and global quest state.
 * @returns {void} Delegates to {@link questHandler}; does not return a value.
 */
module.exports = async (client) => {
    client.logger.warn("Farm", "Quest", "Waiting");
    const channel = client.channels.cache.get(client.basic.autoquestchannelid);
    client.logger.info("Farm", "Quest", "Ready!");
    questHandler(client, channel);
};

/**
 * Main quest orchestration loop.
 *
 * Waits for the bot to be idle, fetches the quest embed, and bails out (retry
 * after 61s) when it cannot be obtained or when all quests are finished. Once
 * the quest list is parsed, {@link selectQuest} picks an executable quest and
 * starts its loop. Any error retries the whole cycle after 61s.
 *
 * @param {Client} client - The Discord client instance; carries the quest state.
 * @param {TextChannel} channel - The quest commands channel.
 * @returns {Promise<void>} Resolves when the current cycle finishes or is deferred to a retry timer.
 */
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

/**
 * Send the quest command and wait for OwO's quest log embed.
 *
 * Sends `owo quest` and waits up to 16s for OwO's "Quest Log" embed that is
 * newer than the command. Returns null if no embed arrives in time.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The quest commands channel.
 * @returns {Promise<Message|null>} The quest log message, or null on timeout.
 */
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

/**
 * Parse the quest log embed description into structured quest objects.
 *
 * Splits the description on each "**N." numbered quest heading and extracts the
 * title, reward amount + type, progress counters and lock status for each entry.
 *
 * @param {string} embedDescription - Raw embed description text from the Quest Log.
 * @returns {Array<Object>} Parsed quest entries, each with:
 * @returns {string} return[].title - The quest's display title.
 * @returns {string} return[].reward - Reward amount (may be empty).
 * @returns {string} return[].type - Reward type key (e.g. "cowoncy", "weaponshard").
 * @returns {number} return[].pro1 - Current progress count.
 * @returns {number} return[].pro2 - Target progress count.
 * @returns {boolean} return[].isLocked - Whether the quest is still locked.
 */
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

/**
 * Iterate over parsed quests and pick the first unlocked, executable quest.
 *
 * Skips locked quests and dispatches the first supported type to its handler:
 *  - "Say 'owo'" -> {@link questOwO}
 *  - "Gamble" -> {@link questGamble} (only when the bot is NOT already gambling)
 *  - "Use an action command on someone" -> {@link questActionOther}
 * Unsupported quests are skipped. On a match it records the active quest in
 * global state and returns; if none match, it records "No active quest found".
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.gamble` and writes `global.quest`.
 * @param {TextChannel} channel - The quest commands channel.
 * @param {Array<Object>} quests - Parsed quest objects from {@link parseQuests}.
 * @returns {Promise<void>} Resolves once a quest is started or marked unavailable.
 */
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

/**
 * Generic quest execution loop.
 *
 * Repeatedly sends the quest command (built by `opts.build`) until progress
 * reaches the target, then re-fetches the quest log after a delay. Supports a
 * fixed or randomized per-action delay (`useGetRand`), an optional pre-loop
 * delay, and a progress offset (`loopMinus`) for quests whose counter semantics
 * differ (e.g. "say owo" counts in batches). On send error the progress is
 * rolled back by one and retried.
 *
 * @param {Client} client - The Discord client instance; updates `global.quest.progress`.
 * @param {TextChannel} channel - The quest commands channel.
 * @param {Object} quest - The parsed quest object; `pro1`/`pro2` are mutated as progress is made.
 * @param {Object} opts - Loop configuration.
 * @param {number} [opts.delay=16000] - Base delay (ms) between actions when not using random delays.
 * @param {number} [opts.delayBefore] - Optional delay (ms) before the first action.
 * @param {number} [opts.loopMinus] - Offset subtracted from `pro1` when evaluating completion (target = pro1 + loopMinus < pro2).
 * @param {boolean} [opts.useGetRand] - Use a randomized 12–16s delay instead of the fixed `delay`.
 * @param {(client: Client, cr: typeof commandrandomizer) => string} opts.build - Returns the command string to send (receives client and the command randomizer).
 * @returns {Promise<void>} Resolves when the quest target is reached and the re-fetch timer is set.
 */
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

/**
 * Run the "Say 'owo'" quest until its target is reached.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The quest commands channel.
 * @param {Object} quest - The parsed quest object.
 * @returns {Promise<void>} Resolves when the quest target is reached.
 */
async function questOwO(client, channel, quest) {
    await questLoop(client, channel, quest, {
        build: () => commandrandomizer(["owo", "Owo", "owO", "OwO"]),
        loopMinus: -10,
        useGetRand: true,
    });
}

/**
 * Run the "Gamble" quest until its target is reached.
 *
 * Sends randomized coinflip commands (e.g. `owo cf head`). Only invoked when
 * the bot is not already running the gamble module (see {@link selectQuest}).
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The quest commands channel.
 * @param {Object} quest - The parsed quest object.
 * @returns {Promise<void>} Resolves when the quest target is reached.
 */
async function questGamble(client, channel, quest) {
    await questLoop(client, channel, quest, {
        build: (_c, cr) =>
            `${cr(["owo", "Owo", "owO", "OwO"])} ${cr(["cf", "coinflip"])} ${cr(["head", "h", "t", "tail"])}`,
        useGetRand: true,
    });
}

/**
 * Run the "Use an action command on someone" quest until its target is reached.
 *
 * Sends randomized social action commands (cuddle, hug, kiss, ...) targeted at
 * OwO's official bot user id.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The quest commands channel.
 * @param {Object} quest - The parsed quest object.
 * @returns {Promise<void>} Resolves when the quest target is reached.
 */
async function questActionOther(client, channel, quest) {
    await questLoop(client, channel, quest, {
        build: (_c, cr) =>
            `${cr(["owo", "Owo", "owO", "OwO"])} ${cr(["cuddle", "hug", "kiss", "lick", "nom", "pat", "poke", "slap", "bite", "punch", "wave", "snuggle", "highfive"])} <@${OWO_ID}>`,
        useGetRand: true,
    });
}

module.exports.parseQuests = parseQuests;
