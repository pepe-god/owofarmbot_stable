const { describe, it, mock, before, after, afterEach } = require("node:test");
const assert = require("node:assert");

const safety = require("../src/modules/safety.js");

function makeClient(overrides = {}) {
    const logs = [];
    return {
        config: {
            settings: {
                safety: { pauseafter: 1, pausefor: 1 },
            },
        },
        global: { paused: false, captchadetected: false },
        logger: {
            warn: (...args) => logs.push(args),
            info: () => {},
        },
        ...overrides,
    };
}

describe("safety", () => {
    before(() => mock.timers.enable({ apis: ["setTimeout"] }));
    after(() => mock.timers.reset());
    afterEach(() => mock.restoreAll());

    describe("pause", () => {
        it("sets paused when idle", () => {
            const client = makeClient();
            safety.pause(client, 60000, 60000);
            assert.strictEqual(client.global.paused, true);
        });

        it("is a no-op when already paused", () => {
            const client = makeClient({
                global: { paused: true, captchadetected: false },
            });
            safety.pause(client, 60000, 60000);
            assert.strictEqual(client.global.paused, true);
        });

        it("is a no-op while a captcha is detected", () => {
            const client = makeClient({
                global: { paused: false, captchadetected: true },
            });
            safety.pause(client, 60000, 60000);
            assert.strictEqual(client.global.paused, false);
        });
    });

    describe("resume", () => {
        it("clears paused when no captcha is active", () => {
            const client = makeClient({
                global: { paused: true, captchadetected: false },
            });
            safety.resume(client, 60000, 60000);
            assert.strictEqual(client.global.paused, false);
        });

        it("defers resume (keeps paused) while a captcha is detected", () => {
            const client = makeClient({
                global: { paused: true, captchadetected: true },
            });
            safety.resume(client, 60000, 60000);
            assert.strictEqual(client.global.paused, true);
        });
    });

    describe("module wiring", () => {
        it("schedules the first pause after pauseafter minutes", () => {
            const client = makeClient({
                config: {
                    settings: { safety: { pauseafter: 1, pausefor: 1 } },
                },
            });
            safety(client);
            // 1 minute * 60 * 1000 = 60000ms; nothing should be paused yet.
            assert.strictEqual(client.global.paused, false);
            mock.timers.tick(60000);
            assert.strictEqual(client.global.paused, true);
        });
    });
});
