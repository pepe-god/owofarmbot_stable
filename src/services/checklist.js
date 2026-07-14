const path = require("node:path");
const { commandrandomizer } = require("../core/globalutil.js");
const { OWO_ID } = require("../core/constants.js");
const {
    handleModuleError,
    RateLimitError,
    nextRateLimitDelay,
    resetRateLimitBackoff,
} = require("../services/errors.js");

/**
 * Checklist subsystem entry point.
 *
 * Triggers an immediate checklist read via `smol()`, then starts the
 * farm module so hunting/battle continues while checklist is being processed.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The commands channel to use.
 * @returns {void} Kicks off the checklist loop and farm module; does not return a value.
 * @sideeffect Starts the self-looping checklist (`smol`) and farm module loops.
 */
module.exports = async (ctx, channel) => {
    smol(ctx, channel);
    require("../modules/farm.js")(ctx);
};

/**
 * Send the checklist command and wait for OwO's reply embed.
 *
 * Marks `ctx.global.checklist = true` (which pauses competing actions) before
 * sending, then waits up to ~11.6s for OwO's "Checklist" embed that is newer
 * than the command.
 *
 * @param {Client} ctx - The Discord ctx instance; sets `global.checklist`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<Message|null>} The checklist embed message, or null on timeout.
 * @sideeffect Sets `ctx.global.checklist = true` while reading the checklist.
 */
