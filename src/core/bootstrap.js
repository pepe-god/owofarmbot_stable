/**
 * Process-wide bootstrap for a single cluster worker: registers a guarded SIGINT log dump (once per worker).
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
