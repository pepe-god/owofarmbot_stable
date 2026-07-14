const { describe, it, mock, before, after, afterEach } = require("node:test");
const assert = require("node:assert");

const admin = require("../src/core/admin.js");
const LoopManager = require("../src/services/loopManager.js");

function getCommand(name) {
    return admin.find(
        (c) =>
            c.config.name === name || (c.config.aliases || []).includes(name),
    );
}

function makeClient(overrides = {}) {
    const global = {
        paused: false,
        captchadetected: false,
        temp: {},
        total: {},
        ...(overrides.global || {}),
    };
    const { global: _ignored, ...rest } = overrides;
    // Mirror the pre-existing "already started" state onto the loop manager so
    // its atomic tryStart() gate agrees with the fixture.
    const loops = new LoopManager();
    if (global.temp?.started) loops.tryStart();
    return {
        config: { settings: { chatfeedback: false } },
        rpc: mock.fn(),
        destroy: mock.fn(),
        loops,
        global,
        ...rest,
    };
}

function makeMessage() {
    return {
        delete: mock.fn(async () => {}),
        channel: { send: mock.fn(async () => {}) },
    };
}

describe("admin commands", () => {
    before(() => mock.timers.enable({ apis: ["setTimeout"] }));
    after(() => mock.timers.reset());
    afterEach(() => {
        mock.restoreAll();
        if (process.exit.restore) process.exit.restore();
    });

    describe("pause", () => {
        it("pauses and refreshes rpc when not already paused", async () => {
            const client = makeClient();
            const message = makeMessage();

            await getCommand("pause").run(client, message);

            assert.strictEqual(client.global.paused, true);
            assert.strictEqual(client.rpc.mock.calls.length, 1);
        });

        it("does not re-pause or refresh rpc when already paused", async () => {
            const client = makeClient({ global: { paused: true } });
            const message = makeMessage();

            await getCommand("pause").run(client, message);

            assert.strictEqual(client.global.paused, true);
            assert.strictEqual(client.rpc.mock.calls.length, 0);
        });
    });

    describe("start / resume", () => {
        it("refuses to resume when not paused", async () => {
            const client = makeClient({ global: { paused: false } });
            const message = makeMessage();

            await getCommand("start").run(client, message);

            assert.strictEqual(client.global.paused, false);
            assert.strictEqual(client.global.temp.started, undefined);
            assert.strictEqual(client.rpc.mock.calls.length, 0);
        });

        it("resumes on first start, clears captcha and marks started", async () => {
            const client = makeClient({
                global: { paused: true, captchadetected: true, temp: {} },
            });
            const message = makeMessage();

            await getCommand("resume").run(client, message);

            assert.strictEqual(client.global.paused, false);
            assert.strictEqual(client.global.captchadetected, false);
            assert.strictEqual(client.global.temp.started, true);
            assert.strictEqual(client.rpc.mock.calls.length, 1);
        });

        it("resumes again without re-marking started", async () => {
            const client = makeClient({
                global: {
                    paused: true,
                    captchadetected: false,
                    temp: { started: true },
                },
            });
            const message = makeMessage();

            await getCommand("start").run(client, message);

            assert.strictEqual(client.global.paused, false);
            assert.strictEqual(client.global.temp.started, true);
        });
    });

    describe("restart", () => {
        it("destroys the client and schedules a process exit", async () => {
            mock.method(process, "exit", () => {});
            const client = makeClient();
            const message = makeMessage();

            await getCommand("restart").run(client, message);

            assert.strictEqual(client.destroy.mock.calls.length, 1);
            assert.strictEqual(message.channel.send.mock.calls.length, 1);
        });
    });

    describe("stats", () => {
        it("does not throw and sends feedback when enabled", async () => {
            const client = makeClient({
                config: { settings: { chatfeedback: true } },
            });
            const message = makeMessage();

            await getCommand("stats").run(client, message);

            assert.strictEqual(message.channel.send.mock.calls.length, 1);
            const sent =
                message.channel.send.mock.calls[0].arguments[0].content;
            assert.ok(sent.includes("OwO Farm Bot Stable Statistics"));
        });
    });

    describe("chatfeedback gating", () => {
        it("does not send a reply when chatfeedback is disabled", async () => {
            const client = makeClient({
                config: { settings: { chatfeedback: false } },
            });
            const message = makeMessage();

            await getCommand("pause").run(client, message);

            assert.strictEqual(message.channel.send.mock.calls.length, 0);
            assert.strictEqual(message.delete.mock.calls.length, 1);
        });
    });
});
