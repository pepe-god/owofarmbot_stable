const fs = require("node:fs");
const path = require("node:path");
const CHANNEL_IDS = [
    "1099453684691243098",
    "1168797748343099444",
    "1168797827464429618",
];
const OWO_ID = "408785106942164992";

function getEnteredList(enteredGiveaways, userId) {
    if (!enteredGiveaways[userId]) {
        enteredGiveaways[userId] = [];
    }
    return enteredGiveaways[userId];
}

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

async function pressButtonsSequentially(client, enteredGiveaways, buttonQueue) {
    const myEntered = getEnteredList(enteredGiveaways, client.user.id);
    for (const { customId, message } of buttonQueue) {
        try {
            client.logger.info(
                "Farm",
                "Auto Join Giveaways",
                "Joining the giveaway...",
            );
            await message.clickButton(customId);
            client.logger.info(
                "Farm",
                "Auto Join Giveaways",
                "Successfully joined the giveaway.",
            );
            client.global.total.giveaway++;
            myEntered.push(message.id);
            await client.delay(15000);
        } catch (error) {
            client.logger.alert(
                "Farm",
                "Auto Join Giveaways",
                `Error joining giveaway: ${error}`,
            );
        }
    }
}

function saveEnteredGiveaways(enteredGiveaways, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(enteredGiveaways, null, 2));
}

module.exports = async (client) => {
    let ENTERED_GIVEAWAYS_FILE = path.join(
        __dirname,
        "../../../data/enteredGiveaways.json",
    );
    if (client.global.devmod) {
        ENTERED_GIVEAWAYS_FILE = path.join(
            __dirname,
            "../../../developer/enteredGiveaways.json",
        );
    }

    let enteredGiveaways = {};
    if (fs.existsSync(ENTERED_GIVEAWAYS_FILE)) {
        enteredGiveaways = JSON.parse(fs.readFileSync(ENTERED_GIVEAWAYS_FILE));
    }

    const guild = client.guilds.cache.get("420104212895105044");
    if (!guild) {
        return client.logger.alert(
            "Farm",
            "Auto Join Giveaways",
            "Guild (420104212895105044) not found.",
        );
    }

    for (const channelId of CHANNEL_IDS) {
        const channel = guild.channels.cache.get(channelId);
        if (channel?.type !== "GUILD_TEXT") {
            client.logger.alert(
                "Farm",
                "Auto Join Giveaways",
                `Channel (${channelId}) not found or is not a text channel.`,
            );
            continue;
        }
        client.logger.info(
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
                            client.user.id,
                        ),
                    );
                });

                if (buttonQueue.length > 0) {
                    client.logger.info(
                        "Farm",
                        "Auto Join Giveaways",
                        `${buttonQueue.length} active and not joined giveaway queued.`,
                    );
                    await pressButtonsSequentially(
                        client,
                        enteredGiveaways,
                        buttonQueue,
                    );
                } else {
                    client.logger.warn(
                        "Farm",
                        "Auto Join Giveaways",
                        `You have joined all the giveaways in the channel ${channel.name}`,
                    );
                }
            } else {
                client.logger.warn(
                    "Farm",
                    "Auto Join Giveaways",
                    "No giveaways found.",
                );
            }
        } catch (error) {
            client.logger.alert(
                "Farm",
                "Auto Join Giveaways",
                `Error retrieving giveaway messages from ${channel.name}: ${error}`,
            );
        }
    }
    saveEnteredGiveaways(enteredGiveaways, ENTERED_GIVEAWAYS_FILE);

    client.on("messageCreate", async (message) => {
        if (
            !CHANNEL_IDS.includes(message.channel.id) ||
            message.author.id !== OWO_ID ||
            message.embeds.length === 0
        )
            return;

        const buttons = findActiveButtons(
            message,
            enteredGiveaways,
            client.user.id,
        );
        if (buttons.length > 0) {
            client.logger.info(
                "Farm",
                "Auto Join Giveaways",
                `New giveaway detected in ${message.channel.name}, joining...`,
            );
            await pressButtonsSequentially(client, enteredGiveaways, buttons);
            saveEnteredGiveaways(enteredGiveaways, ENTERED_GIVEAWAYS_FILE);
        }
    });
};