async function fetchChecklistEmbed(ctx, channel) {
    const msg = await channel.send({
        content: `${ctx.prefix()} ${commandrandomizer(["cl", "checklist"])}`,
    });
    ctx.state.startChecklist();
    ctx.logger.info("Farm", "Checklist", "Paused: true! Reading checklist");

    return await ctx.globalutil.waitForMessage(
        ctx,
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
 * @param {Client} ctx - The Discord ctx instance; reads `config.settings.checklist.types.daily`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves after the daily command is sent.
 * @sideeffect Increments nothing here; sends `owo daily` and logs the claim.
 */
async function handleDaily(ctx, channel) {
    if (!ctx.config.settings.checklist.types.daily) return;
    await ctx.delay(3000);
    await channel.send({ content: `${ctx.prefix()} daily` });
    ctx.logger.info("Farm", "Checklist - Daily", "Daily Claimed");
    await ctx.delay(6000);
}

/**
 * Trigger the automated vote handler (spawns the autovote subprocess).
 *
 * Launches the bundled `autovote.js` headless Chromium voter with the bot token
 * and OwO's bot id, then increments the vote tally.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `config.settings.checklist.types.vote` and `basic.token`, increments `global.total.vote`.
 * @returns {Promise<void>} Resolves immediately after spawning the child process.
 * @sideeffect Spawns a detached `node` child process (`autovote.js`) and increments `global.total.vote`.
 */
async function handleVote(ctx) {
    if (!ctx.config.settings.checklist.types.vote) return;
    ctx.logger.info(
        "Farm",
        "Checklist - Vote",
        `Platform: ${process.platform}`,
    );
    ctx.logger.info(
        "Bot",
        "Checklist - Vote",
        "Opening automated chromium browser...",
    );
    ctx.childprocess.spawn("node", [
        path.join(__dirname, "../core/autovote.js"),
        `--token=${ctx.basic.token}`,
        `--bid=${OWO_ID}`,
    ]);
    ctx.global.total.vote++;
}

/**
 * Send a cookie command to a random guild member (or OwO if no eligible members exist).
 *
 * Picks a random non-bot, non-OwO, non-self member from the channel's guild; if
 * none exist, targets OwO's bot id. Marks `global.temp.usedcookie = true`.
 *
 * @param {Client} ctx - The Discord ctx instance; sets `global.temp.usedcookie`.
 * @param {TextChannel} channel - The commands channel (also provides the guild member list).
 * @returns {Promise<void>} Resolves after the cookie command is sent.
 * @sideeffect Sets `ctx.global.temp.usedcookie = true`.
 */
async function handleCookie(ctx, channel) {
    if (!ctx.config.settings.checklist.types.cookie) return;
    await ctx.delay(3000);
    const members = channel.guild.members.cache
        .filter(
            (member) =>
                !member.user.bot &&
                member.id !== OWO_ID &&
                member.id !== ctx.client.user.id,
        )
        .map((member) => member.user);
    const selectedmemberid =
        members.length === 0
            ? OWO_ID
            : members[Math.floor(Math.random() * members.length)].id;
    await channel.send({
        content: `${ctx.prefix()} cookie <@${selectedmemberid}>`,
    });
    ctx.global.temp.usedcookie = true;
    ctx.logger.info("Farm", "Checklist - Cookie", "Cookie sent");
    await ctx.delay(3000);
}

/**
 * Execute a single checklist line by matching its emoji prefix to the
 * corresponding handler (daily, vote, cookie, etc.).
 *
 * Only the first matching case runs. Incomplete tasks (⬛) require their
 * corresponding config flag; already-completed tasks (☑️) are noted/flagged but
 * take no action. Aborts immediately if a captcha is detected or the bot is paused.
 *
 * @param {Client} ctx - The Discord ctx instance; carries config, flags and handlers.
 * @param {TextChannel} channel - The commands channel.
 * @param {string} line - A single line from the checklist embed description (lowercased upstream).
 * @returns {Promise<void>} Resolves after the matched handler (if any) completes.
 * @sideeffect May send commands and mutate `ctx.global.temp.usedcookie`/vote tally.
 */
async function executeChecklistLine(ctx, channel, line) {
    if (ctx.global.captchadetected || ctx.global.paused) return;

    switch (true) {
        case line.startsWith("⬛ 🎁") &&
            ctx.config.settings.checklist.types.daily:
            await handleDaily(ctx, channel);
            break;
        case line.startsWith("⬛ 📝") &&
            ctx.config.settings.checklist.types.vote:
            await handleVote(ctx);
            break;
        case line.startsWith("⬛ 🍪") &&
            ctx.config.settings.checklist.types.cookie:
            await handleCookie(ctx, channel);
            break;
        case line.startsWith("️☑️ 🍪"):
            ctx.global.temp.usedcookie = true;
            break;
        case line.startsWith("☑️ 💎"):
            ctx.logger.info("Farm", "Checklist", "Daily lootbox completed");
            break;
        case line.startsWith("☑️ ⚔"):
            ctx.logger.info("Farm", "Checklist", "Daily crate completed");
            break;
    }
}

/**
 * Block until `ctx.global.captchadetected` becomes false, or timeout
 * after 1000 iterations (~16 minutes).
 *
 * Polls every second; on a clean exit it also clears `global.checklist` so other
 * subsystems resume. Used to hold the checklist flow while a captcha is unsolved.
 *
 * @param {Client} ctx - The Discord ctx instance; reads/sets `global.captchadetected` and `global.checklist`.
 * @returns {Promise<void>} Resolves when no captcha is detected (or the poll budget is exhausted).
 * @sideeffect Clears `ctx.global.checklist` when the captcha clears.
 */
async function waitWhileCaptcha(ctx) {
    for (let i = 0; i < 1000; i++) {
        if (ctx.global.captchadetected === false) {
            ctx.state.endChecklist();
            return;
        }
        await ctx.delay(1000);
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
 * @param {Client} ctx - The Discord ctx instance; carries checklist state and config.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves once this iteration is done (the next run is self-scheduled).
 * @sideeffect Reschedules itself via setTimeout; sets/clears `global.checklist`; mutates `global.temp.intervals.checklist`.
 */
async function smol(ctx, channel) {
    if (ctx.global.captchadetected || ctx.global.paused) return;
    try {
        const message = await fetchChecklistEmbed(ctx, channel);
        if (message == null) {
            ctx.state.endChecklist();
            ctx.logger.alert("Farm", "Checklist", "Cannot retrieve checklist.");
            return;
        }

        await ctx.delay(3000);
        if (ctx.global.captchadetected || ctx.global.paused) return;

        ctx.global.temp.intervals.checklist += parseChecklistInterval(
            message.embeds[0].footer.text,
        );

        const items = getIncompleteItems(
            message.embeds[0].description.toLowerCase(),
        );
        if (items.length === 0) {
            ctx.logger.info("Farm", "Checklist", "Checklist completed.");
        } else {
            for (const line of items)
                await executeChecklistLine(ctx, channel, line);
        }

        await ctx.delay(2000);
        await waitWhileCaptcha(ctx);
        ctx.logger.info("Farm", "Checklist", `Paused: ${ctx.global.checklist}`);
    } catch (e) {
        const wrapped = handleModuleError(ctx, e, {
            type: "Farm",
            module: "Checklist",
            fallback: "Error while checking checklist",
        });
        let delay = 610000;
        if (wrapped instanceof RateLimitError) {
            delay = nextRateLimitDelay(ctx, "checklist");
            ctx.logger.warn(
                "Farm",
                "Checklist",
                `Rate limited, backing off ${delay}ms before retry.`,
            );
        } else {
            resetRateLimitBackoff(ctx, "checklist");
        }
        ctx.loops.schedule(
            () => {
                smol(ctx, channel);
            },
            delay,
            "checklist:retry",
        );
        return;
    }
    ctx.loops.schedule(
        () => {
            smol(ctx, channel);
            ctx.logger.warn(
                "Farm",
                "Checklist",
                "Rechecking checklist after interval",
            );
        },
        ctx.global.temp.intervals.checklist,
        "checklist:loop",
    );
}

module.exports.parseChecklistInterval = parseChecklistInterval;
module.exports.getIncompleteItems = getIncompleteItems;
module.exports.executeChecklistLine = executeChecklistLine;
