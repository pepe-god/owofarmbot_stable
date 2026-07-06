const notifier = require("node-notifier");

/**
 * Send a native desktop notification when a captcha is detected.
 *
 * Uses node-notifier to display a toast with a custom icon and sound.
 * The notification is blocking (wait: true) so the user must dismiss it.
 *
 * @param {Client} client - The Discord client instance.
 */
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
