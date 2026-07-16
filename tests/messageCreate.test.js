const { describe, it, mock } = require("node:test");
const assert = require("node:assert");

const messageCreate = require("../src/core/messageCreate.js");
const { makeCtx } = require("./helpers/makeCtx.js");

const {
    escapeRegex,
    handleCaptchaDetection,
    handleCaptchaSolved,
    handleCommand,
} = messageCreate;

// --- Mock factories ---

function makeClient(overrides = {}) {
    const obj = {
        config: {
            main: {
                token: "test_token",
                commandschannelid: "111",
                owodmchannelid: "555",
                userid: "123",
                autostart: true,
                commands: {
                    hunt: true,
                    battle: true,
                    pray: false,
                    curse: false,
                    animals: false,
                    inventory: true,
                    tomain: false,
                },
                maximum_gem_rarity: "fabled",
            },
            settings: {
                autoresume: false,
                captcha: {
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
        global: {
            paused: false,
            captchadetected: false,
            total: { captcha: 0, solvedcaptcha: 0 },
            temp: {},
        },
        prefix: () => "owo",
        logger: {
            info: () => {},
            warn: () => {},
            alert: () => {},
            debug: () => {},
        },
        delay: async () => {},
        child_process: { spawn: () => {}, exec: () => {} },
        client: { user: { id: "123" } },
        ...overrides,
    };
    return makeCtx(obj);
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

    it("flags and pauses on a real web captcha", async () => {
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
});

// --- Captcha detection user-facing feedback ---

describe("captcha detection feedback", () => {
    // Helper: a ctx with desktop notification enabled and a notify spy.
    function captchaClient(overrides = {}) {
        return makeClient({
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
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
            ...overrides,
        });
    }

    it("logs all three messages (alert, info, warn) with correct text", async () => {
        const logger = {
            info: mock.fn(),
            warn: mock.fn(),
            alert: mock.fn(),
            debug: mock.fn(),
            logs: { info: [], warn: [], alert: [], debug: [] },
            dumpExitLog: mock.fn(),
        };
        const client = makeClient({
            logger,
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
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
        client.global.total.captcha = 0;
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(client.global.captchadetected, true);
        assert.strictEqual(client.global.paused, true);
        assert.strictEqual(client.global.total.captcha, 1);

        assert.strictEqual(logger.alert.mock.calls.length, 1);
        assert.deepStrictEqual(logger.alert.mock.calls[0].arguments, [
            "Bot",
            "Captcha",
            "Captcha Detected!",
        ]);

        assert.strictEqual(logger.info.mock.calls.length, 1);
        assert.deepStrictEqual(logger.info.mock.calls[0].arguments, [
            "Bot",
            "Captcha",
            "Total Captcha: 1",
        ]);

        assert.strictEqual(logger.warn.mock.calls.length, 1);
        assert.deepStrictEqual(logger.warn.mock.calls[0].arguments, [
            "Bot",
            "Captcha",
            "Bot Paused: true",
        ]);
    });

    it("triggers desktop toast notification via captchaNotify module", async () => {
        const notify = mock.fn();
        const client = captchaClient({
            notifier: { notify },
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: true,
                                prompt: false,
                            },
                        },
                    },
                },
            },
        });
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(notify.mock.calls.length, 1);
        const [call] = notify.mock.calls;
        assert.strictEqual(call.arguments[0].title, "Captcha Detected!");
        assert.ok(
            call.arguments[0].message.includes("resume"),
            "notification message should mention the resume command",
        );
        assert.strictEqual(call.arguments[0].sound, true);
        assert.strictEqual(call.arguments[0].wait, true);
        assert.strictEqual(call.arguments[0].appID, "OwO Farm Bot Stable");
    });

    it("spawns PowerShell MessageBox for desktop prompt", async () => {
        const spawn = mock.fn(() => ({ on: () => {} }));
        const client = makeClient({
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: false,
                                prompt: true,
                            },
                        },
                    },
                },
            },
            child_process: { spawn, exec: () => {} },
        });
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(spawn.mock.calls.length, 1);
        const [exe, allArgs] = spawn.mock.calls[0].arguments;
        assert.strictEqual(exe, "powershell.exe");
        assert.strictEqual(allArgs.length, 4);
        assert.strictEqual(allArgs[0], "-ExecutionPolicy");
        assert.strictEqual(allArgs[1], "Bypass");
        assert.strictEqual(allArgs[2], "-Command");
        const script = allArgs[3];
        assert.ok(
            script.includes("System.Windows.MessageBox]::Show"),
            "should use WPF MessageBox",
        );
        assert.ok(script.includes("Captcha detected!"), "should contain alert");
        assert.ok(
            script.includes(`${client.prefix()}resume`),
            "should mention the resume command",
        );
    });

    it("triggers both desktop notification AND prompt simultaneously", async () => {
        const notify = mock.fn();
        const spawn = mock.fn(() => ({ on: () => {} }));
        const client = captchaClient({
            notifier: { notify },
            child_process: { spawn, exec: () => {} },
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: true,
                                prompt: true,
                            },
                        },
                    },
                },
            },
        });
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        // Desktop toast notification via ctx.notifier
        assert.strictEqual(
            notify.mock.calls.length,
            1,
            "should fire desktop toast notification",
        );
        // PowerShell prompt
        const spawnArgs = spawn.mock.calls[0].arguments;
        assert.strictEqual(
            spawnArgs[0],
            "powershell.exe",
            "should spawn powershell for prompt",
        );
        // And the powershell command (args[1][3]) should be a MessageBox
        assert.ok(spawnArgs[1][3].includes("System.Windows.MessageBox]::Show"));
    });

    it("triggers both desktop notification AND prompt simultaneously", async () => {
        const notify = mock.fn();
        const spawn = mock.fn(() => ({ on: () => {} }));
        const client = captchaClient({
            notifier: { notify },
            child_process: { spawn, exec: () => {} },
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: true,
                                prompt: true,
                            },
                        },
                    },
                },
            },
        });
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(notify.mock.calls.length, 1);
        const spawnCmd = spawn.mock.calls[0]?.arguments?.[0];
        assert.strictEqual(spawnCmd, "powershell.exe");
    });

    it("increments captcha counter on each new detection", async () => {
        const client = makeClient();
        client.global.captchadetected = false;
        client.global.total.captcha = 5;
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(client.global.total.captcha, 6);

        // Already detected — should NOT increment again
        client.global.captchadetected = false; // simulate reset
        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        assert.strictEqual(client.global.total.captcha, 7);
    });

    it("escapes single quotes in PowerShell command to prevent injection", async () => {
        const spawn = mock.fn(() => ({ on: () => {} }));
        // Prefix with a single quote character to test escaping
        const maliciousPrefix = () => "o'wo";
        const client = makeClient({
            config: {
                settings: {
                    autoresume: false,
                    captcha: {
                        alerttype: {
                            webhook: false,
                            webhookurl: "",
                            desktop: {
                                force: false,
                                notification: false,
                                prompt: true,
                            },
                        },
                    },
                },
            },
            prefix: maliciousPrefix,
            child_process: { spawn, exec: () => {} },
        });
        const message = makeMessage({
            channelId: "111",
            content: "<@123> please complete your captcha",
        });

        await handleCaptchaDetection(
            client,
            message,
            "please complete your captcha",
        );

        const script = spawn.mock.calls[0].arguments[1][3];
        // The single quote in the prefix "o'wo" must be escaped as "o''wo"
        // otherwise PowerShell would break out of the single-quoted string.
        assert.ok(
            script.includes("o''wo"),
            "single quotes in prefix should be doubled for PowerShell safety",
        );
        // Ensure the script is still a valid MessageBox command
        assert.ok(
            script.includes("System.Windows.MessageBox]::Show"),
            "should be a valid MessageBox command",
        );
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
        return makeCtx({
            prefix: () => "owo",
            client: {
                user: { id: "123" },
                commands,
                aliases,
            },
            ...overrides,
        });
    }

    it("runs a known command with the prefix", () => {
        const client = commandClient();
        handleCommand(client, {
            content: "owo hunt",
            author: { id: "123" },
        });
        assert.strictEqual(
            client.client.commands.get("hunt").run.mock.calls.length,
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
            client.client.commands.get("hunt").run.mock.calls.length,
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
            client.client.commands.get("hunt").run.mock.calls.length,
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
            client.client.commands.get("hunt").run.mock.calls.length,
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
            client.client.commands.get("hunt").run.mock.calls.length,
            0,
        );
    });
});
