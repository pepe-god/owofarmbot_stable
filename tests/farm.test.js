const { describe, it, mock, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert");

function makeClient(overrides = {}) {
    return {
        config: { settings: { inventory: { use: { gems: true } } } },
        basic: { commands: { inventory: true } },
        global: {
            gems: {
                need: [],
                use: "",
                huntssinceinv: 0,
                isevent: false,
                missingHandled: false,
            },
            temp: { usedevent: false },
            ...(overrides.global || {}),
        },
        globalutil: { waitForMessage: async () => ({ content: "" }) },
        logger: { info: () => {}, warn: () => {}, alert: () => {} },
        prefix: () => "owo",
        ...overrides,
    };
}

describe("farm", () => {
    beforeEach(() => {
        mock.timers.enable();
    });

    afterEach(() => {
        mock.timers.reset();
        mock.restoreAll();
    });

    describe("capitalize", () => {
        it("capitalizes first letter", () => {
            const farm = require("../src/modules/farm.js");
            assert.strictEqual(farm.capitalize("hello"), "Hello");
        });

        it("handles single character", () => {
            const farm = require("../src/modules/farm.js");
            assert.strictEqual(farm.capitalize("a"), "A");
        });

        it("handles empty string", () => {
            const farm = require("../src/modules/farm.js");
            assert.strictEqual(farm.capitalize(""), "");
        });

        it("leaves already capitalized string unchanged", () => {
            const farm = require("../src/modules/farm.js");
            assert.strictEqual(farm.capitalize("Hello"), "Hello");
        });
    });

    describe("huntResult", () => {
        function mockChannel() {
            return { send: mock.fn(() => Promise.resolve({ id: "msg1" })) };
        }

        it("parses message and finds no missing gems when all present", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                globalutil: {
                    waitForMessage: async () => ({
                        content: "You caught a gem1 gem3 gem4 and more!",
                    }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, []);
            assert.strictEqual(client.global.gems.huntssinceinv, 1);
        });

        it("finds missing gem3", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                globalutil: {
                    waitForMessage: async () => ({
                        content: "You caught a gem1 gem4!",
                    }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, ["gem3"]);
        });

        it("finds all gems missing", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                globalutil: {
                    waitForMessage: async () => ({
                        content: "You found nothing interesting",
                    }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, [
                "gem1",
                "gem3",
                "gem4",
            ]);
        });

        it("returns early when message is null", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                globalutil: { waitForMessage: async () => null },
            });
            client.global.gems.need = ["existing"];

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            // Gems should NOT have been reset
            assert.deepStrictEqual(client.global.gems.need, ["existing"]);
        });

        it("returns early when message content is null", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                globalutil: {
                    waitForMessage: async () => ({ content: null }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            // need should be empty (reset at start), but no gems added after
            assert.deepStrictEqual(client.global.gems.need, []);
        });

        it("returns early when inventory gems setting disabled", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient();
            client.config.settings.inventory.use.gems = false;
            // waitForMessage should not be called
            let waitCalled = false;
            client.globalutil.waitForMessage = async () => {
                waitCalled = true;
                return { content: "test" };
            };

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.strictEqual(waitCalled, false);
        });

        it("handles event with star found", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                global: {
                    gems: {
                        need: [],
                        use: "",
                        huntssinceinv: 0,
                        isevent: true,
                        missingHandled: false,
                    },
                    temp: { usedevent: false },
                },
                globalutil: {
                    waitForMessage: async () => ({
                        content: "star gem1 gem3 gem4",
                    }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, []);
            assert.strictEqual(client.global.temp.usedevent, false);
        });

        it("handles event without star and not yet used", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                global: {
                    gems: {
                        need: [],
                        use: "",
                        huntssinceinv: 0,
                        isevent: true,
                        missingHandled: false,
                    },
                    temp: { usedevent: false },
                },
                globalutil: {
                    waitForMessage: async () => ({
                        content: "gem1 gem3 gem4",
                    }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.ok(client.global.gems.need.includes("star"));
            assert.strictEqual(client.global.temp.usedevent, true);
        });

        it("disables event flag when star not found and already used", async () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                global: {
                    gems: {
                        need: [],
                        use: "",
                        huntssinceinv: 0,
                        isevent: true,
                        missingHandled: false,
                    },
                    temp: { usedevent: true },
                },
                globalutil: {
                    waitForMessage: async () => ({
                        content: "gem1 gem3 gem4",
                    }),
                },
            });

            await farm.huntResult(client, mockChannel(), { id: "hunt123" });

            assert.strictEqual(client.global.gems.isevent, false);
            assert.strictEqual(client.global.temp.usedevent, true);
        });
    });

    describe("handleMissingGems", () => {
        it("returns early when inventory disabled", () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient({
                basic: { commands: { inventory: false } },
            });
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            farm.handleMissingGems(client, channel, "some content");

            assert.strictEqual(channel.send.mock.calls.length, 0);
            assert.strictEqual(client.global.gems.missingHandled, false);
        });

        it("sets missingHandled and sends lootbox on first call", () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient();
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            farm.handleMissingGems(client, channel, "some content");

            assert.strictEqual(client.global.gems.missingHandled, true);
            assert.strictEqual(client.global.gems.huntssinceinv, 0);
            assert.strictEqual(channel.send.mock.calls.length, 1);
            const sentContent = channel.send.mock.calls[0].arguments[0].content;
            // commandrandomizer picks "lb" or "lootbox" randomly
            assert.ok(
                sentContent.includes(" all"),
                `Expected " all" in "${sentContent}"`,
            );
        });

        it("resets huntssinceinv when content includes lootbox", () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient();
            client.global.gems.missingHandled = true;
            client.global.gems.huntssinceinv = 10;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            farm.handleMissingGems(client, channel, "lootbox reward!");

            assert.strictEqual(client.global.gems.huntssinceinv, 0);
        });

        it("resets huntssinceinv when threshold met", () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient();
            client.global.gems.missingHandled = true;
            client.global.gems.huntssinceinv = 30;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            // Mock Math.random so getrand(15, 30) returns deterministic value
            mock.method(Math, "random", () => 0);

            farm.handleMissingGems(client, channel, "some content");

            assert.strictEqual(client.global.gems.huntssinceinv, 0);
        });

        it("does not reset huntssinceinv when threshold not met", () => {
            const farm = require("../src/modules/farm.js");
            const client = makeClient();
            client.global.gems.missingHandled = true;
            client.global.gems.huntssinceinv = 5;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            // Mock Math.random so getrand(15, 30) returns deterministic value
            mock.method(Math, "random", () => 0);

            farm.handleMissingGems(client, channel, "some content");

            assert.strictEqual(client.global.gems.huntssinceinv, 5);
        });
    });
});
