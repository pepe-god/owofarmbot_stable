const CAPTCHA_PHRASES = [
    "please complete your captcha",
    "verify that you are human",
    "are you a real human",
    "it may result in a ban",
    "please complete this within 10 minutes",
    "please use the link below so i can check",
    "captcha",
];

function isWebCaptchaMessage(msgcontent, helloChristopher, canulickmymonster) {
    const suspiciousPhrases = [".com", "please use the link"];
    const hasSuspiciousContent = suspiciousPhrases.some((phrase) =>
        msgcontent.includes(phrase),
    );
    return hasSuspiciousContent || helloChristopher || canulickmymonster;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sendDesktopNotifications(client) {
    const showDesktop =
        !client.config.settings.captcha.autosolve ||
        client.config.settings.captcha.alerttype.desktop.force;

    if (
        showDesktop &&
        client.config.settings.captcha.alerttype.desktop.notification
    ) {
        require("../../modules/warn.js")(client);
    }
    if (
        showDesktop &&
        client.config.settings.captcha.alerttype.desktop.prompt
    ) {
        const promptmessage = `Captcha detected! Solve the captcha and type ${client.prefix()}resume in farm channel`;
        const psCommands = [
            "Add-Type -AssemblyName PresentationFramework",
            "[System.Windows.MessageBox]::" +
                `Show('${promptmessage}', 'OwO Farm Bot Stable', 'OK', 'Warning')`,
        ];
        client.childprocess.exec(
            `powershell.exe -ExecutionPolicy Bypass -Command "${psCommands.join("; ")}"`,
        );
    }
}

function sendWebhookNotification(client) {
    if (client.config.settings.captcha.autosolve) return;
    if (
        !client.config.settings.captcha.alerttype.webhook ||
        !client.config.settings.captcha.alerttype.webhookurl?.length > 10
    )
        return;

    const { WebhookClient } = require("discord.js-selfbot-v13");
    const webhookClient = new WebhookClient({
        url: client.config.settings.captcha.alerttype.webhookurl,
    });
    let message = `#Token Type: ${client.global.type}\n**🚨Captcha detected!🚨 Solve the captcha**`;

    if (!client.config.settings.autoresume) {
        message += `and type ${client.prefix()}resume in farm channel`;
    }

    webhookClient.send({
        content: `${message}\n||@everyone||`,
        username: "OwO Farm Bot Stable",
    });
}

async function launchAutoSolve(client) {
    if (process.platform === "android") {
        client.logger.warn("Bot", "Captcha", "Unsupported platform!");
        return;
    }

    let spawnthread = client.config.settings.captcha.autosolve_thread;
    if (Number.isNaN(spawnthread) || spawnthread < 1) {
        spawnthread = 1;
    }
    client.logger.info(
        "Bot",
        "Captcha",
        `Opening automated Chromium browser... Thread Count: ${spawnthread}`,
    );

    for (let spawncount = 0; spawncount < spawnthread; spawncount++) {
        client.childprocess.spawn("node", [
            "./workers/captcha.js",
            `--token=${client.basic.token}`,
            `--userid=${client.user.id}`,
        ]);
        await client.delay(3000);
    }
}

async function handleCaptchaDetection(client, message, msgcontent) {
    const CHANNEL_IDS = [
        client.basic.commandschannelid,
        client.basic.huntbotchannelid,
        client.basic.gamblechannelid,
        client.basic.autoquestchannelid,
        client.basic.owodmchannelid,
    ];

    if (!CHANNEL_IDS.includes(message.channel.id)) return;
    if (!message.content.toLowerCase().includes(`<@${client.user.id}>`)) return;
    if (client.global.captchadetected) return;
    if (!CAPTCHA_PHRASES.some((p) => msgcontent.includes(p))) return;

    client.global.paused = true;
    client.global.captchadetected = true;
    client.global.total.captcha++;
    client.logger.alert("Bot", "Captcha", "Captcha Detected!");
    client.logger.info(
        "Bot",
        "Captcha",
        `Total Captcha: ${client.global.total.captcha}`,
    );
    client.logger.warn("Bot", "Captcha", `Bot Paused: ${client.global.paused}`);

    let helloChristopher, canulickmymonster;
    if (message.components.length > 0 && message.components[0].components[0]) {
        helloChristopher = message.components[0].components.find(
            (button) => button.url?.toLowerCase() === "owobot.com",
        );
        canulickmymonster = message.components[0].components[0].url
            ?.toLowerCase()
            .includes("owobot.com");
    }

    sendDesktopNotifications(client);
    sendWebhookNotification(client);

    if (
        client.config.settings.captcha.autosolve &&
        isWebCaptchaMessage(msgcontent, helloChristopher, canulickmymonster)
    ) {
        await launchAutoSolve(client);
    }
}

function handleCaptchaSolved(client, message, msgcontent) {
    if (
        !msgcontent.includes("i have verified") ||
        message.channel.type !== "DM"
    )
        return;

    client.global.captchadetected = false;
    client.global.total.solvedcaptcha++;
    if (client.config.settings.autoresume) {
        client.global.paused = false;
        client.logger.warn(
            "Bot",
            "Captcha",
            "Captcha solved. Resuming bot automatically...",
        );
    } else {
        client.logger.warn(
            "Bot",
            "Captcha",
            `Captcha Solved, please resume by using the command "${client.prefix()}resume" to resume`,
        );
    }
}

function handleCommand(client, message) {
    const PREFIX = client.prefix();
    const prefixRegex = new RegExp(
        `^(<@!?${client.user.id}>|${escapeRegex(PREFIX)})\\s*`,
    );
    if (!prefixRegex.test(message.content)) return;

    const [matchedPrefix] = message.content.match(prefixRegex);
    const args = message.content
        .slice(matchedPrefix.length)
        .trim()
        .split(/ +/g);
    const command = args.shift().toLowerCase();
    const cmd =
        client.commands.get(command) ||
        client.commands.get(client.aliases.get(command));

    if (!cmd) return;
    if (message.author.id !== client.basic.userid) return;
    cmd.run(client, message, args);
}

module.exports = async (client, message) => {
    if (message.author.id === "408785106942164992") {
        const msgcontent = client.globalutil.removeInvisibleChars(
            message.content.toLowerCase(),
        );
        handleCaptchaDetection(client, message, msgcontent);
        handleCaptchaSolved(client, message, msgcontent);
    }
    handleCommand(client, message);
};
