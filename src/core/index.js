/**
 * Consolidated handler entry point.
 *
 * Loads and wires the three core runtime subsystems in order:
 *  1. Anti-crash — global process error listeners
 *  2. Command registration — discovers and registers text/slash commands
 *  3. Event binding — attaches Discord event handlers to the ctx
 *
 * @param {Client} ctx - The Discord ctx instance.
 */

/**
 * Install global process-level error listeners.
 *
 * Catches unhandled promise rejections and uncaught exceptions,
 * logging them through the ctx's logger before the process exits.
 */
const setupAntiCrash = (ctx) => {
    const logError = (type, err, origin = null) => {
        const errMessage = `--------------------------------------
Error: ${err?.message || err}
Stack: ${err?.stack || "No stack trace available"}
Origin: ${origin || "N/A"}
--------------------------------------`;

        ctx.logger.alert(
            "Bot",
            "Anticrash",
            `An crash happened! ${type}\n${errMessage}`,
        );
    };

    process.on("unhandledRejection", (reason, p) => {
        logError("Unhandled Rejection", reason, p);
    });

    process.on("uncaughtException", (err, origin) => {
        logError("Uncaught Exception", err, origin);
    });
};

/**
 * Register a single command file.
 *
 * Supports both single-command and multi-command exports (arrays).
 * Registers aliases if present.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {Function|Function[]} pull - Exported command(s) from file.
 */
const registerCommand = (ctx, pull) => {
    const list = Array.isArray(pull) ? pull : [pull];
    for (const cmd of list) {
        if (!cmd.config?.name) continue;
        ctx.client.commands.set(cmd.config.name, cmd);
        if (cmd.config.aliases)
            for (const a of cmd.config.aliases)
                ctx.client.aliases.set(a, cmd.config.name);
    }
};

/**
 * Discover and register all commands/events from src/core/.
 */
const registerCommands = (ctx) => {
    // These files are infrastructure (loader, helpers, standalone CLIs),
    // not commands or events, so they must be skipped during discovery.
    const EXCLUDE = new Set([
        "index.js",
        "globalutil.js",
        "captcha.js",
        "autovote.js",
    ]);
    // Scan the core directory and keep only plain .js modules.
    const files = ctx.fs
        .readdirSync(__dirname)
        .filter((d) => d.endsWith(".js") && !EXCLUDE.has(d));
    for (const file of files) {
        try {
            const pull = require(`./${file}`);
            // A module exporting a function is treated as an event handler
            // (event name = filename). Anything else is command definitions.
            if (typeof pull === "function") {
                bindEvent(ctx, file, pull);
            } else {
                registerCommand(ctx, pull);
            }
        } catch (err) {
            ctx.logger.alert(
                "Handler",
                "Discovery",
                `Failed to load ${file}: ${err.message}`,
            );
        }
    }
};

/**
 * Bind a single event file to the ctx.
 * The event name is derived from the filename (without .js).
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {string} file - Event filename (e.g. "messageCreate.js").
 * @param {Function} evt - Exported handler function from the event module.
 */
const bindEvent = (ctx, file, evt) => {
    const eName = file.split(".")[0];
    ctx.client.on(eName, evt.bind(null, ctx));
};

/**
 * Master entry point for the handler system.
 *
 * Executes all three setup phases in order:
 *  1. Anti-crash listeners
 *  2. Command registration
 *  3. Event binding
 */
module.exports = (ctx) => {
    setupAntiCrash(ctx);
    registerCommands(ctx);
};
