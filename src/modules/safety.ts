/**
 * Safety auto-pause cycle + CAPTCHA notification dispatch.
 *
 * Subsystems:
 *  - safety: periodic pause/resume cycle to reduce bot rate
 *  - captchaNotify: desktop/webhook/prompt alerts on CAPTCHA detection
 */

import type { Ctx, CtxNotifier } from "../core/types.js";

// Safety only needs a minimal slice — keep a local alias for clarity.
type CtxSafety = Pick<Ctx, "config" | "global" | "state" | "loops" | "logger">;

/**
 * Enforces a periodic pause cycle: after `pauseafter` min runtime, pause for `pausefor` min, then resume and repeat.
 */
export function startSafety(ctx: CtxSafety) {
    const safetyInterval = ctx.config.settings.safety.pauseafter * 60 * 1000;
    const pauseDuration = ctx.config.settings.safety.pausefor * 60 * 1000;

    ctx.loops.schedule(
        () => pause(ctx, pauseDuration, safetyInterval),
        safetyInterval,
        "safety:pause",
    );
}

function pause(ctx: CtxSafety, pauseDuration: number, safetyInterval: number) {
    if (ctx.global.paused || ctx.global.captchadetected) return;
    ctx.state.pause();
    ctx.logger.warn("Bot", "Safety", "Safety paused to reduce bot rate.");
    ctx.loops.schedule(
        () => resume(ctx, pauseDuration, safetyInterval),
        pauseDuration,
        "safety:resume",
    );
}

function resume(ctx: CtxSafety, pauseDuration: number, safetyInterval: number) {
    if (ctx.global.captchadetected) {
        ctx.loops.schedule(
            () => resume(ctx, pauseDuration, safetyInterval),
            30000,
            "safety:resume",
        );
        return;
    }
    ctx.state.resume();
    ctx.logger.warn("Bot", "Safety", "Resuming after a safety pause.");
    ctx.loops.schedule(
        () => pause(ctx, pauseDuration, safetyInterval),
        safetyInterval,
        "safety:pause",
    );
}

// ─── Captcha Notify ──────────────────────────────────────────────────────

type CtxNotify = Pick<Ctx, "config" | "global" | "prefix"> & CtxNotifier;

function notifyToast(ctx: CtxNotify) {
    ctx.notifier?.notify({
        title: "Captcha Detected!",
        message: `Solve the captcha and type ${ctx.prefix()}resume in farm channel`,
        sound: true,
        wait: true,
        appID: "OwO Farm Bot Stable",
    });
}

function notifyPrompt(ctx: CtxNotify) {
    const promptmessage = `Captcha detected! Solve the captcha and type ${ctx.prefix()}resume in farm channel`;
    const escaped = promptmessage.replace(/'/g, "''");
    const psScript = [
        "Add-Type -AssemblyName PresentationFramework",
        `[System.Windows.MessageBox]::Show('${escaped}', 'OwO Farm Bot Stable', 'OK', 'Warning')`,
    ].join("; ");
    ctx.child_process?.spawn("powershell.exe", [
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        psScript,
    ]);
}

function notifyWebhook(ctx: CtxNotify) {
    const webhookurl = ctx.config.settings.captcha.alerttype.webhookurl;
    if (
        !ctx.config.settings.captcha.alerttype.webhook ||
        !(webhookurl?.length > 10) ||
        !webhookurl.startsWith("https://discord.com/api/webhooks/")
    )
        return;

    // Dynamic import of discord.js-selfbot-v13 inside the function to avoid top-level dependency issue
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
 */
export function notifyCaptcha(ctx: CtxNotify) {
    if (ctx.config.settings.captcha.alerttype.desktop.notification) {
        notifyToast(ctx);
    }
    if (ctx.config.settings.captcha.alerttype.desktop.prompt) {
        notifyPrompt(ctx);
    }
    notifyWebhook(ctx);
}
