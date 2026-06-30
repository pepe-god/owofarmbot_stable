module.exports = (client) => {
    require("./antiCrash")(client);
    require("./commandHandler")(client);
    require("./eventHandler")(client);
};
