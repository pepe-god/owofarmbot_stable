/**
 * Consolidated handler module.
 *
 * Wires all core handler subsystems:
 *  - Anti-crash: global process error listeners
 *  - Command registration: loads slash/text commands
 *  - Event binding: attaches Discord events to the client
 *
 * @param {Client} client - The Discord client instance.
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

const bindEvent = (client, file, evt) => {
    const eName = file.split(".")[0];
    client.on(eName, evt.bind(null, client));
};

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

module.exports = (client) => {
    setupAntiCrash(client);
    registerCommands(client);
    bindEvents(client);
};
