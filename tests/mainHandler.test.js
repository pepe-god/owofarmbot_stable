const { describe, it, mock, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const MAIN_HANDLER_DIR = path.dirname(
    require.resolve("../src/services/mainHandler.js"),
);

function resolveModulePath(relative) {
    return path.resolve(MAIN_HANDLER_DIR, relative);
}

const MODULE_PATHS = [
    "../modules/joingiveaways.js",
    "./checklist.js",
    "../modules/farm.js",
    "../modules/gamble.js",
    "../modules/quest.js",
    "../modules/animals.js",
    "../modules/luck.js",
    "../modules/huntbot.js",
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
        return {
            config: {
                settings: {
                    owoprefix: "owo",
                    autojoingiveaways: false,
                    safety: { autopause: false },
                },
            },
            global: { owosupportserver: false, quest: {} },
            basic: {
                commands: {
                    checklist: false,
                    gamble: { coinflip: false, slot: false },
                    autoquest: false,
                    animals: false,
                    pray: false,
                    curse: false,
                    huntbot: { enable: false },
                },
            },
            globalutil: { waitWhileBusy: async () => {} },
            delay: async () => {},
            channels: { cache: { get: () => null } },
            logger: { info: () => {}, warn: () => {}, alert: () => {} },
        };
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

    it("requires farm when checklist is disabled", async () => {
        const farmMock = mock.fn(async () => {});
        mockModules({ "../modules/farm.js": farmMock });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();

        // Make it reach farm (not hunt, not battle) by setting commands to minimal
        // We just need to verify farm is loaded
        await mainHandler(client, {});

        assert.strictEqual(farmMock.mock.calls.length, 1);
    });

    it("requires gamble when coinflip enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const gambleMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/gamble.js": gambleMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.basic.commands.gamble.coinflip = true;

        await mainHandler(client, {});

        assert.strictEqual(gambleMock.mock.calls.length, 1);
    });

    it("does not require gamble when both disabled", async () => {
        const farmMock = mock.fn(async () => {});
        const gambleMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/gamble.js": gambleMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();

        await mainHandler(client, {});

        assert.strictEqual(gambleMock.mock.calls.length, 0);
    });

    it("requires quest when autoquest enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const questMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/quest.js": questMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.basic.commands.autoquest = true;

        await mainHandler(client, {});

        assert.strictEqual(questMock.mock.calls.length, 1);
    });

    it("sets quest title when autoquest disabled", async () => {
        const farmMock = mock.fn(async () => {});
        mockModules({ "../modules/farm.js": farmMock });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.basic.commands.autoquest = false;

        await mainHandler(client, {});

        assert.strictEqual(client.global.quest?.title, "Quest not enabled");
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
        client.basic.commands.animals = true;
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
        client.basic.commands.pray = true;

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
        client.basic.commands.curse = true;

        await mainHandler(client, {});

        assert.strictEqual(luckMock.mock.calls.length, 1);
    });

    it("requires huntbot when enabled", async () => {
        const farmMock = mock.fn(async () => {});
        const huntbotMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/huntbot.js": huntbotMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.basic.commands.huntbot.enable = true;

        await mainHandler(client, {});

        assert.strictEqual(huntbotMock.mock.calls.length, 1);
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

    it("requires joingiveaways when both conditions met", async () => {
        const farmMock = mock.fn(async () => {});
        const joinMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/joingiveaways.js": joinMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.settings.autojoingiveaways = true;
        client.global.owosupportserver = true;

        await mainHandler(client, {});

        assert.strictEqual(joinMock.mock.calls.length, 1);
    });

    it("does not require joingiveaways when only one condition met", async () => {
        const farmMock = mock.fn(async () => {});
        const joinMock = mock.fn(async () => {});
        mockModules({
            "../modules/farm.js": farmMock,
            "../modules/joingiveaways.js": joinMock,
        });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.config.settings.autojoingiveaways = true;
        client.global.owosupportserver = false;

        await mainHandler(client, {});

        assert.strictEqual(joinMock.mock.calls.length, 0);
    });

    it("requires checklist when basic.commands.checklist enabled", async () => {
        const checklistMock = mock.fn(async () => {});
        mockModules({ "./checklist.js": checklistMock });
        const mainHandler = require("../src/services/mainHandler.js");
        const client = baseClient();
        client.basic.commands.checklist = true;

        await mainHandler(client, {});

        assert.strictEqual(checklistMock.mock.calls.length, 1);
    });
});
