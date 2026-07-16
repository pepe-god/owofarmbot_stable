const test = require("node:test");
const assert = require("node:assert");

const constants = require("../src/core/constants.js");

test("OWO_ID matches the documented OwO bot id", () => {
    assert.strictEqual(constants.OWO_ID, "408785106942164992");
});

test("DEFAULT_PREFIX is 'owo'", () => {
    assert.strictEqual(constants.DEFAULT_PREFIX, "owo");
});

test("REQUIRED_GEMS contains the three core gems", () => {
    assert.deepStrictEqual(constants.REQUIRED_GEMS, ["gem1", "gem3", "gem4"]);
});

test("GEM_ITEMS maps every required gem to a non-empty code list", () => {
    for (const gem of constants.REQUIRED_GEMS) {
        assert.ok(Array.isArray(constants.GEM_ITEMS[gem]));
        assert.ok(constants.GEM_ITEMS[gem].length > 0);
    }
});

test("RARITY_MAP is ordered weakest -> strongest", () => {
    assert.ok(constants.RARITY_MAP.common < constants.RARITY_MAP.fabled);
    assert.strictEqual(constants.RARITY_MAP.fabled, 7);
});

test("BUSY_FLAGS lists the three state-machine flags", () => {
    assert.deepStrictEqual(constants.BUSY_FLAGS, [
        "paused",
        "captchadetected",
        "inventory",
    ]);
});

test("TOKEN_SHAPE matches a three-segment Discord token", () => {
    assert.ok(constants.TOKEN_SHAPE.test("abc.def.ghi"));
    assert.ok(!constants.TOKEN_SHAPE.test("not-a-token"));
});
