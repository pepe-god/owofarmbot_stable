const test = require("node:test");
const assert = require("node:assert");

const LoopManager = require("../src/services/loopManager.js");

test("tryStart returns true exactly once", () => {
    const lm = new LoopManager();
    assert.strictEqual(lm.tryStart(), true);
    assert.strictEqual(lm.tryStart(), false);
    assert.strictEqual(lm.tryStart(), false);
});

test("schedule registers a timer and runs the callback", async () => {
    const lm = new LoopManager();
    let ran = false;
    lm.schedule(() => { ran = true; }, 5, "test");
    assert.strictEqual(lm.timers.size, 1);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(ran);
    assert.strictEqual(lm.timers.size, 0);
});

test("stopAll cancels pending timers", async () => {
    const lm = new LoopManager();
    let ran = false;
    lm.schedule(() => { ran = true; }, 10000, "long");
    assert.strictEqual(lm.timers.size, 1);
    const cleared = lm.stopAll();
    assert.strictEqual(cleared, 1);
    assert.strictEqual(lm.timers.size, 0);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(!ran);
});
