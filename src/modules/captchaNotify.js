/**
 * Raise a blocking desktop notification prompting the user to solve the captcha and `resume`.
 * @param {Object} ctx - The bot context; provides notifier and prefix.
 * @returns {void}
 */
function notifyToast(ctx) {
    ctx.notifier.notify({
        title: "Captcha Detected!",
        message: `Solve the captcha and type ${ctx.prefix()}resume in farm channel`,
        sound: true,
        wait: true,
        appID: "OwO Farm Bot Stable",
    });
}

/**
 * Raise a Windows MessageBox prompt (via PowerShell) telling the user to solve the captcha.
 * @param {Object} ctx - The bot context; provides child_process and prefix.
 * @returns {void}
 */
function notifyPrompt(ctx) {
    const promptmessage = `Captcha detected! Solve the captcha and type ${ctx.prefix()}resume in farm channel`;
    // Escape single quotes for PowerShell single-quoted string context (user-controlled prefix — never shell-interpolated).
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

/**
 * Send a Discord webhook alert when a captcha is detected; skipped if webhook URL is not configured/valid.
 * @param {Object} ctx - The bot context.
 * @returns {void}
 */
function notifyWebhook(ctx) {
    const webhookurl = ctx.config.settings.captcha.alerttype.webhookurl;
    if (
        !ctx.config.settings.captcha.alerttype.webhook ||
        !(webhookurl?.length > 10) ||
        !webhookurl.startsWith("https://discord.com/api/webhooks/")
    )
        return;

    const { WebhookClient } = require("discord.js-selfbot-v13");
    const webhookClient = new WebhookClient({ url: webhookurl });
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
 * Dispatch all configured captcha notifications (desktop toast, prompt, webhook).
 * @param {Object} ctx - The bot context.
 * @returns {void}
 */
function notifyCaptcha(ctx) {
    if (ctx.config.settings.captcha.alerttype.desktop.notification) {
        notifyToast(ctx);
    }
    if (ctx.config.settings.captcha.alerttype.desktop.prompt) {
        notifyPrompt(ctx);
    }
    notifyWebhook(ctx);
}

module.exports = notifyCaptcha;
