const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../src/services/runtimeConfig.js");

function clearCache() {
    delete require.cache[MODULE_PATH];
}

describe("runtimeConfig", () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
        clearCache();
    });

    afterEach(() => {
        process.env = { ...savedEnv };
        clearCache();
    });

    it("exports a resolved config and DEVELOPER_MODE flag", () => {
        const { config, DEVELOPER_MODE } = require(MODULE_PATH);
        assert.ok(config && typeof config === "object");
        assert.strictEqual(typeof DEVELOPER_MODE, "boolean");
    });

    it("normalizes owoprefix to a non-empty string", () => {
        const { config } = require(MODULE_PATH);
        assert.strictEqual(typeof config.settings.owoprefix, "string");
        assert.ok(config.settings.owoprefix.length > 0);
    });

    it("applies MAIN_TOKEN .env override", () => {
        process.env.MAIN_TOKEN = "env_token_value_12345";
        clearCache();
        const { config } = require(MODULE_PATH);
        assert.strictEqual(config.main.token, "env_token_value_12345");
    });

    it("applies MAIN_USERID .env override", () => {
        process.env.MAIN_USERID = "env_user_id_999";
        clearCache();
        const { config } = require(MODULE_PATH);
        assert.strictEqual(config.main.userid, "env_user_id_999");
    });

    it("applies WEBHOOK_URL .env override", () => {
        process.env.WEBHOOK_URL = "https://discord.com/api/webhooks/env";
        clearCache();
        const { config } = require(MODULE_PATH);
        assert.strictEqual(
            config.settings.captcha.alerttype.webhookurl,
            "https://discord.com/api/webhooks/env",
        );
    });
});
