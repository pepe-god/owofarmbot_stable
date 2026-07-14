const { describe, it } = require("node:test");
const assert = require("node:assert");

const {
    BotError,
    ConfigError,
    CaptchaError,
    RateLimitError,
    isRateLimitError,
    toBotError,
    describeError,
    nextRateLimitDelay,
    resetRateLimitBackoff,
    RATE_LIMIT_BASE_MS,
    RATE_LIMIT_FACTOR,
} = require("../src/services/errors.js");

describe("errors", () => {
    describe("BotError", () => {
        it("captures type, module, message and cause", () => {
            const cause = new Error("underlying");
            const err = new BotError("Farm", "Hunt", "Test error", { cause });
            assert.strictEqual(err.type, "Farm");
            assert.strictEqual(err.module, "Hunt");
            assert.strictEqual(err.message, "Test error");
            assert.strictEqual(err.cause, cause);
            assert.strictEqual(err.name, "BotError");
        });
    });

    describe("ConfigError", () => {
        it("extends BotError", () => {
            const err = new ConfigError("Bot", "Config", "Bad config");
            assert(err instanceof BotError);
            assert.strictEqual(err.type, "Bot");
            assert.strictEqual(err.module, "Config");
            assert.strictEqual(err.name, "ConfigError");
        });
    });

    describe("CaptchaError", () => {
        it("extends BotError", () => {
            const err = new CaptchaError("Bot", "Captcha", "Solve failed");
            assert(err instanceof BotError);
            assert.strictEqual(err.type, "Bot");
            assert.strictEqual(err.module, "Captcha");
            assert.strictEqual(err.name, "CaptchaError");
        });
    });

    describe("RateLimitError", () => {
        it("stores retryAfter", () => {
            const err = new RateLimitError("Farm", "Hunt", "Rate limited", {
                retryAfter: 30,
            });
            assert.strictEqual(err.retryAfter, 30);
        });
    });

    describe("isRateLimitError", () => {
        it("returns true for RateLimitError instance", () => {
            const err = new RateLimitError("Farm", "Hunt", "Rate limited");
            assert.strictEqual(isRateLimitError(err), true);
        });

        it("returns true for HTTP 429 code", () => {
            const err = { code: 429, message: "Too many requests" };
            assert.strictEqual(isRateLimitError(err), true);
        });

        it("returns true for rate limit message pattern", () => {
            const err = {
                message:
                    "You are being rate limited for requesting too many tokens",
            };
            assert.strictEqual(isRateLimitError(err), true);
        });

        it("returns false for other errors", () => {
            const err = { message: "Some other error" };
            assert.strictEqual(isRateLimitError(err), false);
        });

        it("returns false for null/undefined", () => {
            assert.strictEqual(isRateLimitError(null), false);
            assert.strictEqual(isRateLimitError(undefined), false);
        });
    });

    describe("toBotError", () => {
        it("wraps rate limit errors as RateLimitError", () => {
            const err = { code: 429, message: "Too many requests" };
            const wrapped = toBotError(
                err,
                "Farm",
                "Hunt",
                "Error while hunting",
            );
            assert(wrapped instanceof RateLimitError);
            assert.strictEqual(wrapped.type, "Farm");
            assert.strictEqual(wrapped.module, "Hunt");
            assert(wrapped.message.includes("Error while hunting"));
            assert(wrapped.message.includes("Too many requests"));
        });

        it("wraps other errors as BotError", () => {
            const err = { message: "Network error" };
            const wrapped = toBotError(
                err,
                "Farm",
                "Quest",
                "Error while questing",
            );
            assert(wrapped instanceof BotError);
            assert(!(wrapped instanceof RateLimitError));
        });

        it("uses String(err) for non-object errors", () => {
            const err = "plain string error";
            const wrapped = toBotError(err, "Bot", "Test", "Fallback");
            assert.strictEqual(wrapped.message, "Fallback: plain string error");
        });
    });

    describe("describeError", () => {
        it("returns classified label for BotError", () => {
            const err = new BotError("Farm", "Hunt", "Error");
            assert.strictEqual(describeError(err), "BotError [Farm > Hunt]");
        });

        it("returns classified label for RateLimitError", () => {
            const err = new RateLimitError("Farm", "Slot", "Rate limited");
            assert.strictEqual(
                describeError(err),
                "RateLimitError [Farm > Slot]",
            );
        });

        it("returns Unclassified for non-BotError", () => {
            const err = new Error("Generic error");
            assert.strictEqual(describeError(err), "Unclassified");
        });
    });

    describe("nextRateLimitDelay", () => {
        it("increments attempt counter per key, bounded by cap", () => {
            const ctx = {
                global: { temp: {} },
            };
            const key = "test:hunt";

            const d1 = nextRateLimitDelay(ctx, key);
            assert.strictEqual(d1, RATE_LIMIT_BASE_MS); // 5000

            const d2 = nextRateLimitDelay(ctx, key);
            assert.strictEqual(d2, RATE_LIMIT_BASE_MS * RATE_LIMIT_FACTOR); // 10000

            const d3 = nextRateLimitDelay(ctx, key);
            assert.strictEqual(d3, RATE_LIMIT_BASE_MS * 4); // 20000
        });

        it("keeps separate counters per key", () => {
            const ctx = {
                global: { temp: {} },
            };
            nextRateLimitDelay(ctx, "key1");
            const d1 = nextRateLimitDelay(ctx, "key1");
            const d2 = nextRateLimitDelay(ctx, "key2");
            assert.strictEqual(d1, RATE_LIMIT_BASE_MS * RATE_LIMIT_FACTOR);
            assert.strictEqual(d2, RATE_LIMIT_BASE_MS); // starts fresh
        });
    });

    describe("resetRateLimitBackoff", () => {
        it("resets attempt counter for a key", () => {
            const ctx = {
                global: { temp: { rateLimit: { "test:key": 5 } } },
            };
            resetRateLimitBackoff(ctx, "test:key");
            assert.strictEqual(ctx.global.temp.rateLimit["test:key"], 0);
        });
    });
});
