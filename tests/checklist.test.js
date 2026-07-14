const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert");

const {
    parseChecklistInterval,
    getIncompleteItems,
    executeChecklistLine,
} = require("../src/services/checklist");

const { makeCtx } = require("./helpers/makeCtx.js");

describe("parseChecklistInterval", () => {
    it("parses hours and minutes", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 1H 30M"),
            5400000,
        );
    });

    it("parses only hours", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 2H"),
            7200000,
        );
    });

    it("parses only minutes", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 45M"),
            2700000,
        );
    });

    it("parses only seconds", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 30S"),
            30000,
        );
    });

    it("returns 0 for empty string", () => {
        assert.strictEqual(parseChecklistInterval(""), 0);
    });

    it("returns 0 when no duration pattern found", () => {
        assert.strictEqual(parseChecklistInterval("No checklist available"), 0);
    });
});

describe("getIncompleteItems", () => {
    it("returns empty array when checklist is complete", () => {
        const items = getIncompleteItems("☑️ 🎉 Some completed checklist");
        assert.deepStrictEqual(items, []);
    });

    it("returns array of incomplete items", () => {
        const description = "⬛ 🎁 Claim daily reward\n⬛ 🍪 Send a cookie";
        const items = getIncompleteItems(description);
        assert.deepStrictEqual(items, [
            "⬛ 🎁 Claim daily reward",
            "⬛ 🍪 Send a cookie",
        ]);
    });
});

describe("executeChecklistLine", () => {
    afterEach(() => mock.restoreAll());

    function makeClient(types = {}, overrides = {}) {
        const spawn = mock.fn();
        return makeCtx({
            config: {
                settings: {
                    checklist: {
                        types: {
                            daily: false,
                            vote: false,
                            cookie: false,
                            ...types,
                        },
                    },
                },
            },
            global: {
                captchadetected: false,
                paused: false,
                temp: {},
                total: { vote: 0 },
            },
            basic: { token: "tok" },
            childprocess: { spawn },
            delay: async () => {},
            prefix: () => "owo",
            logger: { info: () => {}, warn: () => {} },
            ...overrides,
        });
    }

    function makeChannel() {
        return {
            send: mock.fn(async () => {}),
            guild: {
                members: {
                    cache: { filter: () => [], map: () => [] },
                },
            },
        };
    }

    it("does nothing when a captcha is detected", async () => {
        const client = makeClient(
            { daily: true },
            { global: { captchadetected: true } },
        );
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 🎁 Claim daily reward");

        assert.strictEqual(channel.send.mock.calls.length, 0);
        assert.strictEqual(client.childprocess.spawn.mock.calls.length, 0);
    });

    it("does nothing when the bot is paused", async () => {
        const client = makeClient(
            { daily: true },
            { global: { paused: true } },
        );
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 🎁 Claim daily reward");

        assert.strictEqual(channel.send.mock.calls.length, 0);
    });

    it("claims daily when enabled", async () => {
        const client = makeClient({ daily: true });
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 🎁 Claim daily reward");

        assert.strictEqual(channel.send.mock.calls.length, 1);
        assert.ok(
            channel.send.mock.calls[0].arguments[0].content.includes("daily"),
        );
    });

    it("skips daily when disabled", async () => {
        const client = makeClient({ daily: false });
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 🎁 Claim daily reward");

        assert.strictEqual(channel.send.mock.calls.length, 0);
    });

    it("spawns the vote bot and increments tally when enabled", async () => {
        const client = makeClient({ vote: true });
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 📝 Vote for OwO");

        assert.strictEqual(client.childprocess.spawn.mock.calls.length, 1);
        assert.strictEqual(client.global.total.vote, 1);
    });

    it("skips vote when disabled", async () => {
        const client = makeClient({ vote: false });
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 📝 Vote for OwO");

        assert.strictEqual(client.childprocess.spawn.mock.calls.length, 0);
        assert.strictEqual(client.global.total.vote, 0);
    });

    it("sends a cookie to OwO when no members and enabled", async () => {
        const client = makeClient({ cookie: true });
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 🍪 Send a cookie");

        assert.strictEqual(channel.send.mock.calls.length, 1);
        assert.ok(
            channel.send.mock.calls[0].arguments[0].content.includes("cookie"),
        );
        assert.strictEqual(client.global.temp.usedcookie, true);
    });

    it("skips cookie when disabled", async () => {
        const client = makeClient({ cookie: false });
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "⬛ 🍪 Send a cookie");

        assert.strictEqual(channel.send.mock.calls.length, 0);
    });

    it("marks cookie used for a completed cookie line", async () => {
        const client = makeClient();
        const channel = makeChannel();

        await executeChecklistLine(
            client,
            channel,
            "️☑️ 🍪 Cookie already given",
        );

        assert.strictEqual(client.global.temp.usedcookie, true);
        assert.strictEqual(channel.send.mock.calls.length, 0);
    });

    it("ignores completed gem/crate lines without side effects", async () => {
        const client = makeClient();
        const channel = makeChannel();

        await executeChecklistLine(client, channel, "☑️ 💎 Daily lootbox");

        assert.strictEqual(channel.send.mock.calls.length, 0);
        assert.strictEqual(client.childprocess.spawn.mock.calls.length, 0);
    });
});
