/**
 * Structured error hierarchy for the bot.
 *
 * Every subsystem wraps raw failures (Discord API errors, send failures,
 * captcha failures) into one of these classes so they can be classified by
 * the `type` (feature, e.g. "Farm") and `module` (subsystem, e.g. "Hunt")
 * fields instead of being matched against free-form message strings.
 *
 * The self-looping modules catch errors, classify them through
 * {@link toBotError}/{@link handleModuleError}, log them, and reschedule. They
 * deliberately do not re-throw: throwing from inside a `finally` reschedule
 * would break the loop. Classification (not re-throwing) is what lets the
 * anti-crash handler in `src/core/index.js` and the modules themselves respond
 * differently per error kind.
 *
 * Subclasses:
 *  - `ConfigError` — fatal configuration problems (bot exits via configSchema).
 *  - `CaptchaError` — captcha detection/solving failures.
 *  - `RateLimitError` — Discord rate-limit hits; carries retry metadata and an
 *    exponential-backoff helper so loops can back off instead of hammering.
 */

// Exponential backoff parameters for rate-limit recovery (ms).
const RATE_LIMIT_BASE_MS = 5000;
const RATE_LIMIT_FACTOR = 2;
const RATE_LIMIT_CAP_MS = 320000;

// HTTP status / Discord codes that indicate a rate limit.
const RATE_LIMIT_CODES = new Set([429]);

// Substrings that reliably appear in Discord rate-limit error messages.
const RATE_LIMIT_PATTERNS = [
    /you are being rate limited/i,
    /rate limit/i,
    /too many requests/i,
];

/**
 * Base class for all structured bot errors.
 *
 * @extends Error
 */
class BotError extends Error {
    /**
     * @param {string} type - High-level feature (e.g. "Farm", "Quest").
     * @param {string} module - Subsystem that raised the error (e.g. "Hunt").
     * @param {string} message - Human-readable description.
     * @param {{ cause?: unknown }} [options] - Optional error cause for chaining.
     */
    constructor(type, module, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = this.constructor.name;
        this.type = type;
        this.module = module;
    }
}

/**
 * Fatal configuration error (missing/invalid config). Surfaced by
 * `configSchema.js`; the bot terminates once these are detected.
 *
 * @extends BotError
 */
class ConfigError extends BotError {}

/**
 * Captcha detection or solving failure.
 *
 * @extends BotError
 */
class CaptchaError extends BotError {}

/**
 * Discord rate-limit hit. Carries an optional `retryAfter` (ms) reported by
 * Discord so callers can inspect the original rate-limit duration.
 * Backoff logic lives in {@link nextRateLimitDelay} which manages external
 * attempt counters on `ctx.global.temp.rateLimit`.
 *
 * @extends BotError
 */
class RateLimitError extends BotError {
    /**
     * @param {string} type - High-level feature.
     * @param {string} module - Subsystem that raised the error.
     * @param {string} message - Human-readable description.
     * @param {{ cause?: unknown, retryAfter?: number }} [options]
     */
    constructor(type, module, message, options = {}) {
        super(type, module, message, options);
        this.retryAfter = options.retryAfter ?? 0;
    }
}

/**
 * Detect whether a raw error represents a Discord rate limit.
 *
 * Recognizes already-wrapped `RateLimitError`s, HTTP 429 status codes, and the
 * common rate-limit message substrings emitted by discord.js-selfbot-v13.
 *
 * @param {unknown} err - The caught error.
 * @returns {boolean} True if the error looks like a rate limit.
 */
function isRateLimitError(err) {
    if (err instanceof RateLimitError) return true;
    if (!err || typeof err !== "object") return false;
    const code = err.code ?? err.status ?? err.httpStatus;
    if (RATE_LIMIT_CODES.has(code)) return true;
    const message = typeof err.message === "string" ? err.message : String(err);
    return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
}

/**
 * Wrap a raw caught error into the most specific `BotError` subclass.
 *
 * Rate-limit errors become `RateLimitError` (carrying Discord's `retryAfter`),
 * everything else becomes a plain `BotError`. The original error is preserved
 * as `cause` for stack chaining.
 *
 * @param {unknown} err - The raw caught error.
 * @param {string} type - High-level feature name.
 * @param {string} module - Subsystem name.
 * @param {string} fallback - Prefix describing what failed (e.g. "Error while hunting").
 * @returns {BotError} The wrapped, classified error.
 */
function toBotError(err, type, module, fallback) {
    const message = `${fallback}: ${err?.message ? err.message : String(err)}`;
    if (isRateLimitError(err)) {
        const retryAfter =
            typeof err.retryAfter === "number" ? err.retryAfter * 1000 : 0;
        return new RateLimitError(type, module, message, {
            cause: err,
            retryAfter,
        });
    }
    return new BotError(type, module, message, { cause: err });
}

