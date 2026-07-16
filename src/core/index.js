/**
 * Consolidated handler entry point: wires anti-crash listeners, command registration, and event binding (in that order).
 * @param {Client} ctx - The Discord ctx instance.
 */

/**
 * Install global process-level error listeners (unhandledRejection, uncaughtException) logged via ctx's logger.
 */
const setupAntiCrash = (ctx) => {
    const { RateLimitError, describeError } = require("../services/errors.js");

    const logError = (type, err, origin = null) => {
        // Sanitize error output: redact anything that looks like a Discord
        // token (segment.segment.segment) to prevent secrets in logs.
        // Sanitize error output: redact anything that looks like a Discord token (segment.segment.segment) to prevent secrets in logs.
        const sanitize = (text) =>
            typeof text === "string"
                ? text.replace(
                      /[a-zA-Z0-9_-]{24,30}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,40}/g,
                      "[REDACTED_TOKEN]",
                  )
                : text;
        const errMessage = `--------------------------------------
Error: ${sanitize(err?.message) || err}
Stack: ${sanitize(err?.stack) || "No stack trace available"}
Origin: ${origin || "N/A"}
Classification: ${describeError(err)}
--------------------------------------`;

        const classified =
            err instanceof RateLimitError
                ? "Rate limited"
                : "An crash happened!";
        ctx.logger.alert(
            "Bot",
            "Anticrash",
            `${classified} (${type})\n${errMessage}`,
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
 * Register a single command file (supports single or array exports; registers aliases if present).
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
const registerCommands = async (ctx) => {
    // Skip infrastructure files (loader, helpers, standalone CLIs) during discovery.
    const EXCLUDE = new Set([
        "index.js",
        "globalutil.js",
        "bot.js",
        "botContext.js",
    ]);
    // Scan the core directory and keep only plain .js modules.
    let files;
    try {
        files = (await ctx.fs.promises.readdir(__dirname)).filter(
            (d) => d.endsWith(".js") && !EXCLUDE.has(d),
        );
    } catch (err) {
        ctx.logger.alert(
            "Handler",
            "Discovery",
            `Failed to read core directory: ${err.message}`,
        );
        return;
    }
    for (const file of files) {
        try {
            const pull = require(`./${file}`);
            // A function export is an event handler (event name = filename); otherwise it's command definitions.
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
 * Bind a single event file to the ctx; event name is derived from the filename (without .js).
 * @param {Client} ctx - The Discord ctx instance.
 * @param {string} file - Event filename (e.g. "messageCreate.js").
 * @param {Function} evt - Exported handler function from the event module.
 */
const bindEvent = (ctx, file, evt) => {
    const eName = file.split(".")[0];
    ctx.client.on(eName, evt.bind(null, ctx));
};

/**
 * Master entry point: runs anti-crash, command registration, then event binding.
 */
module.exports = async (ctx) => {
    setupAntiCrash(ctx);
    await registerCommands(ctx);
};
