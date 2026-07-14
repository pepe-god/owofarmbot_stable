const { mock } = require("node:test");
const BotContext = require("../../src/core/botContext.js");
const LoopManager = require("../../src/services/loopManager.js");

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
        settings: {
            owoprefix: "owo",
            inventory: { use: { gems: true } },
            chatfeedback: false,
            logging: { loglength: 16, showlogbeforeexit: false, newlog: false },
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
            safety: { pauseafter: 60, pausefor: 10 },
            autoquest: true,
            gamble: {
                coinflip: true,
                slots: false,
                coinflipamount: 100,
                slotamount: 100,
            },
            pray: { use: false, amount: 100 },
            curse: { use: false, amount: 100 },
            animals: {
                sell: false,
                sacrifice: false,
                selllevel: 1,
                sacrificelevel: 1,
            },
            checklist: { daily: true, vote: true, cookie: true },
        },
        main: {
            token: "test_token",
            commandschannelid: "111",
            huntbotchannelid: "222",
            gamblechannelid: "333",
            autoquestchannelid: "444",
            owodmchannelid: "555",
            userid: "123",
        },
    };
}

function createDefaultBasic(config) {
    return {
        ...config.main,
        commands: {
            inventory: true,
            hunt: true,
            battle: true,
            gamble: { coinflip: true, slots: false },
            huntbot: { upgrade: true, upgradetype: "trait" },
        },
    };
}

function createDefaultGlobal() {
    return {
        paused: false,
        captchadetected: false,
        inventory: false,
        checklist: false,
        temp: { started: false, usedevent: false },
        total: { farm: 0, hunt: 0, battle: 0, gamble: 0, quest: 0 },
        gems: {
            need: [],
            use: "",
            huntssinceinv: 0,
            isevent: false,
            missingHandled: false,
        },
        gamble: { cowoncywon: 0 },
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
        rpc: overrides.rpc || mock.fn(),
    };

    const ctx = new BotContext(deps);
    Object.assign(ctx, overrides);
    return ctx;
}

module.exports = { makeCtx };
