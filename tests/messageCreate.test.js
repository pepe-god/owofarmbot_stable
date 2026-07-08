const { describe, it, mock } = require("node:test");
const assert = require("node:assert");

const messageCreate = require("../src/core/messageCreate.js");

const {
    isWebCaptchaMessage,
    escapeRegex,
    handleCaptchaDetection,
    handleCaptchaSolved,
    handleCommand,
} = messageCreate;

// --- Mock factories ---

function makeClient(overrides = {}) {
    const client = {
        config: {
            settings: {
                autoresume: false,
                captcha: {
                    autosolve: false,
                    alerttype: {
                        webhook: false,
                        webhookurl: "",
                        desktop: {
                            force: false,
                            notification: false,
                            prompt: false,
                        },
                    },
                },
            },
        },
        basic: {
            token: "test_token",
            commandschannelid: "111",
            huntbotchannelid: "222",
            gamblechannelid: "333",
            autoquestchannelid: "444",
            owodmchannelid: "555",
            userid: "123",
        },
        global: {
            paused: false,
            captchadetected: false,
            total: { captcha: 0, solvedcaptcha: 0 },
            temp: {},
        },
        user: { id: "123" },
        prefix: () => "owo",
        logger: {
            info: () => {},
            warn: () => {},
            alert: () => {},
            debug: () => {},
        },
        delay: async () => {},
        childprocess: { spawn: () => {}, exec: () => {} },
        ...overrides,
    };
    return client;
}

function makeMessage({
    channelId = "111",
    content = "",
    components = [],
} = {}) {
    return {
        channel: { id: channelId },
        content,
        components,
        author: { id: "408785106942164992" },
    };
}

// --- isWebCaptchaMessage ---

describe("isWebCaptchaMessage", () => {
    it("detects .com links", () => {
        assert.strictEqual(isWebCaptchaMessage("visit .com"), true);
        assert.strictEqual(isWebCaptchaMessage("click here .com now"), true);
    });

    it("detects 'please use the link'", () => {
        assert.strictEqual(
            isWebCaptchaMessage("please use the link below"),
            true,
        );
    });

    it("returns true when helloChristopher button present", () => {
        assert.ok(isWebCaptchaMessage("plain", {}));
    });

    it("returns true when canulickmymonster url present", () => {
        assert.ok(isWebCaptchaMessage("plain", undefined, true));
    });

    it("returns falsy with no suspicious content", () => {
        assert.ok(!isWebCaptchaMessage("just a normal message"));
    });
});

// --- escapeRegex ---

describe("escapeRegex", () => {
    it("escapes regex metacharacters", () => {
        assert.strictEqual(escapeRegex("a.b*c"), "a\\.b\\*c");
    });

    it("escapes groups and alternation", () => {
        assert.strictEqual(escapeRegex("a(b)c|d"), "a\\(b\\)c\\|d");
    });

    it("leaves plain text unchanged", () => {
        assert.strictEqual(escapeRegex("hello world"), "hello world");
    });
});

// --- handleCaptchaDetection (ban-protection gating) ---

describe("handleCaptchaDetection", () => {
    it("ignores messages from an unmonitored channel", async () => {
        const client = makeClient();
        const message = makeMessage({
            channelId: "999",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(client.global.captchadetected, false);
        assert.strictEqual(client.global.paused, false);
        assert.strictEqual(client.global.total.captcha, 0);
    });

    it("ignores messages that do not ping the bot", async () => {
        const client = makeClient();
        const message = makeMessage({
            channelId: "111",
            content: "please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(client.global.captchadetected, false);
    });

    it("does not re-trigger when a captcha is already detected", async () => {
        const client = makeClient();
        client.global.captchadetected = true;
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(client.global.total.captcha, 0);
    });

    it("ignores messages lacking a captcha phrase", async () => {
        const client = makeClient();
        const message = makeMessage({
            channelId: "111",
            content: "<@123> hello there friend",
        });

        await handleCaptchaDetection(client, message, "hello there friend");

        assert.strictEqual(client.global.captchadetected, false);
        assert.strictEqual(client.global.total.captcha, 0);
    });

    it("flags and pauses on a real web captcha (autosolve off, notifications off)", async () => {
        const client = makeClient();
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha https://owobot.com/x",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha https://owobot.com/x",
        );

        assert.strictEqual(client.global.captchadetected, true);
        assert.strictEqual(client.global.paused, true);
        assert.strictEqual(client.global.total.captcha, 1);
    });

    it("launches auto-solve browser when autosolve enabled on a web captcha", async () => {
        const spawn = mock.fn();
        const client = makeClient({
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
                        autosolve: true,
                        autosolve_thread: 1,
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: false,
                                prompt: false,
                            },
                        },
                    },
                },
            },
            childprocess: { spawn, exec: () => {} },
        });
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha .com",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha .com",
        );

        assert.strictEqual(spawn.mock.calls.length, 1);
        const args = spawn.mock.calls[0].arguments;
        assert.strictEqual(args[0], "node");
        assert.strictEqual(args[1][0], "./core/captcha.js");
        assert.ok(args[1][1].startsWith("--token=test_token"));
        assert.ok(args[1][2].startsWith("--userid=123"));
    });
});

