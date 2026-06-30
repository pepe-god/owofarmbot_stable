const notifier = require("node-notifier");

module.exports = (client) => {
    notifier.notify({
        title: "Captcha Detected!",
        message: `Solve the captcha and type ${client.prefix()}resume in farm channel`,
        icon: "./assets/captcha.png",
        sound: true,
        wait: true,
        appID: "OwO Farm Bot Stable",
    });
};
