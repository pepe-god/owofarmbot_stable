/**
 * Handler aggregator.
 *
 * Loads and wires the three core subsystems:
 *  - antiCrash: global process error listeners
 *  - commandHandler: registers slash/text commands
 *  - eventHandler: binds Discord events to the client
 *
 * @param {Client} client - The Discord client instance.
 */
module.exports = (client) => {
    require("./antiCrash")(client);
    require("./commandHandler")(client);
    require("./eventHandler")(client);
};
