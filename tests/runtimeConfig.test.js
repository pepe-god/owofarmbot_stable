const { describe, it, mock, beforeEach, afterEach } = require("node:test");
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

    it("env token takes precedence over a config.json token", () => {
        // Seed config.json cache with a (deprecated) token, then confirm the
        // env override wins.
        const configJsonKey = path.resolve(__dirname, "../config.json");
        const original = require.cache[configJsonKey];
        require.cache[configJsonKey] = {
            id: configJsonKey,
            filename: configJsonKey,
            loaded: true,
            exports: {
                main: { token: "config_only_token", userid: "" },
                settings: {
                    owoprefix: "owo",
                    captcha: { alerttype: { webhookurl: "" } },
                },
            },
        };
        process.env.MAIN_TOKEN = "env_wins_token_12345";
        const warnSpy = mock.method(console, "warn");
        clearCache();
        const { config } = require(MODULE_PATH);
        assert.strictEqual(config.main.token, "env_wins_token_12345");
        const warned = warnSpy.mock.calls.some((c) =>
            c.arguments[0]?.includes?.("DEPRECATED"),
        );
        warnSpy.mock.restore();
        if (original === undefined) delete require.cache[configJsonKey];
        else require.cache[configJsonKey] = original;
        clearCache();
        // No deprecation warning because the token came from the env.
        assert.strictEqual(warned, false);
    });

    it("warns with a deprecation notice when a token lives only in config.json", () => {
        const configJsonKey = path.resolve(__dirname, "../config.json");
        const dotenvKey = require.resolve("dotenv", {
            paths: [path.dirname(MODULE_PATH)],
        });
        const originalConfig = require.cache[configJsonKey];
        const originalDotenv = require.cache[dotenvKey];
        require.cache[configJsonKey] = {
            id: configJsonKey,
            filename: configJsonKey,
            loaded: true,
            exports: {
                main: { token: "config_only_token", userid: "" },
                settings: {
                    owoprefix: "owo",
                    captcha: { alerttype: { webhookurl: "" } },
                },
            },
        };
        // Neutralize dotenv so the repo .env does not inject MAIN_TOKEN and
        // mask the deprecation path.
        require.cache[dotenvKey] = {
            id: dotenvKey,
            filename: dotenvKey,
            loaded: true,
            exports: { config: () => ({ parsed: {} }) },
        };
        delete process.env.MAIN_TOKEN;
        const warnSpy = mock.method(console, "warn");
        clearCache();
        require(MODULE_PATH);
        const warned = warnSpy.mock.calls.some((c) =>
            c.arguments[0]?.includes?.("DEPRECATED"),
        );
        warnSpy.mock.restore();
        delete require.cache[configJsonKey];
        delete require.cache[dotenvKey];
        if (originalConfig !== undefined)
            require.cache[configJsonKey] = originalConfig;
        if (originalDotenv !== undefined)
            require.cache[dotenvKey] = originalDotenv;
        clearCache();
        assert.strictEqual(warned, true);
    });
});
