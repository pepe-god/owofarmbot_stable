/**
 * Entry point for OwO Farm Bot Stable.
 *
 * Responsibilities:
 *  - Fork a child worker process via Node's cluster module so the bot
 *    can automatically restart on crash without external supervision.
 *
 * Dependencies are installed with `pnpm install` (see package.json) before
 * running the bot; this file deliberately does NOT auto-install them at
 * runtime.
 */

const cluster = require("node:cluster");

if (cluster.isPrimary) {
    /**
     * Primary process: keep the bot alive by re-forking whenever the
     * worker exits for any reason (crash, unhandled exception, etc.).
     */
    cluster.on("exit", () => {
        console.log("The bot is down, restarting...");
        cluster.fork();
    });

    cluster.fork();
} else {
    /**
     * Worker process: boot the actual bot implementation.
     */
    require("./core/bot.js");
}
