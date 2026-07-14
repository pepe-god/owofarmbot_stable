const fs = require("node:fs");
const path = require("node:path");
const {
    OWO_ID,
    OWO_SUPPORT_GUILD_ID,
    GIVEAWAY_CHANNEL_IDS,
} = require("../core/constants.js");
const { handleModuleError } = require("../services/errors.js");

/**
 * Retrieve (or initialize) the per-user list of giveaway message IDs
 * the user has already entered.
 *
 * Ensures the persisted state object has an array for the supplied user id,
 * creating an empty one on first use, then returns it for in-place mutation.
 *
 * @param {Object.<string, string[]>} enteredGiveaways - The persisted state object keyed by user id.
 * @param {string} userId - Discord user ID.
 * @returns {string[]} The array of giveaway message IDs already entered by the user.
 */
function getEnteredList(enteredGiveaways, userId) {
    if (!enteredGiveaways[userId]) {
        enteredGiveaways[userId] = [];
    }
    return enteredGiveaways[userId];
}

/**
 * Scan a giveaway message for active buttons that the user has not
 * yet clicked.
 *
 * Iterates the message's component rows looking for enabled BUTTON components
 * whose giveaway the user has not already joined (tracked by message id), and
 * returns them as a clickable queue.
 *
 * @param {Message} message - The giveaway message to inspect.
 * @param {Object.<string, string[]>} enteredGiveaways - Persisted entered state keyed by user id.
 * @param {string} userId - Discord user ID.
 * @returns {Array<{customId: string, message: Message}>} Queue of clickable buttons with their custom id and source message.
 */
function findActiveButtons(message, enteredGiveaways, userId) {
    const myEntered = getEnteredList(enteredGiveaways, userId);
    const buttons = [];
    for (const row of message.components) {
        for (const component of row.components) {
            if (
                component.type === "BUTTON" &&
                !component.disabled &&
                !myEntered.includes(message.id)
            ) {
                buttons.push({ customId: component.customId, message });
            }
        }
    }
    return buttons;
}

/**
 * Click each queued giveaway button sequentially with a 15s delay
 * between clicks to avoid rate limits.
 *
 * For every button, logs and clicks it, increments the joined counter, records
 * the message id as entered, then waits 15s before the next click. Click
 * failures are logged but do not abort the remaining queue.
 *
 * @param {Client} ctx - The Discord ctx instance; carries `global.total.giveaway` and `delay`.
 * @param {Object.<string, string[]>} enteredGiveaways - Persisted entered state; the user's list is mutated in place.
 * @param {Array<{customId: string, message: Message}>} buttonQueue - Buttons to click, produced by {@link findActiveButtons}.
 * @returns {Promise<void>} Resolves after the whole queue has been processed (success or error per item).
 */
async function pressButtonsSequentially(ctx, enteredGiveaways, buttonQueue) {
    const myEntered = getEnteredList(enteredGiveaways, ctx.client.user.id);
    for (const { customId, message } of buttonQueue) {
        try {
            ctx.logger.info(
                "Farm",
                "Auto Join Giveaways",
                "Joining the giveaway...",
            );
            await message.clickButton(customId);
            ctx.logger.info(
                "Farm",
                "Auto Join Giveaways",
                "Successfully joined the giveaway.",
            );
            ctx.global.total.giveaway++;
            myEntered.push(message.id);
            await ctx.delay(15000);
        } catch (error) {
            handleModuleError(ctx, error, {
                type: "Farm",
                module: "Auto Join Giveaways",
                fallback: "Error joining giveaway",
            });
        }
    }
}

/**
 * Persist the entered-giveaways state to disk.
 *
 * Serializes the in-memory state to pretty-printed JSON so it survives restarts
 * and the bot does not re-join giveaways it has already entered.
 *
 * @param {Object.<string, string[]>} enteredGiveaways - The state object to persist.
 * @param {string} filePath - Absolute path of the JSON file to write.
 * @returns {void} Writes the file synchronously; does not return a value.
 */
function saveEnteredGiveaways(enteredGiveaways, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(enteredGiveaways, null, 2));
}

/**
 * Scan configured giveaway channels for active, unjoined giveaways
 * and join them.
 *
 * For each configured channel id it fetches the latest 100 messages, filters to
 * OwO giveaway posts (embeds or components), queues any active un-joined buttons,
 * and clicks them sequentially. Channels that are missing or not text channels,
 * and any fetch errors, are logged and skipped.
 *
 * @param {Client} ctx - The Discord ctx instance; provides the guild cache and logging.
 * @param {Guild} guild - The OwO support guild containing the giveaway channels.
 * @param {Object.<string, string[]>} enteredGiveaways - Persisted entered state (mutated in place as giveaways are joined).
 * @returns {Promise<void>} Resolves after all configured channels have been scanned.
 */
