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
    "./checklist.js",
    "../modules/farm.js",
    "../modules/quest.js",
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
            },
            global: { quest: {} },
            basic: {
                commands: {
                    checklist: false,
                    autoquest: false,
                    animals: false,
                    pray: false,
                    curse: false,
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
