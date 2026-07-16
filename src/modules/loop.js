/**
 * Generic self-rescheduling loop helper shared by the farm modules.
 *
 * Encapsulates the repeated pattern in farm/luck/animals:
 *   waitWhileBusy -> pick a randomized interval -> withRateLimit(run, onSuccess: reschedule)
 *
 * Each caller supplies only what differs: how to build the command content and
 * what to do after sending. The loop lifecycle (idle wait, interval, rate-limit
 * handling, reschedule) lives here once.
 */

const { getrand } = require("../core/globalutil.js");
const { withRateLimit } = require("../services/errors.js");

/**
 * Run one iteration of a self-looping command sender and reschedule.
 *
 * @param {Object} ctx - The bot context.
 * @param {TextChannel} channel - Channel to send commands in.
 * @param {Object} opts
 * @param {string} opts.type - Action type (e.g. "hunt", "pray", "sell").
 * @param {string} opts.key - Rate-limit / schedule key (e.g. "farm:hunt").
 * @param {string} opts.intervalKey - Key into config.interval for min/max bounds.
 * @param {() => string} opts.buildContent - Returns the full command string to send.
 * @param {(ctx: Object, channel: TextChannel, msg: Object) => Promise<void>} [opts.onRun]
 *   Optional extra work after sending (e.g. parse hunt result, increment counter).
 * @param {() => void} [opts.beforeRun] - Optional work run right before sending (e.g. set busy flag).
 * @param {() => void} [opts.onFinally] - Optional cleanup run in finally.
 * @param {string} [opts.logModule] - Module name for log lines (defaults to capitalized type).
 * @param {string} [opts.logType] - Log category (defaults to "Farm").
 * @returns {void} Self-reschedules via ctx.loops.schedule.
 */
async function selfLoop(ctx, channel, opts) {
    const {
        type,
        key,
        intervalKey,
        buildContent,
        onRun,
        beforeRun,
        onFinally,
        logModule,
        logType = "Farm",
    } = opts;

    await ctx.globalutil.waitWhileBusy(ctx);

    const interval = getrand(
        ctx.config.interval[intervalKey].min,
        ctx.config.interval[intervalKey].max,
    );

    const moduleName =
        logModule || type.charAt(0).toUpperCase() + type.slice(1);

    await withRateLimit(ctx, {
        type: logType,
        module: moduleName,
        key,
        run: async () => {
            if (beforeRun) beforeRun();
            const msg = await channel.send({ content: buildContent() });
            if (onRun) await onRun(ctx, channel, msg);
        },
        onFinally,
        onSuccess: () => {
            ctx.loops.schedule(
                () => selfLoop(ctx, channel, opts),
                interval,
                key,
            );
        },
    });
}

module.exports = { selfLoop };
