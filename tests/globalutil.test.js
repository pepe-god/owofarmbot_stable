const { describe, it } = require("node:test");
const assert = require("node:assert");

const {
    removeInvisibleChars,
    parseDuration,
    getrand,
    commandrandomizer,
} = require("../src/utils/globalutil");

describe("removeInvisibleChars", () => {
    it("removes control characters (0x00-0x1F)", () => {
        assert.strictEqual(removeInvisibleChars("a\u0000b\u0001c"), "abc");
    });

    it("removes DEL character (0x7F)", () => {
        assert.strictEqual(
            removeInvisibleChars("hello\u007Fworld"),
            "helloworld",
        );
    });

    it("removes zero-width spaces (0x200B-0x200D)", () => {
        assert.strictEqual(
            removeInvisibleChars("a\u200Bb\u200Cc\u200Dd"),
            "abcd",
        );
    });

    it("removes BOM (0xFEFF)", () => {
        assert.strictEqual(removeInvisibleChars("\uFEFFhello"), "hello");
    });

    it("leaves normal text unchanged", () => {
        assert.strictEqual(
            removeInvisibleChars("Hello, World! 123"),
            "Hello, World! 123",
        );
    });

    it("returns empty string for empty input", () => {
        assert.strictEqual(removeInvisibleChars(""), "");
    });

    it("handles mixed invisible and visible characters", () => {
        assert.strictEqual(
            removeInvisibleChars("\u0000A\u200BB\u007FC\uFEFF"),
            "ABC",
        );
    });
});

describe("parseDuration", () => {
    it("parses hours", () => {
        assert.strictEqual(parseDuration("1H"), 3600000);
    });

    it("parses minutes", () => {
        assert.strictEqual(parseDuration("30M"), 1800000);
    });

    it("parses seconds", () => {
        assert.strictEqual(parseDuration("15S"), 15000);
    });

    it("parses days", () => {
        assert.strictEqual(parseDuration("2D"), 172800000);
    });

    it("parses combined duration (1H30M)", () => {
        assert.strictEqual(parseDuration("1H30M"), 5400000);
    });

    it("parses combined duration with all units", () => {
        assert.strictEqual(parseDuration("1H30M15S"), 5415000);
    });

    it("parses multi-digit values", () => {
        assert.strictEqual(parseDuration("12H"), 43200000);
    });

    it("returns 0 for empty string", () => {
        assert.strictEqual(parseDuration(""), 0);
    });

    it("returns 0 for string with no duration patterns", () => {
        assert.strictEqual(parseDuration("abc"), 0);
    });
});

describe("getrand", () => {
    it("returns a number within [min, max)", () => {
        const result = getrand(5, 10);
        assert.ok(result >= 5 && result < 10);
    });

    it("returns a float (not just integer)", () => {
        const result = getrand(1, 2);
        assert.notStrictEqual(result, Math.floor(result));
    });

    it("handles negative ranges", () => {
        const result = getrand(-10, -5);
        assert.ok(result >= -10 && result < -5);
    });
});

describe("commandrandomizer", () => {
    it("returns an element from the array", () => {
        const arr = ["a", "b", "c"];
        const result = commandrandomizer(arr);
        assert.ok(arr.includes(result));
    });

    it("returns undefined for empty array", () => {
        assert.strictEqual(commandrandomizer([]), undefined);
    });

    it("returns the only element for single-element array", () => {
        assert.strictEqual(commandrandomizer(["x"]), "x");
    });
});
