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
 * anti-crash handler in `src/core/bot.js` and the modules themselves respond
 * differently per error kind.
 *
 * Subclasses:
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

interface BotErrorOptions {
    cause?: unknown;
}

interface RateLimitErrorOptions extends BotErrorOptions {
    retryAfter?: number;
}

import type { CtxWithLogger } from "../core/types.js";

interface HandleModuleMeta {
    type: string;
    module: string;
    fallback: string;
}

/**
 * Base class for all structured bot errors.
 */
export class BotError extends Error {
    type: string;
    module: string;

    /**
     * @param type - High-level feature (e.g. "Farm", "Quest").
     * @param module - Subsystem that raised the error (e.g. "Hunt").
     * @param message - Human-readable description.
     * @param options - Optional error cause for chaining.
     */
    constructor(
        type: string,
        module: string,
        message: string,
        options: BotErrorOptions = {},
    ) {
        super(message, { cause: options.cause });
        this.name = this.constructor.name;
        this.type = type;
        this.module = module;
    }
}

/**
 * Discord rate-limit hit. Carries an optional `retryAfter` (ms) reported by
 * Discord so callers can inspect the original rate-limit duration.
 * Backoff logic lives in {@link nextRateLimitDelay} which manages external
 * attempt counters on `ctx.global.temp.rateLimit`.
 */
export class RateLimitError extends BotError {
    retryAfter: number;

    /**
     * @param type - High-level feature.
     * @param module - Subsystem that raised the error.
     * @param message - Human-readable description.
     * @param options - Optional cause and retryAfter.
     */
    constructor(
        type: string,
        module: string,
        message: string,
        options: RateLimitErrorOptions = {},
    ) {
        super(type, module, message, options);
        this.retryAfter = options.retryAfter ?? 0;
    }
}

/**
 * Detect whether a raw error represents a Discord rate limit.
 *
 * Recognizes already-wrapped `RateLimitError`s, HTTP 429 status codes, and the
 * common rate-limit message substrings emitted by discord.js-selfbot-v13.
 */
function isRateLimitError(err: unknown): boolean {
    if (err instanceof RateLimitError) return true;
    if (!err || typeof err !== "object") return false;
    const code =
        (err as Record<string, unknown>).code ??
        (err as Record<string, unknown>).status ??
        (err as Record<string, unknown>).httpStatus;
    if (RATE_LIMIT_CODES.has(code as number)) return true;
    const message =
        typeof (err as Record<string, unknown>).message === "string"
            ? ((err as Record<string, unknown>).message as string)
            : String(err);
    return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
}

/**
 * Wrap a raw caught error into the most specific `BotError` subclass.
 *
 * Rate-limit errors become `RateLimitError` (carrying Discord's `retryAfter`),
 * everything else becomes a plain `BotError`. The original error is preserved
 * as `cause` for stack chaining.
 */
function toBotError(
    err: unknown,
    type: string,
    module: string,
    fallback: string,
): BotError {
    const errObj = err as Record<string, unknown> | undefined;
    const message = `${fallback}: ${errObj?.message ? String(errObj.message) : String(err)}`;
    if (isRateLimitError(err)) {
        const retryAfter =
            typeof errObj?.retryAfter === "number"
                ? (errObj.retryAfter as number) * 1000
                : 0;
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
 */
export function handleModuleError(
    ctx: CtxWithLogger,
    err: unknown,
    { type, module, fallback }: HandleModuleMeta,
): BotError {
    const wrapped = toBotError(err, type, module, fallback);
    ctx.logger.alert(type, module, wrapped.message);
    ctx.logger.debug(wrapped);
    return wrapped;
}

/**
 * Classification label for the anti-crash handler.
 */
export function describeError(err: unknown): string {
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
 */
export function nextRateLimitDelay(ctx: CtxWithLogger, key: string): number {
    if (!ctx.global.temp.rateLimit) {
        ctx.global.temp.rateLimit = {};
    }
    const store = ctx.global.temp.rateLimit;
    const attempt = (store[key] ?? 0) + 1;
    store[key] = attempt;
    return Math.min(
        RATE_LIMIT_BASE_MS * RATE_LIMIT_FACTOR ** (attempt - 1),
        RATE_LIMIT_CAP_MS,
    );
}

/**
 * Reset the rate-limit attempt counter for a loop key, typically called from
 * the normal reschedule path once a command sends successfully.
 */
export function resetRateLimitBackoff(ctx: CtxWithLogger, key: string): void {
    const store = ctx.global.temp.rateLimit;
    if (store) store[key] = 0;
}

interface WithRateLimitOpts {
    type: string;
    module: string;
    key: string;
    run: () => Promise<void>;
    onSuccess: () => void;
    onFinally?: () => void;
}

/**
 * Wrap a module action with rate-limit-aware error handling and rescheduling.
 *
 * Executes `run` inside a try/catch. On rate-limit, reschedules with
 * exponential backoff via {@link nextRateLimitDelay}. On success, calls
 * `onSuccess` so the module can schedule its next normal iteration.
 * An optional `onFinally` runs in the finally block regardless of outcome.
 */
export async function withRateLimit(
    ctx: CtxWithLogger,
    opts: WithRateLimitOpts,
): Promise<void> {
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
