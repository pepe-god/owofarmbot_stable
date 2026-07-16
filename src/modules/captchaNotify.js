/**
 * Raise a blocking desktop notification prompting the user to solve the captcha and `resume`.
 * @param {Client} ctx - The Discord ctx instance; provides notifier and prefix.
 * @returns {void}
 */
module.exports = (ctx) => {
    ctx.notifier.notify({
        title: "Captcha Detected!",
        message: `Solve the captcha and type ${ctx.prefix()}resume in farm channel`,
        sound: true,
        wait: true,
        appID: "OwO Farm Bot Stable",
    });
};
