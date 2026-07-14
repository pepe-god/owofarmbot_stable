const path = require("node:path");
const { commandrandomizer } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");

/**
 * Checklist subsystem entry point.
 *
 * Triggers an immediate checklist read via `smol()`, then starts the
 * farm module so hunting/battle continues while checklist is being processed.
 *
 * @param {Client} client - The Discord client instance.
 * @param {TextChannel} channel - The commands channel to use.
 * @returns {void} Kicks off the checklist loop and farm module; does not return a value.
 * @sideeffect Starts the self-looping checklist (`smol`) and farm module loops.
 */
module.exports = async (client, channel) => {
    smol(client, channel);
    require("../modules/farm.js")(client);
};

/**
 * Send the checklist command and wait for OwO's reply embed.
 *
 * Marks `client.global.checklist = true` (which pauses competing actions) before
 * sending, then waits up to ~11.6s for OwO's "Checklist" embed that is newer
 * than the command.
 *
 * @param {Client} client - The Discord client instance; sets `global.checklist`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<Message|null>} The checklist embed message, or null on timeout.
 * @sideeffect Sets `client.global.checklist = true` while reading the checklist.
 */
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

/**
 * Extract the next checklist refresh interval from the embed footer text.
 *
 * Parses compound durations like "Next: 1H 30M 15S" into a millisecond total.
 * Any missing component (H/M/S) defaults to 0.
 *
 * @param {string} footerText - Raw footer string (e.g. "Next: 1H 30M").
 * @returns {number} Milliseconds until the next checklist refresh (0 if unparseable).
 */
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

/**
 * Split checklist description into individual incomplete task lines.
 * Returns an empty array if the checklist shows a completion emoji.
 *
 * @param {string} description - Raw embed description text.
 * @returns {string[]} Array of incomplete task lines (each trimmed of surrounding whitespace).
 */
function getIncompleteItems(description) {
    if (description.includes("☑️ 🎉")) return [];
    return description.trim().split("\n");
}

/**
 * Claim the daily checklist reward if enabled in config.
 *
 * @param {Client} client - The Discord client instance; reads `config.settings.checklist.types.daily`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves after the daily command is sent.
 * @sideeffect Increments nothing here; sends `owo daily` and logs the claim.
 */
async function handleDaily(client, channel) {
    if (!client.config.settings.checklist.types.daily) return;
    await client.delay(3000);
    await channel.send({ content: `${client.prefix()} daily` });
    client.logger.info("Farm", "Checklist - Daily", "Daily Claimed");
    await client.delay(6000);
}

/**
 * Trigger the automated vote handler (spawns the autovote subprocess).
 *
 * Launches the bundled `autovote.js` headless Chromium voter with the bot token
 * and OwO's bot id, then increments the vote tally.
 *
 * @param {Client} client - The Discord client instance; reads `config.settings.checklist.types.vote` and `basic.token`, increments `global.total.vote`.
 * @returns {Promise<void>} Resolves immediately after spawning the child process.
 * @sideeffect Spawns a detached `node` child process (`autovote.js`) and increments `global.total.vote`.
 */
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
        path.join(__dirname, "../core/autovote.js"),
        `--token=${client.basic.token}`,
        `--bid=${OWO_ID}`,
    ]);
    client.global.total.vote++;
}

/**
 * Send a cookie command to a random guild member (or OwO if no eligible members exist).
 *
 * Picks a random non-bot, non-OwO, non-self member from the channel's guild; if
 * none exist, targets OwO's bot id. Marks `global.temp.usedcookie = true`.
 *
 * @param {Client} client - The Discord client instance; sets `global.temp.usedcookie`.
 * @param {TextChannel} channel - The commands channel (also provides the guild member list).
 * @returns {Promise<void>} Resolves after the cookie command is sent.
 * @sideeffect Sets `client.global.temp.usedcookie = true`.
 */
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

/**
 * Execute a single checklist line by matching its emoji prefix to the
 * corresponding handler (daily, vote, cookie, etc.).
 *
 * Only the first matching case runs. Incomplete tasks (⬛) require their
 * corresponding config flag; already-completed tasks (☑️) are noted/flagged but
 * take no action. Aborts immediately if a captcha is detected or the bot is paused.
 *
 * @param {Client} client - The Discord client instance; carries config, flags and handlers.
 * @param {TextChannel} channel - The commands channel.
 * @param {string} line - A single line from the checklist embed description (lowercased upstream).
 * @returns {Promise<void>} Resolves after the matched handler (if any) completes.
 * @sideeffect May send commands and mutate `client.global.temp.usedcookie`/vote tally.
 */
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

/**
 * Block until `client.global.captchadetected` becomes false, or timeout
 * after 1000 iterations (~16 minutes).
 *
 * Polls every second; on a clean exit it also clears `global.checklist` so other
 * subsystems resume. Used to hold the checklist flow while a captcha is unsolved.
 *
 * @param {Client} client - The Discord client instance; reads/sets `global.captchadetected` and `global.checklist`.
 * @returns {Promise<void>} Resolves when no captcha is detected (or the poll budget is exhausted).
 * @sideeffect Clears `client.global.checklist` when the captcha clears.
 */
async function waitWhileCaptcha(client) {
    for (let i = 0; i < 1000; i++) {
        if (client.global.captchadetected === false) {
            client.global.checklist = false;
            return;
        }
        await client.delay(1000);
    }
}

/**
 * Core checklist loop: fetch embed, parse items, execute handlers,
 * then schedule the next run based on the embed's refresh interval.
 *
 * Fetches the checklist, accumulates the next refresh interval into
 * `global.temp.intervals.checklist`, runs each incomplete line through
 * `executeChecklistLine`, then waits out any captcha and reschedules itself.
 * On error it logs, warns, and retries after 10 minutes instead.
 *
 * @param {Client} client - The Discord client instance; carries checklist state and config.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves once this iteration is done (the next run is self-scheduled).
 * @sideeffect Reschedules itself via setTimeout; sets/clears `global.checklist`; mutates `global.temp.intervals.checklist`.
 */
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
module.exports.executeChecklistLine = executeChecklistLine;
