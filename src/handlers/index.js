/**
 * Consolidated handler entry point.
 *
 * Loads and wires the three core runtime subsystems in order:
 *  1. Anti-crash — global process error listeners
 *  2. Command registration — discovers and registers text/slash commands
 *  3. Event binding — attaches Discord event handlers to the client
 *
 * @param {Client} client - The Discord client instance.
 */

/**
 * Install global process-level error listeners.
 *
 * Catches unhandled promise rejections and uncaught exceptions,
 * logging them through the client's logger before the process exits.
 */
const setupAntiCrash = (client) => {
    const logError = (type, err, origin = null) => {
        const errMessage = `--------------------------------------
Error: ${err?.message || err}
Stack: ${err?.stack || "No stack trace available"}
Origin: ${origin || "N/A"}
--------------------------------------`;

        client.logger.alert(
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
 * @param {Client} client - The Discord client instance.
 * @param {Function|Function[]} pull - Exported command(s) from file.
 */
const registerCommand = (client, pull) => {
    const list = Array.isArray(pull) ? pull : [pull];
    for (const cmd of list) {
        if (!cmd.config?.name) continue;
        client.commands.set(cmd.config.name, cmd);
        if (cmd.config.aliases)
            for (const a of cmd.config.aliases)
                client.aliases.set(a, cmd.config.name);
    }
};

/**
 * Discover and register all commands from src/commands/.
 */
const registerCommands = (client) => {
    const files = client.fs
        .readdirSync(`${__dirname}/../commands/`)
        .filter((d) => d.endsWith(".js"));
    for (const file of files) {
        try {
            const pull = require(`../commands/${file}`);
            registerCommand(client, pull);
        } catch (err) {
            client.logger.alert(
                "Handler",
                "Commands",
                `Failed to load ${file}: ${err.message}`,
            );
        }
    }
};

/**
 * Bind a single event file to the client.
 * The event name is derived from the filename (without .js).
 *
 * @param {Client} client - The Discord client instance.
 * @param {string} file - Event filename (e.g. "messageCreate.js").
 * @param {Function} evt - Exported handler function from the event module.
 */
const bindEvent = (client, file, evt) => {
    const eName = file.split(".")[0];
    client.on(eName, evt.bind(null, client));
};

/**
 * Load all event handlers from src/events/ and bind them to the client.
 * Events are triggered by Discord.js when the corresponding action occurs.
 */
const bindEvents = (client) => {
    const events = client.fs
        .readdirSync(`${__dirname}/../events/`)
        .filter((d) => d.endsWith(".js"));
    for (const file of events) {
        try {
            const evt = require(`../events/${file}`);
            bindEvent(client, file, evt);
        } catch (err) {
            client.logger.alert(
                "Handler",
                "Events",
                `Failed to load ${file}: ${err.message}`,
            );
        }
    }
};

/**
 * Master entry point for the handler system.
 *
 * Executes all three setup phases in order:
 *  1. Anti-crash listeners
 *  2. Command registration
 *  3. Event binding
 */
module.exports = (client) => {
    setupAntiCrash(client);
    registerCommands(client);
    bindEvents(client);
};
