const test = require("node:test");
const assert = require("node:assert");

const { attachState } = require("../src/services/botState.js");

function makeGlobal() {
    return { paused: false, captchadetected: false, inventory: false };
}

test("attachState binds flags and reflects writes through the state machine", () => {
    const g = makeGlobal();
    const state = attachState(g);
    g.paused = true;
    assert.strictEqual(state.get("paused"), true);
    assert.strictEqual(state.status, "paused");
});

test("status prioritizes captcha over inventory over paused", () => {
    const g = makeGlobal();
    const state = attachState(g);
    g.inventory = true;
    assert.strictEqual(state.status, "inventory");
    g.captchadetected = true;
    assert.strictEqual(state.status, "captcha");
});

test("waitUntilIdle resolves immediately when idle", async () => {
    const g = makeGlobal();
    const state = attachState(g);
    await state.waitUntilIdle();
    assert.ok(true);
});

test("waitUntilIdle resolves once the last flag clears", async () => {
    const g = makeGlobal();
    const state = attachState(g);
    g.paused = true;
    const pending = state.waitUntilIdle();
    g.paused = false;
    await pending;
    assert.ok(true);
});

test("captcha() also pauses the bot", () => {
    const g = makeGlobal();
    const state = attachState(g);
    state.captcha();
    assert.strictEqual(state.get("captchadetected"), true);
    assert.strictEqual(state.get("paused"), true);
});
