const path = require("node:path");
const { commandrandomizer } = require("../utils/globalutil.js");

const OWO_ID = "408785106942164992";

module.exports = async (client, channel) => {
    smol(client, channel);
    require("../modules/farm.js")(client);
};

async function fetchChecklistEmbed(client, channel) {
    const msg = await channel.send({
        content: `${client.prefix()} ${commandrandomizer(["cl", "checklist"])}`,
    });
    client.global.checklist = true;
    client.logger.info("Farm", "Checklist", "Paused: true! Reading checklist");

    return await client.globalutil.waitForMessage(
        client,
        channel,
        (m) =>
            m.embeds[0]?.author?.name.includes("Checklist") &&
            m.author.id === OWO_ID &&
            m.channel.id === channel.id &&
            m.id.localeCompare(msg.id) > 0,
        11600,
    );
}

function parseChecklistInterval(footerText) {
    const regex = /(\d+)\s*H|(\d+)\s*M|(\d+)\s*S/g;
    const matches = [...footerText.matchAll(regex)];
    let hours = 0,
        minutes = 0,
        seconds = 0;
    for (const match of matches) {
        if (match[1]) hours = parseInt(match[1], 10);
        if (match[2]) minutes = parseInt(match[2], 10);
        if (match[3]) seconds = parseInt(match[3], 10);
    }
    return hours * 3600000 + minutes * 60000 + seconds * 1000;
}

function getIncompleteItems(description) {
    if (description.includes("☑️ 🎉")) return [];
    return description.trim().split("\n");
}

async function handleDaily(client, channel) {
    if (!client.config.settings.checklist.types.daily) return;
    await client.delay(3000);
    await channel.send({ content: `${client.prefix()} daily` });
    client.logger.info("Farm", "Checklist - Daily", "Daily Claimed");
    await client.delay(6000);
}

async function handleVote(client) {
    if (!client.config.settings.checklist.types.vote) return;
    client.logger.info(
        "Farm",
        "Checklist - Vote",
        `Platform: ${process.platform}`,
    );
    client.logger.info(
        "Bot",
        "Checklist - Vote",
        "Opening automated chromium browser...",
    );
    client.childprocess.spawn("node", [
        path.join(__dirname, "../vendor/autovote/index.js"),
        `--token=${client.basic.token}`,
        "--bid=408785106942164992",
    ]);
    client.global.total.vote++;
}

async function handleCookie(client, channel) {
    if (!client.config.settings.checklist.types.cookie) return;
    await client.delay(3000);
    const members = channel.guild.members.cache
        .filter(
            (member) =>
                !member.user.bot &&
                member.id !== OWO_ID &&
                member.id !== client.user.id,
        )
        .map((member) => member.user);
    const selectedmemberid =
        members.length === 0
            ? OWO_ID
            : members[Math.floor(Math.random() * members.length)].id;
    await channel.send({
        content: `${client.prefix()} cookie <@${selectedmemberid}>`,
    });
    client.global.temp.usedcookie = true;
    client.logger.info("Farm", "Checklist - Cookie", "Cookie sent");
    await client.delay(3000);
}

async function executeChecklistLine(client, channel, line) {
    if (client.global.captchadetected || client.global.paused) return;

    switch (true) {
        case line.startsWith("⬛ 🎁") &&
            client.config.settings.checklist.types.daily:
            await handleDaily(client, channel);
            break;
        case line.startsWith("⬛ 📝") &&
            client.config.settings.checklist.types.vote:
            await handleVote(client);
            break;
        case line.startsWith("⬛ 🍪") &&
            client.config.settings.checklist.types.cookie:
            await handleCookie(client, channel);
            break;
        case line.startsWith("️☑️ 🍪"):
            client.global.temp.usedcookie = true;
            break;
        case line.startsWith("☑️ 💎"):
            client.logger.info("Farm", "Checklist", "Daily lootbox completed");
            break;
        case line.startsWith("☑️ ⚔"):
            client.logger.info("Farm", "Checklist", "Daily crate completed");
            break;
    }
}

async function waitWhileCaptcha(client) {
    for (let i = 0; i < 1000; i++) {
        if (client.global.captchadetected === false) {
            client.global.checklist = false;
            return;
        }
        await client.delay(1000);
    }
}

async function smol(client, channel) {
    if (client.global.captchadetected || client.global.paused) return;
    try {
        const message = await fetchChecklistEmbed(client, channel);
        if (message == null) {
            client.global.checklist = false;
            client.logger.alert(
                "Farm",
                "Checklist",
                "Cannot retrieve checklist.",
            );
            return;
        }

        await client.delay(3000);
        if (client.global.captchadetected || client.global.paused) return;

        client.global.temp.intervals.checklist += parseChecklistInterval(
            message.embeds[0].footer.text,
        );

        const items = getIncompleteItems(
            message.embeds[0].description.toLowerCase(),
        );
        if (items.length === 0) {
            client.logger.info("Farm", "Checklist", "Checklist completed.");
        } else {
            for (const line of items)
                await executeChecklistLine(client, channel, line);
        }

        await client.delay(2000);
        await waitWhileCaptcha(client);
        client.logger.info(
            "Farm",
            "Checklist",
            `Paused: ${client.global.checklist}`,
        );
    } catch (e) {
        client.logger.alert(
            "Farm",
            "Checklist",
            "Error while checking checklist: ",
            e,
        );
        client.logger.warn(
            "Farm",
            "Checklist",
            "Recheck checklist after 10 minutes",
        );
        client.logger.debug(e);
        setTimeout(() => {
            smol(client, channel);
        }, 610000);
        return;
    }
    setTimeout(() => {
        smol(client, channel);
        client.logger.warn(
            "Farm",
            "Checklist",
            "Rechecking checklist after interval",
        );
    }, client.global.temp.intervals.checklist);
}

module.exports.parseChecklistInterval = parseChecklistInterval;
module.exports.getIncompleteItems = getIncompleteItems;
