const dotenv = require("dotenv");
dotenv.config();

let DEVELOPER_MODE = process.env.DEV_MODE === "true";
if (!DEVELOPER_MODE) {
    try {
        const os = require("node:os");
        if (os.userInfo().username === "Mido") {
            DEVELOPER_MODE = true;
        }
    } catch (_error) {
        /* os.userInfo() failed, skip */
    }
}

let config;
try {
    if (DEVELOPER_MODE) {
        config = require("../developer/config.json");
    } else {
        config = require("../../config.json");
    }
} catch (_error) {
    console.log(
        "Failed to load developer config, falling back to production config.",
    );
    config = require("../../config.json");
}

if (process.env.MAIN_TOKEN) config.main.token = process.env.MAIN_TOKEN;
if (process.env.MAIN_USERID) config.main.userid = process.env.MAIN_USERID;
if (process.env.WEBHOOK_URL)
    config.settings.captcha.alerttype.webhookurl = process.env.WEBHOOK_URL;

if (!config.settings.owoprefix || config.settings.owoprefix.length <= 0) {
    config.settings.owoprefix = "owo";
}

module.exports = { config, DEVELOPER_MODE };
