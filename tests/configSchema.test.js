const { describe, it, mock, before, after, afterEach } = require("node:test");
const assert = require("node:assert");

const {
    validateConfig,
    parseConfigErrors,
    checkToken,
} = require("../src/services/configSchema");

function makeMockClient(config, overrides = {}) {
    const logs = [];
    const client = {
        config,
        logger: {
            info: (...args) => logs.push({ level: "info", args }),
            warn: (...args) => logs.push({ level: "warn", args }),
            alert: (...args) => logs.push({ level: "alert", args }),
            debug: () => {},
        },
        global: {
            type: "test",
            rareLevel: 0,
            temp: { animaltype: "" },
        },
        basic: {
            maximum_gem_rarity: "",
            commands: { animals: false },
            curse: false,
        },
        chalk: {
            white: (s) => s,
        },
        ...overrides,
    };
    client.logs = logs;
    return client;
}

function makeValidConfig() {
    return {
        main: {
            token: "valid.token.12345abc",
            commands: {
                pray: false,
                curse: false,
                huntbot: { enable: false },
                animals: false,
                inventory: false,
                checklist: false,
                autoquest: false,
            },
            commandschannelid: "111",
            huntbotchannelid: "222",
            autoquestchannelid: "444",
            maximum_gem_rarity: "",
        },
        settings: {

            checklist: {
                types: { daily: false, cookie: false, vote: false },
            },
            inventory: {
                use: {
                    lootbox: false,
                    fabledlootbox: false,
                    crate: false,
                    gems: false,
                },
            },
            safety: { autopause: false, pauseafter: 0, pausefor: 0 },
            captcha: {
                autosolve: false,
                alerttype: {
                    webhook: false,
                    desktop: {
                        force: false,
                        notification: false,
                        prompt: false,
                    },
                },
            },
            autophrases: false,
            autojoingiveaways: false,
            logging: { loglength: 16, showlogbeforeexit: false, newlog: false },
        },
        animals: {
            type: { sell: false, sacrifice: false },
            animaltype: { common: false },
        },
        interval: {
            hunt: { min: 12000, max: 16000 },
            battle: { min: 12000, max: 16000 },
            pray: { min: 316000, max: 332000 },
            animals: { min: 610000, max: 661000 },
            checklist: 3600000,
        },
    };
}

function hasAlert(client) {
    return client.logs.some(
        (l) => l.level === "alert" && l.args[2]?.includes("not verified"),
    );
}

// Mirror bot.js: validate, then surface errors (which may exit on fatal).
async function verify(client, config) {
    const { success, errors } = validateConfig(client, config);
    parseConfigErrors(errors, client);
    return { success };
}

describe("validateConfig", () => {
    before(() => mock.timers.enable({ apis: ["setTimeout"] }));
    after(() => mock.timers.reset());

    afterEach(() => {
        mock.restoreAll();
    });

    it("accepts a valid config", async () => {
        const config = makeValidConfig();
        const client = makeMockClient(config);
        await verify(client, config);
        assert.strictEqual(hasAlert(client), false);
    });

    it("rejects missing token", async () => {
        const config = makeValidConfig();
        config.main.token = "short";
        const client = makeMockClient(config);

        mock.method(process, "exit", () => {});
        await verify(client, config);
        assert.strictEqual(hasAlert(client), true);
    });

    it("rejects duplicate channel IDs", async () => {
        const config = makeValidConfig();
        config.main.huntbotchannelid = "111";
        const client = makeMockClient(config);

        mock.method(process, "exit", () => {});
        mock.method(process, "exit", () => {});
        await verify(client, config);
        assert.strictEqual(hasAlert(client), true);
    });

    it("rejects duplicate channel IDs", async () => {
        const config = makeValidConfig();
        config.main.huntbotchannelid = "111";
        const client = makeMockClient(config);

        mock.method(process, "exit", () => {});
        await verify(client, config);
        assert.strictEqual(hasAlert(client), true);
    });

    it("disables curse when pray is also enabled", async () => {
        const config = makeValidConfig();
        config.main.commands.pray = true;
        config.main.commands.curse = true;
        const client = makeMockClient(config);

        await verify(client, config);
        assert.strictEqual(config.main.commands.curse, false);
        assert.strictEqual(client.basic.curse, false);
    });

    it("resets intervals that are too low", async () => {
        const config = makeValidConfig();
        config.interval.hunt.min = 500;
        const client = makeMockClient(config);

        await verify(client, config);
        assert.strictEqual(config.interval.hunt.min, 12000);
    });

    it("rejects sell and sacrifice both enabled", async () => {
        const config = makeValidConfig();
        config.animals.type.sell = true;
        config.animals.type.sacrifice = true;
        const client = makeMockClient(config);
        client.basic.commands.animals = true;

        mock.method(process, "exit", () => {});
        await verify(client, config);
        assert.strictEqual(hasAlert(client), true);
    });

    it("defaults invalid gem rarity to level 7", async () => {
        const config = makeValidConfig();
        const client = makeMockClient(config);
        client.basic.maximum_gem_rarity = "invalid_rarity";

        await verify(client, config);
        assert.strictEqual(client.global.rareLevel, 7);
    });
});

describe("checkToken", () => {
    function makeCtx() {
        return makeMockClient(makeValidConfig());
    }

    it("accepts a well-formed three-segment token", () => {
        const ctx = makeCtx();
        const config = makeValidConfig();
        config.main.token = "MTIz.NDU2.Nzg5abc";
        assert.strictEqual(checkToken(config, ctx), true);
        assert.strictEqual(
            ctx.logs.some((l) => l.level === "alert"),
            false,
        );
    });

    it("rejects a token without the dot-separated shape", () => {
        const ctx = makeCtx();
        const config = makeValidConfig();
        config.main.token = "this_is_not_a_real_token";
        assert.strictEqual(checkToken(config, ctx), false);
        assert.strictEqual(
            ctx.logs.some((l) => l.level === "alert"),
            true,
        );
    });

    it("rejects a token that is too short", () => {
        const ctx = makeCtx();
        const config = makeValidConfig();
        config.main.token = "short";
        assert.strictEqual(checkToken(config, ctx), false);
    });

    it("rejects an empty token", () => {
        const ctx = makeCtx();
        const config = makeValidConfig();
        config.main.token = "";
        assert.strictEqual(checkToken(config, ctx), false);
    });
});
