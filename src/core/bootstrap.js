/**
 * Process-wide bootstrap for a single cluster worker.
 *
 * Centralizes two global side effects that were previously scattered across
 * bot.js (the `process.emitWarning` override) and logger.js (the SIGINT dump):
 *  - suppress Node's non-DeprecationWarning noise via a `process.emitWarning` override
 *  - on SIGINT, flush buffered logs through `ctx.logger.dumpExitLog()` then exit
 *
 * Called exactly once per worker after the BotContext is built. The SIGINT
 * registration is guarded so repeated or accidental double calls never attach
 * a second listener.
 */

let bootstrapped = false;

function initializeBootstrap(ctx) {
    process.emitWarning = (warning, type) => {
        if (type === "DeprecationWarning") {
            return;
        }
        console.warn(warning);
    };

    if (bootstrapped) return;
    bootstrapped = true;

    process.on("SIGINT", () => {
        ctx.logger?.dumpExitLog?.();
        process.exit(0);
    });
}

module.exports = { initializeBootstrap };
