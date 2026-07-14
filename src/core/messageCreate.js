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
 * Determine whether a captcha message contains a web link requiring
 * automated browser solving.
 *
 * @param {string} msgcontent - Lowercased message content.
 * @param {?Object} helloChristopher - Optional button component linking to owobot.com.
 * @param {?string} canulickmymonster - Optional URL containing owobot.com.
 * @returns {boolean} True if the message appears to be a web captcha.
 */
function isWebCaptchaMessage(msgcontent, helloChristopher, canulickmymonster) {
    const suspiciousPhrases = [".com", "please use the link"];
    const hasSuspiciousContent = suspiciousPhrases.some((phrase) =>
        msgcontent.includes(phrase),
    );
    return hasSuspiciousContent || helloChristopher || canulickmymonster;
}

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
    const showDesktop =
        !ctx.config.settings.captcha.autosolve ||
        ctx.config.settings.captcha.alerttype.desktop.force;

    if (
        showDesktop &&
        ctx.config.settings.captcha.alerttype.desktop.notification
    ) {
        require("../modules/captchaNotify.js")(ctx);
    }
    if (showDesktop && ctx.config.settings.captcha.alerttype.desktop.prompt) {
        const promptmessage = `Captcha detected! Solve the captcha and type ${ctx.prefix()}resume in farm channel`;
        const psCommands = [
            "Add-Type -AssemblyName PresentationFramework",
            "[System.Windows.MessageBox]::" +
                `Show('${promptmessage}', 'OwO Farm Bot Stable', 'OK', 'Warning')`,
        ];
        ctx.childprocess.exec(
            `powershell.exe -ExecutionPolicy Bypass -Command "${psCommands.join("; ")}"`,
        );
    }
}

/**
 * Send a Discord webhook alert when a captcha is detected.
 * Skipped if auto-solve is enabled or webhook URL is not configured.
 */
function sendWebhookNotification(ctx) {
    if (ctx.config.settings.captcha.autosolve) return;
    const webhookurl = ctx.config.settings.captcha.alerttype.webhookurl;
    if (
        !ctx.config.settings.captcha.alerttype.webhook ||
        !(webhookurl?.length > 10)
    )
        return;

    const { WebhookClient } = require("discord.js-selfbot-v13");
    const webhookClient = new WebhookClient({
        url: ctx.config.settings.captcha.alerttype.webhookurl,
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
 * Launch automated Chromium browser instances to solve the captcha.
 *
 * Spawns `src/core/captcha.js` for each configured thread, with
 * a 3s stagger between spawns.
 */
async function launchAutoSolve(ctx) {
    if (process.platform === "android") {
        ctx.logger.warn("Bot", "Captcha", "Unsupported platform!");
        return;
    }

    let spawnthread = ctx.config.settings.captcha.autosolve_thread;
    if (Number.isNaN(spawnthread) || spawnthread < 1) {
        spawnthread = 1;
    }
    ctx.logger.info(
        "Bot",
        "Captcha",
        `Opening automated Chromium browser... Thread Count: ${spawnthread}`,
    );

    for (let spawncount = 0; spawncount < spawnthread; spawncount++) {
        // Pass the token via the OwoToken env var (not argv) so it never
        // appears in the worker's command line, which is visible via `ps`.
        ctx.childprocess.spawn(
            "node",
            ["./core/captcha.js", `--userid=${ctx.client.user.id}`],
            { env: { ...process.env, OwoToken: ctx.basic.token } },
        );
        await ctx.delay(3000);
    }
}

/**
 * Handle a newly received OwO message that may contain a captcha.
 *
 * Validates the message is from OwO in a monitored channel and
 * contains captcha-related phrases before triggering alerts and
 * optional auto-solve.
 */
async function handleCaptchaDetection(ctx, message, msgcontent) {
    // Only react to captchas inside channels we actively farm in (commands,
    // huntbot, gamble, quest, and the OwO DM channel).
    const CHANNEL_IDS = [
        ctx.basic.commandschannelid,
        ctx.basic.huntbotchannelid,
        ctx.basic.gamblechannelid,
        ctx.basic.autoquestchannelid,
        ctx.basic.owodmchannelid,
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

    let helloChristopher, canulickmymonster;
    if (message.components.length > 0 && message.components[0].components[0]) {
        // OwO sometimes embeds a button whose URL points at owobot.com.
        // helloChristopher: a button whose exact URL is "owobot.com".
        // canulickmymonster: the first button whose URL merely contains it.
        helloChristopher = message.components[0].components.find(
            (button) => button.url?.toLowerCase() === "owobot.com",
        );
        canulickmymonster = message.components[0].components[0].url
            ?.toLowerCase()
            .includes("owobot.com");
    }

    // Always notify the user; auto-solve (below) is optional.
    sendDesktopNotifications(ctx);
    sendWebhookNotification(ctx);

    // Only auto-solve when enabled AND the message links to a web captcha.
    if (
        ctx.config.settings.captcha.autosolve &&
        isWebCaptchaMessage(msgcontent, helloChristopher, canulickmymonster)
    ) {
        await launchAutoSolve(ctx);
    }
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
    if (message.author.id !== ctx.basic.userid) return;
    cmd.run(ctx, message, args);
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

module.exports.isWebCaptchaMessage = isWebCaptchaMessage;
module.exports.escapeRegex = escapeRegex;
module.exports.handleCaptchaDetection = handleCaptchaDetection;
module.exports.handleCaptchaSolved = handleCaptchaSolved;
module.exports.handleCommand = handleCommand;
