const { commandrandomizer } = require("../utils/globalutil.js");

const OWO_ID = "408785106942164992";

module.exports = async (client) => {
    let channel;
    if (client.basic.huntbotchannelid.length <= 0) {
        client.logger.alert(
            "Bot",
            "Config",
            "Huntbot channelid is blank, using main channelid...",
        );
        channel = client.channels.cache.get(client.basic.commandschannelid);
    } else channel = client.channels.cache.get(client.basic.huntbotchannelid);

    await checkHuntbot(client, channel);
};

function scheduleRetry(client, channel, delay = 61000) {
    setTimeout(() => {
        checkHuntbot(client, channel);
    }, delay);
}

function parseHuntbotEmbed(client, fields) {
    const result = {
        isHunting: false,
        recalltime: 0,
        maxtime: null,
        essence: false,
    };

    for (const field of fields) {
        if (field.name.includes("is currently hunting")) {
            const ms = client.globalutil.parseDuration(field.value);
            if (ms > 0) result.recalltime = ms + 5000;
            result.isHunting = true;
        } else if (field.name.includes("Duration")) {
            const match = field.name.match(/(\d+(\.\d+)?)H/);
            if (match) result.maxtime = match[1];
        } else if (field.name.includes("Animal Essence")) {
            const match = field.name.match(/Animal Essence - `(\d[\d,]*)`/);
            result.essence =
                match && parseInt(match[1].replace(/,/g, ""), 10) > 0;
        }
    }

    return result;
}

async function checkHuntbot(client, channel) {
    client.logger.info("Farm", "Huntbot", "Getting huntbot...");

    const msg = await channel.send({
        content: `${client.prefix()} ${commandrandomizer(["huntbot", "hb"])}`,
    });

    const reply = await client.globalutil.waitForMessage(
        client,
        channel,
        (m) =>
            (m.content.includes("BEEP BOOP. I AM BACK WITH") ||
                m.embeds[0]?.author?.name.includes("HuntBot")) &&
            m.author.id === OWO_ID &&
            m.channel.id === channel.id &&
            m.id.localeCompare(msg.id) > 0,
    );

    if (reply == null) {
        await client.globalutil.waitWhileBusy(client);
        client.logger.alert(
            "Farm",
            "HuntBot",
            "Couldn't find huntbot message! Retry after 61 seconds.",
        );
        scheduleRetry(client, channel);
        return;
    }

    if (!reply.embeds[0]) {
        client.global.temp.huntbot.essence = true;
        client.global.temp.huntbot.maxtime =
            client.basic.commands.huntbot.maxtime;
        setTimeout(() => {
            triggerHB(client, channel);
        }, 6100);
    } else {
        const parsed = parseHuntbotEmbed(client, reply.embeds[0].fields);

        if (parsed.essence) client.global.temp.huntbot.essence = true;
        client.global.temp.huntbot.maxtime =
            parsed.maxtime ?? client.basic.commands.huntbot.maxtime;

        if (parsed.isHunting) {
            client.logger.warn(
                "Farm",
                "Huntbot",
                `Currently hunting. It will restart in ${parsed.recalltime} milliseconds`,
            );
            scheduleRetry(client, channel, parsed.recalltime);
        } else {
            setTimeout(() => {
                triggerHB(client, channel);
            }, 6100);
        }
    }

    if (client.global.temp.huntbot.essence) {
        await client.delay(6100);
        await upgradeHuntbot(client, channel);
    }
}

async function triggerHB(client, channel) {
    const msg = await channel.send({
        content: `${client.prefix()} ${commandrandomizer(["autohunt", "huntbot", "hb", "ah"])} ${client.global.temp.huntbot.maxtime}h`,
    });

    const reply = await client.globalutil.waitForMessage(
        client,
        channel,
        (m) =>
            m.content.includes("Here is your password") &&
            m.author.id === OWO_ID &&
            m.channel.id === channel.id &&
            m.id.localeCompare(msg.id) > 0,
    );

    if (reply == null) {
        client.logger.alert(
            "Farm",
            "HuntBot",
            "Couldn't find huntbot captcha message! Retry in 10 mins...",
        );
        scheduleRetry(client, channel, 601000);
        return;
    }

    const captchaImageURL = reply.attachments.first()?.url;
    if (!captchaImageURL) {
        client.logger.warn(
            "Farm",
            "Huntbot",
            "Couldn't get captcha image URL! Retry in 10 mins",
        );
        scheduleRetry(client, channel, 601000);
        return;
    }

    client.logger.info("Farm", "Huntbot", "Solving captcha...");
    const solution =
        await require("../vendor/huntbot_captcha/huntbotcaptcha.js")(
            captchaImageURL,
        );
    client.logger.info(
        "Farm",
        "Huntbot",
        "Captcha solve completed. Starting huntbot...",
    );
    await client.delay(1600);

    const result = await channel.send({
        content: `${client.prefix()} ${commandrandomizer(["autohunt", "huntbot", "hb", "ah"])} ${client.global.temp.huntbot.maxtime}h ${solution}`,
    });

    const success = await client.globalutil.waitForMessage(
        client,
        channel,
        (m) =>
            m.content.includes("YOU SPENT") &&
            m.author.id === OWO_ID &&
            m.channel.id === channel.id &&
            m.id.localeCompare(result.id) > 0,
    );

    const ms = client.globalutil.parseDuration(success.content);
    if (ms > 0) {
        client.global.temp.huntbot.recalltime = ms + 5000;
        client.global.total.huntbot++;
        client.logger.info(
            "Farm",
            "Huntbot",
            `Huntbot has started to hunt. It will restart in ${client.global.temp.huntbot.recalltime} milliseconds`,
        );
        scheduleRetry(client, channel, client.global.temp.huntbot.recalltime);
    } else {
        await client.globalutil.waitWhileBusy(client);
        client.logger.alert(
            "Farm",
            "HuntBot",
            "Couldn't find valid duration format! Retry after 61 seconds.",
        );
        scheduleRetry(client, channel);
    }
}

async function upgradeHuntbot(client, channel) {
    if (!client.basic.commands.huntbot.upgrade) return;

    await channel.send({
        content: `${client.prefix()} ${commandrandomizer(["upg", "upgrade"])} ${client.basic.commands.huntbot.upgradetype} all`,
    });

    client.logger.info(
        "Farm",
        "Huntbot",
        `Upgraded trait: ${client.basic.commands.huntbot.upgradetype}`,
    );
}
