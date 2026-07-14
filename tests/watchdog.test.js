const { describe, it } = require("node:test");
const assert = require("node:assert");
const { startWatchdog } = require("../src/services/watchdog.js");

function makeCtx(overrides = {}) {
    const alerts = [];
    const ctx = {
        config: { settings: { autoresume: false } },
        global: {
            use: false,
            inventory: false,
            captchadetected: false,
            paused: true,
            type: "test",
        },
        logger: {
            info: () => {},
            warn: () => {},
            alert: (...args) => alerts.push(args),
        },
        alerts,
        ...overrides,
    };
    return ctx;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("watchdog", () => {
    it("force-clears a transient flag held past the threshold", async () => {
        const ctx = makeCtx();
        ctx.global.use = true;
        const handle = startWatchdog(ctx, {
            tick: 10,
            stuckMs: 30,
            captchaMs: 1e12,
        });
        await sleep(90);
        clearInterval(handle);
        assert.strictEqual(ctx.global.use, false);
        assert.ok(ctx.alerts.length > 0);
    });

    it("does not clear a flag released within the threshold", async () => {
        const ctx = makeCtx();
        ctx.global.use = true;
        const handle = startWatchdog(ctx, {
            tick: 10,
            stuckMs: 200,
            captchaMs: 1e12,
        });
        await sleep(40);
        ctx.global.use = false;
        await sleep(40);
        clearInterval(handle);
        assert.strictEqual(ctx.alerts.length, 0);
    });

    it("force-clears a stale captcha flag", async () => {
        const ctx = makeCtx();
        ctx.global.captchadetected = true;
        const handle = startWatchdog(ctx, {
            tick: 10,
            stuckMs: 1e12,
            captchaMs: 30,
        });
        await sleep(90);
        clearInterval(handle);
        assert.strictEqual(ctx.global.captchadetected, false);
        assert.ok(ctx.alerts.length > 0);
    });

    it("unpauses when clearing a stale captcha with autoresume", async () => {
        const ctx = makeCtx({ config: { settings: { autoresume: true } } });
        ctx.global.captchadetected = true;
        ctx.global.paused = true;
        const handle = startWatchdog(ctx, {
            tick: 10,
            stuckMs: 1e12,
            captchaMs: 30,
        });
        await sleep(90);
        clearInterval(handle);
        assert.strictEqual(ctx.global.captchadetected, false);
        assert.strictEqual(ctx.global.paused, false);
    });
});
