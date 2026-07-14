const { commandrandomizer } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");

/**
 * Huntbot module entry point — checks/starts the huntbot.
 *
 * Resolves the target channel (the dedicated huntbot channel, or the main
 * command channel as a fallback when none is configured), then fetches the
 * current huntbot status to decide whether to start a new hunt or wait.
 *
 * @param {Client} client - The Discord client instance; reads `basic.huntbotchannelid` / `commandschannelid`.
 * @returns {void} Delegates to {@link checkHuntbot}; does not return a value.
 */
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

/**
 * Re-run the huntbot status check after a delay.
 *
 * Used to poll back later once an in-progress hunt expires or when a previous
 * attempt failed to locate OwO's response.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The huntbot commands channel.
 * @param {number} [delay=61000] - Milliseconds to wait before retrying.
 * @returns {void} Schedules {@link checkHuntbot}; does not return a value.
 */
function scheduleRetry(client, channel, delay = 61000) {
    client.loops.schedule(
        () => {
            checkHuntbot(client, channel);
        },
        delay,
        "huntbot:retry",
    );
}

/**
 * Extract huntbot status fields from the embed.
 *
 * Parses the `!huntbot` embed description fields into a structured status:
 * whether a hunt is active (and its remaining recall time), the configured max
 * hunt duration, and whether any animal essence is available.
 *
 * @param {Client} client - The Discord client instance (uses `globalutil.parseDuration`).
 * @param {Array<Object>} fields - The embed `fields` array from OwO's huntbot reply.
 * @returns {Object} Parsed huntbot state:
 * @returns {boolean} return.isHunting - True when a hunt is currently running.
 * @returns {number} return.recalltime - Milliseconds until the current hunt ends (+5s slack); 0 when not hunting.
 * @returns {?string} return.maxtime - Configured max hunt duration in hours (e.g. `"12"`), or null if unknown.
 * @returns {boolean} return.essence - True when animal essence is available to spend.
 */
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

/**
 * Fetch the huntbot status and decide whether to start a new hunt or wait.
 *
 * Sends `!huntbot`, waits for OwO's status reply, and parses it. When a hunt is
 * already running it schedules a retry for the remaining duration; otherwise it
 * triggers a new hunt. If essence is available it also queues a trait upgrade.
 * Missing replies or embeds fall back to conservative retry/start behavior.
 *
 * @param {Client} client - The Discord client instance; carries huntbot temp state.
 * @param {TextChannel} channel - The huntbot commands channel.
 * @returns {Promise<void>} Resolves once the status is handled and the next step is scheduled.
 */
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
        client.loops.schedule(
            () => {
                triggerHB(client, channel);
            },
            6100,
            "huntbot:trigger",
        );
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
            client.loops.schedule(
                () => {
                    triggerHB(client, channel);
                },
                6100,
                "huntbot:trigger",
            );
        }
    }

    if (client.global.temp.huntbot.essence) {
        await client.delay(6100);
        await upgradeHuntbot(client, channel);
    }
}

/**
 * Activate a huntbot hunt: send the command, solve the captcha, confirm start.
 *
 * Sends an `autohunt`/`huntbot` command for the configured duration, waits for
 * OwO's captcha image, solves it via the bundled solver, then submits the
 * solution. On a valid "YOU SPENT" confirmation it records the next recall time
 * and schedules a retry; otherwise it retries after a short or long delay
 * depending on what failed.
 *
 * @param {Client} client - The Discord client instance; carries huntbot temp state and uses the captcha solver.
 * @param {TextChannel} channel - The huntbot commands channel.
 * @returns {Promise<void>} Resolves once the hunt is started or a retry is scheduled.
 */
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

/**
 * Upgrade huntbot traits if the upgrade feature is enabled in config.
 *
 * When `commands.huntbot.upgrade` is true, sends an `upgrade <type> all`
 * command for the configured trait type to spend accumulated animal essence.
 *
 * @param {Client} client - The Discord client instance; reads `basic.commands.huntbot.upgrade` and `upgradetype`.
 * @param {TextChannel} channel - The huntbot commands channel.
 * @returns {Promise<void>} Resolves after the upgrade command is sent (or immediately when disabled).
 */
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
