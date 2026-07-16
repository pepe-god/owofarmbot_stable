const test = require("node:test");
const assert = require("node:assert");

const { handleModuleError, describeError, RateLimitError } = require("../src/services/errors.js");

test("handleModuleError wraps rate-limit messages as RateLimitError", () => {
    const ctx = { logger: { alert: () => {}, debug: () => {} } };
    const wrapped = handleModuleError(ctx, new Error("You are being rate limited"), { type: "Farm", module: "Hunt", fallback: "Error while hunting" });
    assert.ok(wrapped instanceof RateLimitError);
    assert.strictEqual(wrapped.type, "Farm");
    assert.strictEqual(wrapped.module, "Hunt");
});

test("handleModuleError wraps other errors without RateLimitError", () => {
    const ctx = { logger: { alert: () => {}, debug: () => {} } };
    const wrapped = handleModuleError(ctx, new Error("boom"), { type: "Farm", module: "Hunt", fallback: "Error while hunting" });
    assert.ok(!(wrapped instanceof RateLimitError));
    assert.strictEqual(wrapped.type, "Farm");
    assert.strictEqual(wrapped.module, "Hunt");
});

test("describeError labels RateLimitError subclasses", () => {
    const err = new RateLimitError("Farm", "Hunt", "x");
    assert.strictEqual(describeError(err), "RateLimitError [Farm > Hunt]");
});

test("describeError returns Unclassified for plain errors", () => {
    assert.strictEqual(describeError(new Error("y")), "Unclassified");
});

test("handleModuleError preserves the original error as cause", () => {
    const ctx = { logger: { alert: () => {}, debug: () => {} } };
    const original = new Error("root cause");
    const wrapped = handleModuleError(ctx, original, { type: "Farm", module: "Hunt", fallback: "Error while hunting" });
    assert.strictEqual(wrapped.cause, original);
});
