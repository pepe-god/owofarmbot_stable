/**
 * Reads the command files from the './commands/' directory and filters out only the JavaScript files.
 *
 * @constant {string[]} commands - An array of filenames that end with '.js' in the './commands/' directory.
 */

module.exports = async (client) => {
    const files = client.fs
        .readdirSync(`${__dirname}/../commands/`)
        .filter((d) => d.endsWith(".js"));
    for (const file of files) {
        registerCommand(client, file);
    }
};

function registerCommand(client, file) {
    try {
        const pull = require(`../commands/${file}`);
        const list = Array.isArray(pull) ? pull : [pull];
        for (const cmd of list) {
            if (!cmd.config?.name) continue;
            client.commands.set(cmd.config.name, cmd);
            if (cmd.config.aliases)
                for (const a of cmd.config.aliases)
                    client.aliases.set(a, cmd.config.name);
        }
    } catch (err) {
        client.logger.alert(
            "Handler",
            "Commands",
            `Failed to load ${file}: ${err.message}`,
        );
    }
}