// --- handleCaptchaSolved ---

describe("handleCaptchaSolved", () => {
    it("ignores non-DM channels", () => {
        const client = makeClient();
        client.global.captchadetected = true;
        const message = makeMessage({
            channelId: "111",
            content: "i have verified that you're a human",
        });
        message.channel.type = "text";

        handleCaptchaSolved(
            client,
            message,
            "i have verified that you're a human",
        );

        assert.strictEqual(client.global.captchadetected, true);
    });

    it("ignores DMs without the verified phrase", () => {
        const client = makeClient();
        client.global.captchadetected = true;
        const message = makeMessage({ content: "thanks" });
        message.channel.type = "DM";

        handleCaptchaSolved(client, message, "thanks");

        assert.strictEqual(client.global.captchadetected, true);
    });

    it("clears captcha flag on verified DM (no autoresume)", () => {
        const client = makeClient();
        client.global.captchadetected = true;
        client.global.paused = true;
        const message = makeMessage({
            content: "i have verified that you're a human",
        });
        message.channel.type = "DM";

        handleCaptchaSolved(
            client,
            message,
            "i have verified that you're a human",
        );

        assert.strictEqual(client.global.captchadetected, false);
        assert.strictEqual(client.global.total.solvedcaptcha, 1);
        // Without autoresume the bot stays paused for manual resume.
        assert.strictEqual(client.global.paused, true);
    });

    it("resumes the bot on verified DM when autoresume enabled", () => {
        const client = makeClient({
            config: {
                settings: {
                    autoresume: true,
                    captcha: {
                        autosolve: false,
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: false,
                                prompt: false,
                            },
                        },
                    },
                },
            },
        });
        client.global.captchadetected = true;
        client.global.paused = true;
        const message = makeMessage({
            content: "i have verified that you're a human",
        });
        message.channel.type = "DM";

        handleCaptchaSolved(
            client,
            message,
            "i have verified that you're a human",
        );

        assert.strictEqual(client.global.captchadetected, false);
        assert.strictEqual(client.global.paused, false);
        assert.strictEqual(client.global.total.solvedcaptcha, 1);
    });
});

// --- handleCommand ---

describe("handleCommand", () => {
    function commandClient(overrides = {}) {
        const commands = new Map();
        const aliases = new Map();
        const run = mock.fn();
        commands.set("hunt", { run });
        aliases.set("h", "hunt");
        return {
            user: { id: "123" },
            basic: { userid: "123" },
            prefix: () => "owo",
            commands,
            aliases,
            ...overrides,
        };
    }

    it("runs a known command with the prefix", () => {
        const client = commandClient();
        handleCommand(client, {
            content: "owo hunt",
            author: { id: "123" },
        });
        assert.strictEqual(
            client.commands.get("hunt").run.mock.calls.length,
            1,
        );
    });

    it("runs a known command via mention", () => {
        const client = commandClient();
        handleCommand(client, {
            content: "<@123> hunt",
            author: { id: "123" },
        });
        assert.strictEqual(
            client.commands.get("hunt").run.mock.calls.length,
            1,
        );
    });

    it("resolves command aliases", () => {
        const client = commandClient();
        handleCommand(client, {
            content: "owo h",
            author: { id: "123" },
        });
        assert.strictEqual(
            client.commands.get("hunt").run.mock.calls.length,
            1,
        );
    });

    it("ignores unknown commands", () => {
        const client = commandClient();
        handleCommand(client, {
            content: "owo nonsense",
            author: { id: "123" },
        });
        assert.strictEqual(
            client.commands.get("hunt").run.mock.calls.length,
            0,
        );
    });

    it("rejects commands from non-owner users (security gate)", () => {
        const client = commandClient();
        handleCommand(client, {
            content: "owo hunt",
            author: { id: "999" },
        });
        assert.strictEqual(
            client.commands.get("hunt").run.mock.calls.length,
            0,
        );
    });
});
