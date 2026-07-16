const test = require("node:test");
const assert = require("node:assert");

const { startWatchdog } = require("../src/services/watchdog.js");

function makeCtx() {
    return {
        global: { use: false, inventory: false, captchadetected: false, paused: false },
        config: { settings: { autoresume: false } },
        logger: { info: () => {}, alert: () => {}, warn: () => {} },
    };
}

test("watchdog force-clears a stuck 'use' flag after the threshold", () => {
    const ctx = makeCtx();
    // Very short thresholds so the test runs fast.
    const handle = startWatchdog(ctx, { stuckMs: 10, captchaMs: 999999, tick: 5 });
    ctx.global.use = true;
    return new Promise((resolve) => {
        setTimeout(() => {
            clearTimeout(handle);
            assert.strictEqual(ctx.global.use, false);
            setTimeout(() => process.exit(0), 10);
            resolve();
        }, 60);
    });
});

test("watchdog leaves a freshly-set flag alone", () => {
    const ctx = makeCtx();
    const handle = startWatchdog(ctx, { stuckMs: 100000, captchaMs: 999999, tick: 5 });
    ctx.global.inventory = true;
    return new Promise((resolve) => {
        setTimeout(() => {
            clearTimeout(handle);
            assert.strictEqual(ctx.global.inventory, true);
            setTimeout(() => process.exit(0), 10);
            resolve();
        }, 30);
    });
});

test("watchdog force-clears a stuck captcha flag", () => {
    const ctx = makeCtx();
    const handle = startWatchdog(ctx, { stuckMs: 999999, captchaMs: 10, tick: 5 });
    ctx.global.captchadetected = true;
    return new Promise((resolve) => {
        setTimeout(() => {
            clearTimeout(handle);
            assert.strictEqual(ctx.global.captchadetected, false);
            setTimeout(() => process.exit(0), 10);
            resolve();
        }, 60);
    });
});
