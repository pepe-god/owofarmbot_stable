const { describe, it } = require("node:test");
const assert = require("node:assert");

const {
    removeInvisibleChars,
    getrand,
    commandrandomizer,
    waitWhileBusy,
} = require("../src/core/globalutil");
const { BotState } = require("../src/services/botState.js");

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

describe("waitWhileBusy", () => {
    it("resolves immediately when the state is idle", async () => {
        const ctx = { state: new BotState() };
        await waitWhileBusy(ctx);
        assert.ok(true);
    });

    it("resolves via state event when the last flag clears (no polling)", async () => {
        const state = new BotState({ paused: true });
        const ctx = {
            state,
            // If waitWhileBusy fell back to polling, delay would be called.
            delay: () => {
                throw new Error("should not poll when state is available");
            },
        };
        const p = waitWhileBusy(ctx);
        setImmediate(() => state.resume());
        await p;
        assert.strictEqual(state.isBusy(), false);
    });

    it("falls back to polling ctx.global when no state machine is present", async () => {
        let calls = 0;
        const global = { paused: true };
        const ctx = {
            global,
            delay: async () => {
                calls++;
                // Clear the flag after the first poll so the loop exits.
                global.paused = false;
            },
        };
        await waitWhileBusy(ctx);
        assert.strictEqual(calls, 1);
    });
});
