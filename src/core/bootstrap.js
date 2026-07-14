/**
 * Process-wide bootstrap for a single cluster worker.
 *
 * Centralizes one global side effect (the SIGINT log dump). Previously this
 * module also overrode `process.emitWarning` to suppress Node's warnings;
 * that is removed so all warnings (including DeprecationWarning) reach the
 * operator intact — silencing them only masked real issues.
 *
 * Called exactly once per worker after the BotContext is built. The SIGINT
 * registration is guarded so repeated or accidental double calls never attach
 * a second listener.
 */

let bootstrapped = false;

function initializeBootstrap(ctx) {
    if (bootstrapped) return;
    bootstrapped = true;

    process.on("SIGINT", () => {
        ctx.logger?.dumpExitLog?.();
        process.exit(0);
    });
}

module.exports = { initializeBootstrap };