/**
 * Classify a caught error and log it through the ctx logger.
 *
 * Use inside module `catch` blocks to replace raw `ctx.logger.alert(...)`
 * logging with typed, classified errors while preserving the same log volume.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context (logger + global).
 * @param {unknown} err - The raw caught error.
 * @param {Object} meta - Classification metadata.
 * @param {string} meta.type - High-level feature name.
 * @param {string} meta.module - Subsystem name.
 * @param {string} meta.fallback - Prefix describing what failed.
 * @returns {BotError} The wrapped, classified error (for instanceof checks).
 */
function handleModuleError(ctx, err, { type, module, fallback }) {
    const wrapped = toBotError(err, type, module, fallback);
    ctx.logger.alert(type, module, wrapped.message);
    ctx.logger.debug(wrapped);
    return wrapped;
}

/**
 * Classification label for the anti-crash handler.
 *
 * @param {unknown} err - The error to describe.
 * @returns {string} A short "[Class] [type > module]" or "Unclassified" label.
 */
function describeError(err) {
    if (err instanceof BotError) {
        return `${err.name} [${err.type} > ${err.module}]`;
    }
    return "Unclassified";
}

/**
 * Compute the next exponential-backoff delay for a rate-limited loop and
 * persist the attempt counter (keyed per module) on `ctx.global.temp`.
 *
 * Consecutive rate limits for the same key grow the delay; call
 * {@link resetRateLimitBackoff} from the normal (recovered) reschedule path so
 * the counter restarts once the bot sends successfully again.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context.
 * @param {string} key - Stable per-loop key (e.g. "farm:hunt").
 * @returns {number} Backoff delay in milliseconds.
 */
function nextRateLimitDelay(ctx, key) {
    const store = ctx.global.temp.rateLimit;
    if (!store) ctx.global.temp.rateLimit = {};
    const attempt = (ctx.global.temp.rateLimit[key] ?? 0) + 1;
    ctx.global.temp.rateLimit[key] = attempt;
    return Math.min(
        RATE_LIMIT_BASE_MS * RATE_LIMIT_FACTOR ** (attempt - 1),
        RATE_LIMIT_CAP_MS,
    );
}

/**
 * Reset the rate-limit attempt counter for a loop key, typically called from
 * the normal reschedule path once a command sends successfully.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context.
 * @param {string} key - Stable per-loop key (e.g. "farm:hunt").
 * @returns {void}
 */
function resetRateLimitBackoff(ctx, key) {
    const store = ctx.global.temp.rateLimit;
    if (store) store[key] = 0;
}

/**
 * Wrap a module action with rate-limit-aware error handling and rescheduling.
 *
 * Executes `run` inside a try/catch. On rate-limit, reschedules with
 * exponential backoff via {@link nextRateLimitDelay}. On success, calls
 * `onSuccess` so the module can schedule its next normal iteration.
 * An optional `onFinally` runs in the finally block regardless of outcome.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context.
 * @param {Object} opts
 * @param {string} opts.type - Feature type (e.g. "Farm").
 * @param {string} opts.module - Subsystem name (e.g. "Hunt", "Pray").
 * @param {string} opts.key - Rate-limit tracking key (e.g. "farm:hunt").
 * @param {() => Promise<void>} opts.run - The action to execute.
 * @param {() => void} opts.onSuccess - Called on success (schedule next run).
 * @param {() => void} [opts.onFinally] - Optional cleanup that always runs.
 * @returns {Promise<void>}
 */
async function withRateLimit(ctx, opts) {
    const { type, module, key, run, onSuccess, onFinally = () => {} } = opts;
    let rateLimited = false;
    try {
        await run();
    } catch (err) {
        const wrapped = handleModuleError(ctx, err, {
            type,
            module,
            fallback: `Error while ${module.toLowerCase()}ing`,
        });
        if (wrapped instanceof RateLimitError) {
            rateLimited = true;
            const delay = nextRateLimitDelay(ctx, key);
            ctx.logger.warn(
                type,
                module,
                `Rate limited, backing off ${delay}ms before retry.`,
            );
            // Re-enter through withRateLimit so subsequent retries also get
            // error classification, backoff, and cleanup. The call goes through
            // setTimeout (via ctx.loops.schedule) so there's no deep recursion.
            ctx.loops.schedule(
                () => withRateLimit(ctx, opts),
                delay,
                `${key}:ratelimit`,
            );
        }
    } finally {
        onFinally();
        if (!rateLimited) {
            resetRateLimitBackoff(ctx, key);
            onSuccess();
        }
    }
}

module.exports = {
    BotError,
    ConfigError,
    CaptchaError,
    RateLimitError,
    isRateLimitError,
    toBotError,
    handleModuleError,
    describeError,
    nextRateLimitDelay,
    resetRateLimitBackoff,
    withRateLimit,
    RATE_LIMIT_BASE_MS,
    RATE_LIMIT_FACTOR,
    RATE_LIMIT_CAP_MS,
};
