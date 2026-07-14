const { commandrandomizer, getrand } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");

/**
 * Game-specific configuration maps for coinflip and slot logic.
 * Each entry defines command construction, win/loss detection, result parsing,
 * collector filters, and display labels for its respective game type.
 *
 * @type {Object.<"coinflip"|"slot", {
 *   cmd: (bet: number) => string,
 *   checkWin: (content: string) => boolean,
 *   checkLoss: (content: string) => boolean,
 *   isFreshResult: (oldContent: string) => boolean,
 *   parseWin: (content: string, currentBet: number) => number,
 *   collectorFilter: (content: string) => boolean,
 *   label: string
 * }>}
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
 * Gamble module entry point — starts the configured gamble loops.
 *
 * Launches the coinflip loop when enabled, and the slot loop after a 4s stagger
 * when both are enabled, so the two games do not flood the channel at once.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `commands.gamble` and `gamblechannelid`.
 * @returns {void} Kicks off {@link playGame} loops; does not return a value.
 */
module.exports = async (ctx) => {
    const channel = ctx.client.channels.cache.get(ctx.basic.gamblechannelid);

    if (ctx.basic.commands.gamble.coinflip) {
        playGame("coinflip", ctx, channel);
        if (ctx.basic.commands.gamble.slot) {
            await ctx.delay(4000);
            playGame("slot", ctx, channel);
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
 * @param {Client} ctx - The Discord ctx instance; carries the gamble tally state.
 * @param {Object} game - The merged game config including betting settings (defaultBet, maxBet, multiplier).
 * @param {string} content - The raw result message content.
 * @param {number} currentBet - The wager for this round.
 * @returns {{ newBet: number }|null} The next bet amount, or null if the result is indeterminate (neither win nor loss).
 */
function processResult(ctx, game, content, currentBet) {
    const isWin = game.checkWin(content);
    const isLoss = !isWin && game.checkLoss(content);
    if (!isWin && !isLoss) return null;

    if (isWin) {
        const won = game.parseWin(content, currentBet);
        ctx.global.gamble.cowoncywon += won;
        ctx.logger.info("Farm", game.label, `Won ${won}!`);
        return { newBet: game.defaultBet };
    }

    ctx.global.gamble.cowoncywon -= currentBet;
    ctx.logger.info("Farm", game.label, `Lost ${currentBet}!`);
    return {
        newBet: Math.min(Math.round(currentBet * game.multiplier), game.maxBet),
    };
}

/**
 * Send a bet command to the gamble channel and return the sent message ID.
 *
 * Marks the per-game attempt counter, logs the wager, and returns the Discord
 * message id so callers can match OwO's edited/reply result to this bet.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The gamble commands channel.
 * @param {Object} cfg - The game command configuration (from GAME_CONFIG), provides `cmd` and `label`.
 * @param {number} bet - The wager amount.
 * @returns {Promise<string>} The ID of the sent bet message.
 */
async function sendBet(ctx, channel, cfg, bet) {
    channel.sendTyping();
    const content = `${ctx.prefix()} ${cfg.cmd(bet)}`;
    const msg = await channel.send({ content });
    ctx.global.gamble[cfg.label.toLowerCase()]++;
    ctx.logger.info(
        "Farm",
        cfg.label,
        `Betting: ${bet}. Total time: ${ctx.global.gamble[cfg.label.toLowerCase()]}`,
    );
    return msg.id;
}

/**
 * Attach listeners to catch the game result via both message edits
 * and new message collectors. Resolves the bet state when a result
 * is detected, or cleans up after the 10s timeout.
 *
 * Listens on `messageUpdate` (OwO edits its in-place result) and on a
 * 10s message collector (OwO posts a new result line). The first
 * conclusive result updates `currentBetRef.value` to the next wager and
 * tears down the other listener. If nothing is collected, the attempt
 * counter is rolled back and a warning is logged.
 *
 * @param {Client} ctx - The Discord ctx instance (event emitter for `messageUpdate`).
 * @param {TextChannel} channel - The gamble commands channel (source of the collector).
 * @param {string} messageId - ID of the sent bet message, used to filter newer/edited results.
 * @param {Object} game - The merged game config (provides `collectorFilter`, `isFreshResult`, `check*`).
 * @param {{ value: number }} currentBetRef - Mutable reference holding the current wager; updated with the next bet.
 * @returns {void} Registers event listeners and a timeout; does not return a value.
 */
function setupResultListeners(ctx, channel, messageId, game, currentBetRef) {
    let processed = false;

    const handleResult = (content) => {
        const result = processResult(ctx, game, content, currentBetRef.value);
        if (!result) return;
        processed = true;
        currentBetRef.value = result.newBet;
        ctx.client.off("messageUpdate", onUpdate);
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
            ctx.global.gamble[game.label.toLowerCase()]--;
            ctx.logger.warn(
                "Farm",
                game.label,
                `Failed to ${game.label.toLowerCase()}!`,
            );
        }
    });

    const doublecheck = setTimeout(() => {
        ctx.client.off("messageUpdate", onUpdate);
        if (!processed) {
            collector.stop();
        }
    }, 10000);

    ctx.client.on("messageUpdate", onUpdate);
}

/**
 * Self-looping game runner for a single gamble type.
 *
 * Waits for the bot to be idle, sends a bet, attaches result listeners,
 * then schedules the next round after a randomized interval. The bet amount
 * is held in `currentBetRef` and adjusted by {@link processResult} after each
 * resolved round (martingale on loss, reset on win).
 *
 * @param {"coinflip"|"slot"} type - Which game to run.
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The gamble commands channel.
 * @returns {void} Starts the internal self-rescheduling `loop()`; does not return a value.
 */
async function playGame(type, ctx, channel) {
    const cfg = GAME_CONFIG[type];
    const settings = ctx.config.settings.gamble[type];
    const game = {
        ...cfg,
        defaultBet: settings.default_amount,
        maxBet: settings.max_amount,
        multiplier: settings.multiplier,
    };
    const currentBetRef = { value: game.defaultBet };

    async function loop() {
        await ctx.globalutil.waitWhileBusy(ctx);

        const interval = getrand(
            ctx.config.interval[type].min,
            ctx.config.interval[type].max,
        );

        try {
            const messageId = await sendBet(
                ctx,
                channel,
                cfg,
                currentBetRef.value,
            );
            setupResultListeners(ctx, channel, messageId, game, currentBetRef);
        } catch (err) {
            ctx.logger.alert(
                "Farm",
                game.label,
                `Error while ${game.label.toLowerCase()}ing: ${err}`,
            );
            ctx.logger.debug(err);
        } finally {
            ctx.loops.schedule(
                () => {
                    loop();
                },
                interval,
                `gamble:${type}`,
            );
        }
    }

    loop();
}

module.exports.processResult = processResult;
module.exports.GAME_CONFIG = GAME_CONFIG;
