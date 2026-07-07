/* eslint-disable no-unused-vars */

/**
 * Entry point for OwO Farm Bot Stable.
 *
 * Responsibilities:
 *  - Suppress Node deprecation warnings to keep startup output clean.
 *  - Auto-install any missing npm dependencies declared in package.json.
 *  - Fork a child worker process via Node's cluster module so the bot
 *    can automatically restart on crash without external supervision.
 */

process.emitWarning = (warning, type) => {
    if (type === "DeprecationWarning") {
        return;
    }
    console.warn(warning);
};

const cp = require("node:child_process");

const packageJson = require("../package.json");

// auto install dependencies
for (const dep of Object.keys(packageJson.dependencies)) {
    try {
        require.resolve(dep);
    } catch (_err) {
        console.log(`Installing dependencies...`);
        try {
            cp.execSync(`npm install ${dep}`, { stdio: "inherit" });
        } catch (installErr) {
            console.error(`Failed to install ${dep}:`, installErr.message);
        }
    }
}

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
