const notifier = require("node-notifier");

/**
 * Display a blocking native desktop notification when a captcha is detected.
 *
 * Uses `node-notifier` to raise a toast notification with a custom icon and
 * sound. The notification is blocking (`wait: true`) so it stays on screen
 * until the user manually dismisses it, prompting them to solve the captcha
 * and resume the bot with the `resume` command in the farm channel.
 *
 * @param {Client} ctx - The Discord ctx instance; used to read the active command prefix.
 * @returns {void} Does not return a value.
 */
module.exports = (ctx) => {
    notifier.notify({
        title: "Captcha Detected!",
        message: `Solve the captcha and type ${ctx.prefix()}resume in farm channel`,
        sound: true,
        wait: true,
        appID: "OwO Farm Bot Stable",
    });
};
