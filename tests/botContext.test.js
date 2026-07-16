const test = require("node:test");
const assert = require("node:assert");

const BotContext = require("../src/core/botContext.js");

test("BotContext stores every injected dependency", () => {
    const deps = {
        client: { id: 1 },
        config: { a: 1 },
        logger: { info: () => {} },
        global: { paused: false },
        state: { waitUntilIdle: async () => {} },
        loops: { schedule: () => {} },
        globalutil: { getrand: () => 1 },
        delay: async () => {},
        prefix: () => "owo",
        chalk: {},
        child_process: {},
        notifier: {},
        fs: {},
    };
    const ctx = new BotContext(deps);
    assert.strictEqual(ctx.client, deps.client);
    assert.strictEqual(ctx.config, deps.config);
    assert.strictEqual(ctx.logger, deps.logger);
    assert.strictEqual(ctx.global, deps.global);
    assert.strictEqual(ctx.state, deps.state);
    assert.strictEqual(ctx.loops, deps.loops);
    assert.strictEqual(ctx.globalutil, deps.globalutil);
    assert.strictEqual(ctx.delay, deps.delay);
    assert.strictEqual(ctx.prefix, deps.prefix);
    assert.strictEqual(ctx.chalk, deps.chalk);
    assert.strictEqual(ctx.child_process, deps.child_process);
    assert.strictEqual(ctx.notifier, deps.notifier);
    assert.strictEqual(ctx.fs, deps.fs);
});

test("BotContext exposes a stable API surface", () => {
    const ctx = new BotContext({ client: {}, config: {}, logger: {}, global: {}, state: {}, loops: {}, globalutil: {}, delay: () => {}, prefix: () => "", chalk: {}, child_process: {}, notifier: {}, fs: {} });
    const keys = ["client", "config", "logger", "global", "state", "loops", "globalutil", "delay", "prefix", "chalk", "child_process", "notifier", "fs"];
    for (const k of keys) assert.ok(k in ctx, `missing ${k}`);
});
