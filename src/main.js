/**
 * Entry point for OwO Farm Bot Stable.
 *
 * Responsibilities:
 *  - Fork a child worker process via Node's cluster module so the bot
 *    can automatically restart on crash without external supervision.
 *  - Guard against a crash-loop: cap the number of forks within a rolling
 *    time window so a persistently-failing worker cannot restart forever.
 *
 * Dependencies are installed with `pnpm install` (see package.json) before
 * running the bot; this file deliberately does NOT auto-install them at
 * runtime.
 */

const cluster = require("node:cluster");

// Rolling-window crash-loop protection. If we fork more than MAX_FORKS times
// within FORK_WINDOW_MS, stop forking and log an error instead of looping.
const FORK_WINDOW_MS = 60000;
const MAX_FORKS = 5;
// Short backoff applied between the first few re-forks to avoid a tight
// restart storm right after a crash.
const REFORK_BACKOFF_MS = 1000;
const REFORK_BACKOFF_LIMIT = 3;

if (cluster.isPrimary) {
    const forkTimestamps = [];

    // True while we are still allowed to fork under the rolling window cap.
    function canFork() {
        const now = Date.now();
        while (
            forkTimestamps.length > 0 &&
            now - forkTimestamps[0] > FORK_WINDOW_MS
        ) {
            forkTimestamps.shift();
        }
        return forkTimestamps.length < MAX_FORKS;
    }

    function forkBot() {
        forkTimestamps.push(Date.now());
        cluster.fork();
    }

    let reforkCount = 0;
    cluster.on("exit", () => {
        console.log("The bot is down, restarting...");
        // Stop restarting once we blow past the fork cap (crash-loop guard).
        if (!canFork()) {
            console.error(
                `[CRASH-LOOP] Stopping auto-restart: ${MAX_FORKS} forks ` +
                    `within ${FORK_WINDOW_MS}ms. Check the logs and fix the ` +
                    `root cause before restarting.`,
            );
            return;
        }
        // Apply a short backoff between the first few re-forks.
        reforkCount++;
        if (reforkCount <= REFORK_BACKOFF_LIMIT) {
            setTimeout(forkBot, REFORK_BACKOFF_MS);
        } else {
            forkBot();
        }
    });

    forkBot();
} else {
    /**
     * Worker process: boot the actual bot implementation.
     */
    require("./core/bot.js");
}
