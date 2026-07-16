const test = require("node:test");
const assert = require("node:assert");

const { validateConfig, parseConfigErrors } = require("../src/services/configSchema.js");

function makeCtx(config) {
    const logs = [];
    return {
        config: config || {},
        global: { rareLevel: 0, temp: { animaltype: "" } },
        chalk: { white: (s) => s },
        logger: {
            info: (...a) => logs.push(["info", ...a]),
            warn: (...a) => logs.push(["warn", ...a]),
            alert: (...a) => logs.push(["alert", ...a]),
            debug: () => {},
        },
        _logs: logs,
    };
}

function baseConfig(overrides = {}) {
    return {
        main: {
            token: "abc.def.ghi",
            commands: { hunt: true, battle: false, pray: false, curse: false, animals: false, inventory: true },
            maximum_gem_rarity: "fabled",
        },
        animals: { animaltype: { common: true }, type: { sell: true, sacrifice: false } },
        interval: {
            hunt: { min: 12000, max: 16000 },
            battle: { min: 12000, max: 16000 },
            pray: { min: 316000, max: 332000 },
            animals: { min: 610000, max: 661000 },
        },
        ...overrides,
    };
}

test("validateConfig passes a well-formed config", () => {
    const ctx = makeCtx(baseConfig());
    const { success } = validateConfig(ctx, baseConfig());
    assert.strictEqual(success, true);
});

test("validateConfig fails on a malformed token", () => {
    const ctx = makeCtx(baseConfig());
    const { success } = validateConfig(ctx, baseConfig({ main: { token: "bad", commands: {}, maximum_gem_rarity: "fabled" } }));
    assert.strictEqual(success, false);
});

test("validateConfig fails on a too-short token", () => {
    const ctx = makeCtx(baseConfig());
    const { success } = validateConfig(ctx, baseConfig({ main: { token: "x", commands: {}, maximum_gem_rarity: "fabled" } }));
    assert.strictEqual(success, false);
});

test("checkPrayCurseConflict disables curse when both enabled", () => {
    const ctx = makeCtx(baseConfig());
    const config = baseConfig({
        main: { token: "abc.def.ghi", commands: { hunt: true, pray: true, curse: true }, maximum_gem_rarity: "fabled" },
    });
    validateConfig(ctx, config);
    assert.strictEqual(config.main.commands.curse, false);
});

test("parseConfigErrors logs fatal errors and schedules exit", async () => {
    const ctx = makeCtx(baseConfig());
    const realExit = process.exit;
    let exited = false;
    process.exit = () => { exited = true; };
    parseConfigErrors(["fatal error"], ctx);
    // It should log the error immediately.
    assert.ok(ctx._logs.some((l) => l[0] === "alert" && l[3] === "fatal error"));
    // The exit is scheduled ~2s later; wait for it.
    await new Promise((r) => setTimeout(r, 2100));
    process.exit = realExit;
    assert.ok(exited);
});
