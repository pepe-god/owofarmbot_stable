const { mock } = require("node:test");
const BotContext = require("../../src/core/botContext.js");
const LoopManager = require("../../src/services/loopManager.js");
const { attachState } = require("../../src/services/botState.js");

function createMockClient() {
    return {
        user: { id: "123456789" },
        channels: { cache: new Map() },
        on: () => {},
        off: () => {},
        login: mock.fn(async () => {}),
        destroy: mock.fn(async () => {}),
    };
}

function createMockLogger() {
    const logs = { info: [], warn: [], alert: [], debug: [] };
    return {
        info: mock.fn((type, module, message) =>
            logs.info.push({ type, module, message }),
        ),
        warn: mock.fn((type, module, message) =>
            logs.warn.push({ type, module, message }),
        ),
        alert: mock.fn((type, module, message) =>
            logs.alert.push({ type, module, message }),
        ),
        debug: mock.fn((type, module, message) =>
            logs.debug.push({ type, module, message }),
        ),
        logs,
        dumpExitLog: mock.fn(),
    };
}

function createMockGlobalUtil() {
    return {
        waitForMessage: mock.fn(async () => ({ content: "" })),
        waitWhileBusy: mock.fn(async () => {}),
        commandrandomizer: (arr) => arr[0] || "",
        getrand: (min, max) => min + (max - min) * 0.5,
        parseDuration: (str) => {
            const regex = /(\d+)([SMHD])/g;
            let ms = 0;
            for (const match of str.matchAll(regex)) {
                const time = parseInt(match[1], 10);
                const unit = match[2];
                if (unit === "S") ms += time * 1000;
                else if (unit === "M") ms += time * 60 * 1000;
                else if (unit === "H") ms += time * 60 * 60 * 1000;
                else if (unit === "D") ms += time * 24 * 60 * 60 * 1000;
            }
            return ms;
        },
        removeInvisibleChars: (str) =>
            str.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, ""),
    };
}

function createDefaultConfig() {
    return {
        firstrun: false,
        prefix: "!",
        main: {
            token: "test_token",
            userid: "123",
            commandschannelid: "111",
            owodmchannelid: "555",
            autostart: true,
            commands: {
                hunt: true,
                battle: true,
                pray: false,
                curse: false,
                animals: false,
                inventory: true,
            },
            maximum_gem_rarity: "fabled",
        },
        settings: {
            owoprefix: "owo",
            chatfeedback: false,
            autophrases: true,
            autoresume: false,
            inventory: {
                use: {
                    lootbox: true,
                    fabledlootbox: false,
                    crate: true,
                    gems: true,
                },
            },
            logging: {
                newlog: true,
                loglength: 20,
                showlogbeforeexit: false,
            },
            safety: {
                autopause: true,
                pauseafter: 30,
                pausefor: 5,
            },
            captcha: {
                autosolve: false,
                autosolve_thread: 1,
                alerttype: {
                    webhook: true,
                    webhookurl: "",
                    desktop: {
                        force: true,
                        notification: true,
                        prompt: true,
                    },
                },
            },
        },
        animals: {
            type: {
                sell: false,
                sacrifice: false,
            },
            animaltype: {
                common: false,
                uncommon: false,
                rare: false,
                epic: false,
                mythical: false,
                patreon: false,
                cpatreon: false,
                legendary: false,
                gem: false,
                bot: false,
                distorted: false,
                fabled: false,
                special: false,
                hidden: false,
            },
        },
        interval: {
            hunt: {
                max: 32000,
                min: 16000,
            },
            battle: {
                max: 32000,
                min: 16000,
            },
            pray: {
                max: 332000,
                min: 316000,
            },
            animals: {
                max: 661000,
                min: 610000,
            },
        },
    };
}

function createDefaultBasic(config) {
    return {
        ...config.main,
        commands: {
            ...config.main.commands,
            inventory: true,
            hunt: true,
            battle: true,
        },
    };
}

function createDefaultGlobal() {
    return {
        paused: false,
        captchadetected: false,
        inventory: false,
        temp: { started: false, usedevent: false },
        total: { farm: 0, hunt: 0, battle: 0 },
        gems: {
            need: [],
            use: "",
            huntssinceinv: 0,
            isevent: false,
            missingHandled: false,
        },
    };
}

function makeCtx(overrides = {}) {
    const config = { ...createDefaultConfig(), ...overrides.config };
    const basic = { ...createDefaultBasic(config), ...overrides.basic };
    const global = { ...createDefaultGlobal(), ...overrides.global };

    const deps = {
        client: overrides.client || createMockClient(),
        config,
        basic,
        logger: overrides.logger || createMockLogger(),
        global,
        loops: overrides.loops || new LoopManager(),
        globalutil: overrides.globalutil || createMockGlobalUtil(),
        delay: overrides.delay || (() => Promise.resolve()),
        prefix: overrides.prefix || (() => "owo"),
        chalk: overrides.chalk || {
            blue: (s) => s,
            green: (s) => s,
            yellow: (s) => s,
            red: (s) => s,
            cyan: (s) => s,
            magenta: (s) => s,
            gray: (s) => s,
        },
        childprocess: overrides.childprocess || {
            spawn: mock.fn(),
            exec: mock.fn(),
        },
        notifier: overrides.notifier || { notify: mock.fn() },
        fs: overrides.fs || {
            readFileSync: mock.fn(() => "{}"),
            writeFileSync: mock.fn(),
            existsSync: mock.fn(() => true),
        },
    };

    const ctx = new BotContext(deps);
    Object.assign(ctx, overrides);
    // Bind the state machine to the (possibly overridden) global object so
    // `ctx.state` and the busy-flag accessors behave like the real runtime.
    if (!ctx.state) ctx.state = attachState(ctx.global);
    return ctx;
}

module.exports = { makeCtx };
