const { OWO_ID } = require("./constants.js");

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
 * Escape special regex characters in a string so it can be used safely
 * inside a RegExp constructor.
 *
 * @param {string} str - Input string.
 * @returns {string} Regex-safe escaped string.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dispatch desktop notifications when a captcha is detected.
 *
 * Triggers system toast notifications and/or a native OS prompt
 * depending on the alert configuration.
 */
function sendDesktopNotifications(ctx) {
    if (ctx.config.settings.captcha.alerttype.desktop.notification) {
        require("../modules/captchaNotify.js")(ctx);
    }
    if (ctx.config.settings.captcha.alerttype.desktop.prompt) {
        const promptmessage = `Captcha detected! Solve the captcha and type ${ctx.prefix()}resume in farm channel`;
        // Escape single quotes for PowerShell single-quoted string context
        // (powered by a user-controlled prefix — never shell-interpolated).
        const escaped = promptmessage.replace(/'/g, "''");
        const psScript = [
            "Add-Type -AssemblyName PresentationFramework",
            `[System.Windows.MessageBox]::Show('${escaped}', 'OwO Farm Bot Stable', 'OK', 'Warning')`,
        ].join("; ");
        ctx.child_process.spawn("powershell.exe", [
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            psScript,
        ]);
    }
}

/**
 * Send a Discord webhook alert when a captcha is detected.
 * Skipped if webhook URL is not configured.
 */
function sendWebhookNotification(ctx) {
    const webhookurl = ctx.config.settings.captcha.alerttype.webhookurl;
    if (
        !ctx.config.settings.captcha.alerttype.webhook ||
        !(webhookurl?.length > 10) ||
        !webhookurl.startsWith("https://discord.com/api/webhooks/")
    )
        return;

    const { WebhookClient } = require("discord.js-selfbot-v13");
    const webhookClient = new WebhookClient({
        url: webhookurl,
    });
    let message = `#Token Type: ${ctx.global.type}\n**🚨Captcha detected!🚨 Solve the captcha**`;

    if (!ctx.config.settings.autoresume) {
        message += `and type ${ctx.prefix()}resume in farm channel`;
    }

    webhookClient.send({
        content: message,
        username: "OwO Farm Bot Stable",
    });
}

/**
 * Handle a newly received OwO message that may contain a captcha.
 *
 * Validates the message is from OwO in a monitored channel and
 * contains captcha-related phrases before triggering desktop/webhook alerts.
 */
async function handleCaptchaDetection(ctx, message, msgcontent) {
    // Only react to captchas inside channels we actively farm in
    // (commands channel and the OwO DM channel).
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

    // Notify the user via desktop toast/webhook and optionally a prompt.
    sendDesktopNotifications(ctx);
    sendWebhookNotification(ctx);
}

/**
 * Handle a captcha solved notification (DM from OwO).
 *
 * Resets the captcha flag and resumes the bot if autoresume is enabled.
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
 * Parse and dispatch a user command message.
 *
 * Strips the prefix/mention, extracts the command name and arguments,
 * looks up the registered command, and executes it if the author
 * matches the configured user ID.
 */
function handleCommand(ctx, message) {
    const PREFIX = ctx.prefix();
    // Accept either a mention of the bot OR the configured prefix, then any
    // amount of whitespace, as the command trigger.
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

    // Unknown command -> ignore. Security gate: only the configured owner
    // user ID may run admin commands.
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
 * Main message event handler.
 *
 * Every incoming message flows through this function. The routing order is:
 *  1. Captcha detection (only from OwO bot on monitored channels)
 *  2. Captcha solved notification (DM from OwO)
 *  3. User command dispatch
 */
module.exports = async (ctx, message) => {
    // 408785106942164992 is OwO's official bot ID. Only its messages can
    // contain captcha prompts or "solved" confirmations.
    if (message.author.id === OWO_ID) {
        const msgcontent = ctx.globalutil.removeInvisibleChars(
            message.content.toLowerCase(),
        );
        handleCaptchaDetection(ctx, message, msgcontent);
        handleCaptchaSolved(ctx, message, msgcontent);
    }
    handleCommand(ctx, message);
};

module.exports.escapeRegex = escapeRegex;
module.exports.handleCaptchaDetection = handleCaptchaDetection;
module.exports.handleCaptchaSolved = handleCaptchaSolved;
module.exports.handleCommand = handleCommand;
