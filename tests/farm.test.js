const { describe, it, mock, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert");

const { makeCtx } = require("./helpers/makeCtx.js");
const { capitalize } = require("../src/core/globalutil.js");
const {
    huntResult,
    handleMissingGems,
} = require("../src/modules/gemHandler.js");

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
            assert.strictEqual(capitalize("hello"), "Hello");
        });

        it("handles single character", () => {
            assert.strictEqual(capitalize("a"), "A");
        });

        it("handles empty string", () => {
            assert.strictEqual(capitalize(""), "");
        });

        it("leaves already capitalized string unchanged", () => {
            assert.strictEqual(capitalize("Hello"), "Hello");
        });
    });

    describe("huntResult", () => {
        function mockChannel() {
            return { send: mock.fn(() => Promise.resolve({ id: "msg1" })) };
        }

        it("parses message and finds no missing gems when all present", async () => {
            const client = makeCtx({
                globalutil: {
                    waitForMessage: async () => ({
                        content: "You caught a gem1 gem3 gem4 and more!",
                    }),
                },
            });

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, []);
            assert.strictEqual(client.global.gems.huntssinceinv, 1);
        });

        it("finds missing gem3", async () => {
            const client = makeCtx({
                globalutil: {
                    waitForMessage: async () => ({
                        content: "You caught a gem1 gem4!",
                    }),
                },
            });

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, ["gem3"]);
        });

        it("finds all gems missing", async () => {
            const client = makeCtx({
                globalutil: {
                    waitForMessage: async () => ({
                        content: "You found nothing interesting",
                    }),
                },
            });

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, [
                "gem1",
                "gem3",
                "gem4",
            ]);
        });

        it("returns early when message is null", async () => {
            const client = makeCtx({
                globalutil: { waitForMessage: async () => null },
            });
            client.global.gems.need = ["existing"];

            await huntResult(client, mockChannel(), { id: "hunt123" });

            // Gems should NOT have been reset
            assert.deepStrictEqual(client.global.gems.need, ["existing"]);
        });

        it("returns early when message content is null", async () => {
            const client = makeCtx({
                globalutil: {
                    waitForMessage: async () => ({ content: null }),
                },
            });

            await huntResult(client, mockChannel(), { id: "hunt123" });

            // need should be empty (reset at start), but no gems added after
            assert.deepStrictEqual(client.global.gems.need, []);
        });

        it("returns early when inventory gems setting disabled", async () => {
            const client = makeCtx();
            client.config.settings.inventory.use.gems = false;
            // waitForMessage should not be called
            let waitCalled = false;
            client.globalutil.waitForMessage = async () => {
                waitCalled = true;
                return { content: "test" };
            };

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.strictEqual(waitCalled, false);
        });

        it("handles event with star found", async () => {
            const client = makeCtx({
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

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.deepStrictEqual(client.global.gems.need, []);
            assert.strictEqual(client.global.temp.usedevent, false);
        });

        it("handles event without star and not yet used", async () => {
            const client = makeCtx({
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

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.ok(client.global.gems.need.includes("star"));
            assert.strictEqual(client.global.temp.usedevent, true);
        });

        it("disables event flag when star not found and already used", async () => {
            const client = makeCtx({
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

            await huntResult(client, mockChannel(), { id: "hunt123" });

            assert.strictEqual(client.global.gems.isevent, false);
            assert.strictEqual(client.global.temp.usedevent, true);
        });
    });

    describe("handleMissingGems", () => {
        it("returns early when inventory disabled", () => {
            const client = makeCtx();
            client.config.main.commands.inventory = false;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            handleMissingGems(client, channel, "some content");

            assert.strictEqual(channel.send.mock.calls.length, 0);
            assert.strictEqual(client.global.gems.missingHandled, false);
        });

        it("sets missingHandled and sends lootbox on first call", () => {
            const client = makeCtx();
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            handleMissingGems(client, channel, "some content");

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
            const client = makeCtx();
            client.global.gems.missingHandled = true;
            client.global.gems.huntssinceinv = 10;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            handleMissingGems(client, channel, "lootbox reward!");

            assert.strictEqual(client.global.gems.huntssinceinv, 0);
        });

        it("resets huntssinceinv when threshold met", () => {
            const client = makeCtx();
            client.global.gems.missingHandled = true;
            client.global.gems.huntssinceinv = 30;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            // Mock Math.random so getrand(15, 30) returns deterministic value
            mock.method(Math, "random", () => 0);

            handleMissingGems(client, channel, "some content");

            assert.strictEqual(client.global.gems.huntssinceinv, 0);
        });

        it("does not reset huntssinceinv when threshold not met", () => {
            const client = makeCtx();
            client.global.gems.missingHandled = true;
            client.global.gems.huntssinceinv = 5;
            const channel = { send: mock.fn() };
            client.logger = { warn: () => {}, info: () => {}, alert: () => {} };

            // Mock Math.random so getrand(15, 30) returns deterministic value
            mock.method(Math, "random", () => 0);

            handleMissingGems(client, channel, "some content");

            assert.strictEqual(client.global.gems.huntssinceinv, 5);
        });
    });
});