async function scanChannelGiveaways(ctx, guild, enteredGiveaways) {
    for (const channelId of GIVEAWAY_CHANNEL_IDS) {
        const channel = guild.channels.cache.get(channelId);
        if (channel?.type !== "GUILD_TEXT") {
            ctx.logger.alert(
                "Farm",
                "Auto Join Giveaways",
                `Channel (${channelId}) not found or is not a text channel.`,
            );
            continue;
        }
        ctx.logger.info(
            "Farm",
            "Auto Join Giveaways",
            `Searching for messages in channel ${channel.name}...`,
        );

        try {
            let fetchedMessages = await channel.messages.fetch({ limit: 100 });
            fetchedMessages = fetchedMessages.filter(
                (msg) =>
                    msg.author.id === OWO_ID &&
                    (msg.embeds.length > 0 || msg.components.length > 0),
            );

            if (fetchedMessages.size > 0) {
                const buttonQueue = [];
                fetchedMessages.forEach((msg) => {
                    buttonQueue.push(
                        ...findActiveButtons(
                            msg,
                            enteredGiveaways,
                            ctx.client.user.id,
                        ),
                    );
                });

                if (buttonQueue.length > 0) {
                    ctx.logger.info(
                        "Farm",
                        "Auto Join Giveaways",
                        `${buttonQueue.length} active and not joined giveaway queued.`,
                    );
                    await pressButtonsSequentially(
                        ctx,
                        enteredGiveaways,
                        buttonQueue,
                    );
                } else {
                    ctx.logger.warn(
                        "Farm",
                        "Auto Join Giveaways",
                        `You have joined all the giveaways in the channel ${channel.name}`,
                    );
                }
            } else {
                ctx.logger.warn(
                    "Farm",
                    "Auto Join Giveaways",
                    "No giveaways found.",
                );
            }
        } catch (error) {
            handleModuleError(ctx, error, {
                type: "Farm",
                module: "Auto Join Giveaways",
                fallback: `Error retrieving giveaway messages from ${channel.name}`,
            });
        }
    }
}

/**
 * Auto-join giveaways module entry point.
 *
 * On start, scans recent messages in configured giveaway channels and
 * joins any active giveaways. Then listens for new giveaway messages
 * in real time.
 *
 * Loads (or initializes) the persisted entered-giveaways state, verifies the
 * OwO support guild is available, performs an initial scan of recent messages,
 * persists the state, and finally subscribes to `messageCreate` so any new
 * giveaway posted in a watched channel is joined immediately.
 *
 * @param {Client} ctx - The Discord ctx instance; provides guilds, logging and `global.devmod`.
 * @returns {Promise<void>|void} Resolves after the initial scan (and registers the live listener). Logs an alert and returns early if the guild is missing.
 */
module.exports = async (ctx) => {
    let ENTERED_GIVEAWAYS_FILE = path.join(
        __dirname,
        "../../../data/enteredGiveaways.json",
    );
    if (ctx.global.devmod) {
        ENTERED_GIVEAWAYS_FILE = path.join(
            __dirname,
            "../../../developer/enteredGiveaways.json",
        );
    }

    let enteredGiveaways = {};
    if (fs.existsSync(ENTERED_GIVEAWAYS_FILE)) {
        enteredGiveaways = JSON.parse(fs.readFileSync(ENTERED_GIVEAWAYS_FILE));
    }

    const guild = ctx.client.guilds.cache.get(OWO_SUPPORT_GUILD_ID);
    if (!guild) {
        return ctx.logger.alert(
            "Farm",
            "Auto Join Giveaways",
            `Guild (${OWO_SUPPORT_GUILD_ID}) not found.`,
        );
    }

    await scanChannelGiveaways(ctx, guild, enteredGiveaways);
    saveEnteredGiveaways(enteredGiveaways, ENTERED_GIVEAWAYS_FILE);

    ctx.client.on("messageCreate", async (message) => {
        if (
            !GIVEAWAY_CHANNEL_IDS.includes(message.channel.id) ||
            message.author.id !== OWO_ID ||
            message.embeds.length === 0
        )
            return;

        const buttons = findActiveButtons(
            message,
            enteredGiveaways,
            ctx.client.user.id,
        );
        if (buttons.length > 0) {
            ctx.logger.info(
                "Farm",
                "Auto Join Giveaways",
                `New giveaway detected in ${message.channel.name}, joining...`,
            );
            await pressButtonsSequentially(ctx, enteredGiveaways, buttons);
            saveEnteredGiveaways(enteredGiveaways, ENTERED_GIVEAWAYS_FILE);
        }
    });
};
