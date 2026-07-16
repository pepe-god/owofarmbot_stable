const test = require("node:test");
const assert = require("node:assert");

const { BotState } = require("../src/services/runtime.js");

function makeGlobal() {
    return { paused: false, captchadetected: false, inventory: false };
}

test("BotState.status reflects current global flags", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    assert.strictEqual(state.status, "running");
    g.paused = true;
    assert.strictEqual(state.status, "paused");
});

test("BotState.status prioritizes captcha over inventory over paused", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    g.inventory = true;
    assert.strictEqual(state.status, "inventory");
    g.captchadetected = true;
    assert.strictEqual(state.status, "captcha");
});

test("waitUntilIdle resolves immediately when idle", async () => {
    const g = makeGlobal();
    const state = new BotState(g);
    await state.waitUntilIdle();
    assert.ok(true);
});

test("waitUntilIdle resolves once the last flag clears", async () => {
    const g = makeGlobal();
    const state = new BotState(g);
    g.paused = true;
    const pending = state.waitUntilIdle();
    g.paused = false;
    await pending;
    assert.ok(true);
});

test("captcha() also sets paused flag", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    state.captcha();
    assert.strictEqual(g.captchadetected, true);
    assert.strictEqual(g.paused, true);
});

test("pause() and resume() toggle the paused flag", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    state.pause();
    assert.strictEqual(g.paused, true);
    state.resume();
    assert.strictEqual(g.paused, false);
});

test("startInventory and endInventory toggle the inventory flag", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    state.startInventory();
    assert.strictEqual(g.inventory, true);
    state.endInventory();
    assert.strictEqual(g.inventory, false);
});

test("captchaSolved with autoresume also clears paused", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    state.captcha();
    state.captchaSolved(true);
    assert.strictEqual(g.captchadetected, false);
    assert.strictEqual(g.paused, false);
});

test("captchaSolved without autoresume leaves paused true", () => {
    const g = makeGlobal();
    const state = new BotState(g);
    state.captcha();
    state.captchaSolved(false);
    assert.strictEqual(g.captchadetected, false);
    assert.strictEqual(g.paused, true);
});
