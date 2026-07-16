const test = require("node:test");
const assert = require("node:assert");

const { isJsonFormat, formatStructured } = require("../src/services/structuredLogger.js");

test("isJsonFormat is false by default", () => {
    const prev = process.env.LOG_FORMAT;
    delete process.env.LOG_FORMAT;
    assert.strictEqual(isJsonFormat(), false);
    if (prev !== undefined) process.env.LOG_FORMAT = prev;
});

test("isJsonFormat is true when LOG_FORMAT=json", () => {
    const prev = process.env.LOG_FORMAT;
    process.env.LOG_FORMAT = "json";
    assert.strictEqual(isJsonFormat(), true);
    if (prev !== undefined) process.env.LOG_FORMAT = prev;
    else delete process.env.LOG_FORMAT;
});

test("formatStructured serializes a stable field set", () => {
    const line = formatStructured({
        level: "info",
        type: "Farm",
        module: "Hunt > hunt",
        message: "hello",
        state: "running",
    });
    const obj = JSON.parse(line);
    assert.strictEqual(obj.level, "info");
    assert.strictEqual(obj.type, "Farm");
    assert.strictEqual(obj.state, "running");
    assert.ok(typeof obj.timestamp === "string");
});

test("formatStructured coerces Error messages to string", () => {
    const line = formatStructured({
        level: "alert",
        type: "Bot",
        module: "X",
        message: new Error("boom"),
    });
    const obj = JSON.parse(line);
    assert.ok(obj.message.includes("boom"));
});
