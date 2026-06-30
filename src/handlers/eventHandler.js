/**
 * Loads event handler files from the specified directory and binds them to the client.
 *
 * @param {string} dirs - The directory name within the 'events' folder to load event handlers from.
 */

module.exports = async (client) => {
    const events = client.fs
        .readdirSync(`${__dirname}/../events/`)
        .filter((d) => d.endsWith(".js"));
    for (const file of events) {
        try {
            const evt = require(`../events/${file}`);
            const eName = file.split(".")[0];
            client.on(eName, evt.bind(null, client));
        } catch (err) {
            client.logger.alert(
                "Handler",
                "Events",
                `Failed to load ${file}: ${err.message}`,
            );
        }
    }
};
