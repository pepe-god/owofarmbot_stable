const { commandrandomizer, getrand } = require("../core/globalutil.js");
const OWO_ID = "408785106942164992";

/**
 * Game-specific configuration maps for coinflip and slot logic.
 * Each entry defines command construction, win/loss detection, result parsing,
 * collector filters, and display labels for its respective game type.
 */
const GAME_CONFIG = {
    coinflip: {
        cmd: (bet) =>
            `${commandrandomizer(["coinflip", "cf"])} ${commandrandomizer(["heads", "tails", "h", "t"])} ${bet}`,
        checkWin: (content) => content.includes("and you won"),
        checkLoss: (content) => content.includes("and you lost"),
        isFreshResult: (oldContent) =>
            !oldContent.includes("and you won") &&
            !oldContent.includes("and you lost"),
        parseWin: (_content, currentBet) => currentBet,
        collectorFilter: (content) => content.includes("and chose"),
        label: "Coinflip",
    },
    slot: {
        cmd: (bet) => `${commandrandomizer(["slots", "s"])} ${bet}`,
        checkWin: (content) =>
            content.includes("and won") && !content.includes("nothing..."),
        checkLoss: (content) => content.includes("and won nothing..."),
        isFreshResult: () => true,
        parseWin: (content, currentBet) => {
            const match = content.match(/and won <:\w+:\d+> (\d[\d,]*)/);
            return Number(match[1].replace(/,/g, "")) - currentBet;
        },
        collectorFilter: (content) => content.includes("SLOTS"),
        label: "Slot",
    },
};

/**
 * Gamble module entry point.
 *
 * Starts coinflip and/or slot loops depending on config.
 *
 * @param {Client} client - The Discord client instance.
 */
module.exports = async (client) => {
    const channel = client.channels.cache.get(client.basic.gamblechannelid);

    if (client.basic.commands.gamble.coinflip) {
        playGame("coinflip", client, channel);
        if (client.basic.commands.gamble.slot) {
            await client.delay(4000);
            playGame("slot", client, channel);
        }
    }
};

/**
 * Process a single game result message.
 *
 * Determines whether the gamble was a win or loss, updates counters,
 * and returns the new bet amount for the next round (martingale-style
 * on loss, reset to default on win).
 *
 * @param {Client} client - The Discord client instance.
 * @param {Object} game - The merged game config including betting settings.
 * @param {string} content - The raw result message content.
 * @param {number} currentBet - The wager for this round.
 * @returns {{ newBet: number }|null} The next bet amount, or null if indeterminate.
 */
function processResult(client, game, content, currentBet) {
    const isWin = game.checkWin(content);
    const isLoss = !isWin && game.checkLoss(content);
    if (!isWin && !isLoss) return null;

    if (isWin) {
        const won = game.parseWin(content, currentBet);
        client.global.gamble.cowoncywon += won;
        client.logger.info("Farm", game.label, `Won ${won}!`);
        return { newBet: game.defaultBet };
    }

    client.global.gamble.cowoncywon -= currentBet;
    client.logger.info("Farm", game.label, `Lost ${currentBet}!`);
    return {
        newBet: Math.min(Math.round(currentBet * game.multiplier), game.maxBet),
    };
}

/**
 * Send a bet command to the gamble channel and return the sent message ID.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The gamble commands channel.
 * @param {Object} cfg - The game command configuration.
 * @param {number} bet - The wager amount.
 * @returns {Promise<string>} The ID of the sent bet message.
 */
async function sendBet(client, channel, cfg, bet) {
    channel.sendTyping();
    const content = `${client.prefix()} ${cfg.cmd(bet)}`;
    const msg = await channel.send({ content });
    client.global.gamble[cfg.label.toLowerCase()]++;
    client.logger.info(
        "Farm",
        cfg.label,
        `Betting: ${bet}. Total time: ${client.global.gamble[cfg.label.toLowerCase()]}`,
    );
    return msg.id;
}

/**
 * Attach listeners to catch the game result via both message edits
 * and new message collectors. Resolves the bet state when a result
 * is detected, or cleans up after the 10s timeout.
 */
function setupResultListeners(client, channel, messageId, game, currentBetRef) {
    let processed = false;

    const handleResult = (content) => {
        const result = processResult(
            client,
            game,
            content,
            currentBetRef.value,
        );
        if (!result) return;
        processed = true;
        currentBetRef.value = result.newBet;
        client.off("messageUpdate", onUpdate);
        clearTimeout(doublecheck);
    };

    const onUpdate = (oldMsg, newMsg) => {
        if (
            processed ||
            newMsg.channel.id !== channel.id ||
            newMsg.author.id !== OWO_ID ||
            newMsg.id.localeCompare(messageId) < 0
        )
            return;
        if (!game.isFreshResult(oldMsg.content)) return;
        handleResult(newMsg.content);
    };

    const collector = channel.createMessageCollector({
        filter: (msg) =>
            msg.author.id === OWO_ID &&
            msg.id.localeCompare(messageId) > 0 &&
            game.collectorFilter(msg.content),
        time: 10000,
    });

    collector.on("collect", (msg) => {
        if (processed) return;
        handleResult(msg.content);
    });

    collector.on("end", (collected) => {
        if (collected.size === 0) {
            client.global.gamble[game.label.toLowerCase()]--;
            client.logger.warn(
                "Farm",
                game.label,
                `Failed to ${game.label.toLowerCase()}!`,
            );
        }
    });

    const doublecheck = setTimeout(() => {
        client.off("messageUpdate", onUpdate);
        if (!processed) {
            collector.stop();
        }
    }, 10000);

    client.on("messageUpdate", onUpdate);
}

/**
 * Self-looping game runner for a single gamble type.
 *
 * Waits for the bot to be free, sends a bet, attaches result listeners,
 * then schedules the next round after a randomized interval.
 *
 * @param {string} type - "coinflip" or "slot".
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The gamble commands channel.
 */
async function playGame(type, client, channel) {
    const cfg = GAME_CONFIG[type];
    const settings = client.config.settings.gamble[type];
    const game = {
        ...cfg,
        defaultBet: settings.default_amount,
        maxBet: settings.max_amount,
        multiplier: settings.multiplier,
    };
    const currentBetRef = { value: game.defaultBet };

    async function loop() {
        await client.globalutil.waitWhileBusy(client);

        const interval = getrand(
            client.config.interval[type].min,
            client.config.interval[type].max,
        );

        try {
            const messageId = await sendBet(
                client,
                channel,
                cfg,
                currentBetRef.value,
            );
            setupResultListeners(
                client,
                channel,
                messageId,
                game,
                currentBetRef,
            );
        } catch (err) {
            client.logger.alert(
                "Farm",
                game.label,
                `Error while ${game.label.toLowerCase()}ing: ${err}`,
            );
            client.logger.debug(err);
        } finally {
            setTimeout(() => {
                loop();
            }, interval);
        }
    }

    loop();
}

module.exports.processResult = processResult;
module.exports.GAME_CONFIG = GAME_CONFIG;
