const { describe, it, mock, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { makeCtx } = require("./helpers/makeCtx.js");

const MAIN_HANDLER_DIR = path.dirname(
    require.resolve("../src/services/mainHandler.js"),
);

function resolveModulePath(relative) {
    return path.resolve(MAIN_HANDLER_DIR, relative);
}

const MODULE_PATHS = [
    "../modules/farm.js",
    "../modules/animals.js",
    "../modules/luck.js",
    "../modules/safety.js",
];

describe("mainHandler", () => {
    let savedCache;

    beforeEach(() => {
        savedCache = {};
        for (const relPath of MODULE_PATHS) {
            const resolved = resolveModulePath(relPath);
            savedCache[resolved] = require.cache[resolved];
        }
    });

    afterEach(() => {
        for (const relPath of MODULE_PATHS) {
            const resolved = resolveModulePath(relPath);
            if (savedCache[resolved]) {
                require.cache[resolved] = savedCache[resolved];
            } else {
                delete require.cache[resolved];
            }
        }
    });

    function mockModules(mocks) {
        for (const [relPath, fn] of Object.entries(mocks)) {
            const resolved = resolveModulePath(relPath);
            require.cache[resolved] = { exports: fn };
        }
    }

    function baseClient() {
        return makeCtx({
            config: {
                settings: {
                    owoprefix: "owo",
                    safety: { autopause: false },
                },
                main: {
                    commandschannelid: "111",
                    commands: {
                        animals: false,
                        pray: false,
                        curse: false,
                        hunt: true,
                        battle: true,
                        inventory: true,
                    },
                },
            },
            globalutil: { waitWhileBusy: async () => {} },
            delay: async () => {},
            client: { channels: { cache: { get: () => null } } },
            logger: { info: () => {}, warn: () => {}, alert: () => {} },
        });
    }

    it("sets default owoprefix when empty", async () => {
        mockModules({
            "../modules/farm.js": mock.fn(async () => {}),
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.settings.owoprefix = "";

        await mainHandler(client, {});

        assert.strictEqual(client.config.settings.owoprefix, "owo");
    });

    it("does not change owoprefix when non-empty", async () => {
        mockModules({
            "../modules/farm.js": mock.fn(async () => {}),
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.settings.owoprefix = "custom";

        await mainHandler(client, {});

        assert.strictEqual(client.config.settings.owoprefix, "custom");
    });

    it("requires farm directly", async () => {
        const farmMock = mock.fn(async () => {});
        mockModules({ "../modules/farm.js": farmMock });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();

        await mainHandler(client, {});

        assert.strictEqual(farmMock.mock.calls.length, 1);
    });

    it("requires animals when enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const animalsMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/animals.js": animalsMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.main.commands.animals = true;
        client.config.animals = { type: { sell: false } };
        client.global.temp = { animaltype: "all" };

        await mainHandler(client, {});

        assert.strictEqual(animalsMock.mock.calls.length, 1);
    });

    it("requires luck when pray enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const luckMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/luck.js": luckMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.main.commands.pray = true;

        await mainHandler(client, {});

        assert.strictEqual(luckMock.mock.calls.length, 1);
    });

    it("requires luck when curse enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const luckMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/luck.js": luckMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.main.commands.curse = true;

        await mainHandler(client, {});

        assert.strictEqual(luckMock.mock.calls.length, 1);
    });

    it("requires safety when autopause enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const safetyMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/safety.js": safetyMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.settings.safety.autopause = true;

        await mainHandler(client, {});

        assert.strictEqual(safetyMock.mock.calls.length, 1);
    });
});
