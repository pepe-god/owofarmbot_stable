const { OWO_ID } = require("./constants.js");
const { escapeRegex } = require("./globalutil.js");
const notifyCaptcha = require("../modules/captchaNotify.js");

const CAPTCHA_PHRASES = [
    "please complete your captcha",
    "verify that you are human",
    "are you a real human",
    "it may result in a ban",
    "please complete this within 10 minutes",
    "please use the link below so i can check",
    "captcha",
];

/**
 * Handle a newly received OwO message that may contain a captcha; validates source/channel/phrase before triggering alerts.
 */
async function handleCaptchaDetection(ctx, message, msgcontent) {
    // Only react to captchas inside channels we actively farm in (commands channel and the OwO DM channel).
    const CHANNEL_IDS = [
        ctx.config.main.commandschannelid,
        ctx.config.main.owodmchannelid,
    ];

    // Ignore any message not sent in one of the monitored channels.
    if (!CHANNEL_IDS.includes(message.channel.id)) return;
    // OwO must have pinged us directly; otherwise it's not a captcha prompt.
    if (!message.content.toLowerCase().includes(`<@${ctx.client.user.id}>`))
        return;
    // Don't re-trigger alerts if a captcha is already being handled.
    if (ctx.global.captchadetected) return;
    // Final gate: the message text must contain a known captcha phrase.
    if (!CAPTCHA_PHRASES.some((p) => msgcontent.includes(p))) return;

    // Stop all farming loops and flag the captcha so waitWhileBusy() blocks.
    ctx.state.captcha();
    // Count it for the runtime stats display.
    ctx.global.total.captcha++;
    ctx.logger.alert("Bot", "Captcha", "Captcha Detected!");
    ctx.logger.info(
        "Bot",
        "Captcha",
        `Total Captcha: ${ctx.global.total.captcha}`,
    );
    ctx.logger.warn("Bot", "Captcha", `Bot Paused: ${ctx.global.paused}`);

    // Notify the user via desktop toast/webhook/prompt.
    notifyCaptcha(ctx);
}

/**
 * Handle a captcha solved notification (DM from OwO); resets the flag and resumes if autoresume is enabled.
 */
function handleCaptchaSolved(ctx, message, msgcontent) {
    if (
        !msgcontent.includes("i have verified") ||
        message.channel.type !== "DM"
    )
        return;

    ctx.global.total.solvedcaptcha++;
    if (ctx.config.settings.autoresume) {
        ctx.state.captchaSolved(true);
        ctx.logger.warn(
            "Bot",
            "Captcha",
            "Captcha solved. Resuming bot automatically...",
        );
    } else {
        ctx.state.captchaSolved(false);
        ctx.logger.warn(
            "Bot",
            "Captcha",
            `Captcha Solved, please resume by using the command "${ctx.prefix()}resume" to resume`,
        );
    }
}

/**
 * Parse and dispatch a user command message; strips prefix/mention, looks up the command, and runs it if the author is the configured owner.
 */
function handleCommand(ctx, message) {
    const PREFIX = ctx.prefix();
    // Accept either a mention of the bot OR the configured prefix, then any amount of whitespace, as the command trigger.
    const prefixRegex = new RegExp(
        `^(<@!?${ctx.client.user.id}>|${escapeRegex(PREFIX)})\\s*`,
    );
    if (!prefixRegex.test(message.content)) return;

    // Strip the prefix off so we can read the command name + arguments.
    const [matchedPrefix] = message.content.match(prefixRegex);
    const args = message.content
        .slice(matchedPrefix.length)
        .trim()
        .split(/ +/g);
    // First token after the prefix is the command; the rest are arguments.
    const command = args.shift().toLowerCase();
    // Look up by exact name, falling back to an alias mapping.
    const cmd =
        ctx.client.commands.get(command) ||
        ctx.client.commands.get(ctx.client.aliases.get(command));

    // Unknown command -> ignore. Security gate: only the configured owner user ID may run admin commands.
    if (!cmd) return;
    if (message.author.id !== ctx.config.main.userid) return;
    try {
        cmd.run(ctx, message, args);
    } catch (err) {
        ctx.logger.alert(
            "Bot",
            "Command",
            `Error executing command: ${err.message}`,
        );
    }
}

/**
 * Main message event handler: routes OwO messages to captcha detection/solved, then dispatches user commands.
 */
module.exports = async (ctx, message) => {
    // 408785106942164992 is OwO's official bot ID. Only its messages can contain captcha prompts or "solved" confirmations.
    if (message.author.id === OWO_ID) {
        const msgcontent = ctx.globalutil.removeInvisibleChars(
            message.content.toLowerCase(),
        );
        handleCaptchaDetection(ctx, message, msgcontent);
        handleCaptchaSolved(ctx, message, msgcontent);
    }
    handleCommand(ctx, message);
};
