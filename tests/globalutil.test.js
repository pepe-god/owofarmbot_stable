const test = require("node:test");
const assert = require("node:assert");

const util = require("../src/core/globalutil.js");

test("capitalize uppercases the first character only", () => {
    assert.strictEqual(util.capitalize("hunt"), "Hunt");
    assert.strictEqual(util.capitalize("battle"), "Battle");
    assert.strictEqual(util.capitalize(""), "");
});

test("commandrandomizer returns an element from the array", () => {
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
        assert.ok(arr.includes(util.commandrandomizer(arr)));
    }
});

test("getrand stays within [min, max)", () => {
    for (let i = 0; i < 100; i++) {
        const v = util.getrand(10, 20);
        assert.ok(v >= 10 && v < 20);
    }
});

test("removeInvisibleChars strips zero-width and control chars", () => {
    const dirty = "h" + "\u200B" + "e" + "\u200C" + "l" + "\u200D" + "l" + "\u0007" + "o";
    assert.strictEqual(util.removeInvisibleChars(dirty), "hello");
});

test("waitWhileBusy resolves immediately when state has no flags set", async () => {
    const ctx = { state: { waitUntilIdle: async () => {} } };
    await util.waitWhileBusy(ctx);
    assert.ok(true);
});
