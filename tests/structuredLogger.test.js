const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");

const {
    isJsonFormat,
    formatStructured,
} = require("../src/services/structuredLogger.js");

describe("structuredLogger", () => {
    const original = process.env.LOG_FORMAT;
    afterEach(() => {
        if (original === undefined) delete process.env.LOG_FORMAT;
        else process.env.LOG_FORMAT = original;
    });

    describe("isJsonFormat", () => {
        it("is false when LOG_FORMAT is unset", () => {
            delete process.env.LOG_FORMAT;
            assert.strictEqual(isJsonFormat(), false);
        });

        it("is true when LOG_FORMAT=json (case-insensitive)", () => {
            process.env.LOG_FORMAT = "JSON";
            assert.strictEqual(isJsonFormat(), true);
            process.env.LOG_FORMAT = "json";
            assert.strictEqual(isJsonFormat(), true);
        });

        it("is false for other values", () => {
            process.env.LOG_FORMAT = "text";
            assert.strictEqual(isJsonFormat(), false);
        });
    });

    describe("formatStructured", () => {
        it("produces a single-line JSON object with the expected fields", () => {
            const line = formatStructured({
                level: "info",
                type: "Farm",
                module: "Main > Hunt",
                message: "hello",
                state: "running",
            });
            assert.ok(!line.includes("\n"));
            const obj = JSON.parse(line);
            assert.strictEqual(obj.level, "info");
            assert.strictEqual(obj.type, "Farm");
            assert.strictEqual(obj.module, "Main > Hunt");
            assert.strictEqual(obj.message, "hello");
            assert.strictEqual(obj.state, "running");
            assert.ok(typeof obj.timestamp === "string");
            assert.ok(!Number.isNaN(Date.parse(obj.timestamp)));
        });

        it("serializes Error messages via stack/message", () => {
            const err = new Error("boom");
            const obj = JSON.parse(
                formatStructured({
                    level: "alert",
                    type: "Bot",
                    module: "X",
                    message: err,
                }),
            );
            assert.ok(obj.message.includes("boom"));
        });

        it("defaults state to null and message to empty string", () => {
            const obj = JSON.parse(
                formatStructured({ level: "warn", type: "Bot", module: "X" }),
            );
            assert.strictEqual(obj.state, null);
            assert.strictEqual(obj.message, "");
        });
    });
});
