const { describe, it, mock, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert");

// Reset sigintRegistered between test runs by requiring a fresh copy
delete require.cache[require.resolve("../src/services/logger")];
const createLogger = require("../src/services/logger");

function makeClient(overrides = {}) {
    return {
        config: {
            settings: {
                logging: {
                    loglength: 16,
                    showlogbeforeexit: false,
                    newlog: false,
                },
            },
        },
        global: { type: "test" },
        ...overrides,
    };
}

describe("Logger", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it("uses default logLength when client has no logging config", () => {
        const logger = createLogger({ global: { type: "test" } });
        assert.strictEqual(logger.logLength, 16);
        assert.ok(!logger.exitLog);
    });

    it("uses provided logging config", () => {
        const client = makeClient();
        client.config.settings.logging.loglength = 5;
        client.config.settings.logging.showlogbeforeexit = true;
        client.config.settings.logging.newlog = true;
        const logger = createLogger(client);
        assert.strictEqual(logger.logLength, 5);
        assert.strictEqual(logger.exitLog, true);
    });

    it("info stores a log entry with correct type and module", () => {
        const logger = createLogger(makeClient());
        logger.info("Bot", "Startup", "test message");
        assert.strictEqual(logger.logs.length, 1);
        const entry = logger.logs[0];
        assert.ok(entry.includes("Bot"));
        assert.ok(entry.includes("Startup"));
        assert.ok(entry.includes("test message"));
    });

    it("warn stores a log entry", () => {
        const logger = createLogger(makeClient());
        logger.warn("Bot", "Test", "warning");
        assert.strictEqual(logger.logs.length, 1);
    });

    it("alert stores a log entry", () => {
        const logger = createLogger(makeClient());
        logger.alert("Farm", "Hunt", "error!");
        assert.strictEqual(logger.logs.length, 1);
        assert.ok(logger.logs[0].includes("Farm"));
        assert.ok(logger.logs[0].includes("error!"));
    });

    it("debug does NOT store a log entry", () => {
        const logger = createLogger(makeClient());
        logger.debug("debug only");
        assert.strictEqual(logger.logs.length, 0);
    });

    it("respects logLength limit", () => {
        const client = makeClient();
        client.config.settings.logging.loglength = 3;
        const logger = createLogger(client);

        logger.info("A", "M1", "1");
        logger.info("A", "M2", "2");
        logger.info("A", "M3", "3");
        logger.info("A", "M4", "4");

        assert.strictEqual(logger.logs.length, 3);
        assert.ok(logger.logs[0].includes("M2"));
        assert.ok(logger.logs[2].includes("M4"));
    });

    it("push to fullLogs when exitLog is true", () => {
        const client = makeClient();
        client.config.settings.logging.showlogbeforeexit = true;
        client.config.settings.logging.newlog = true;
        const logger = createLogger(client);

        logger.info("Bot", "Test", "log me");
        assert.strictEqual(logger.fullLogs.length, 1);
    });

    it("does NOT push to fullLogs when exitLog is false", () => {
        const logger = createLogger(makeClient());
        logger.info("Bot", "Test", "no full");
        assert.strictEqual(logger.fullLogs.length, 0);
    });

    it("getSimpleLog returns logged messages in plain format", () => {
        const logger = createLogger(makeClient());
        logger.info("Bot", "Test", "simple");
        const simple = logger.getSimpleLog();
        assert.strictEqual(simple.length, 1);
        assert.ok(simple[0].includes("Bot >> test > Test > simple"));
    });

    it("sends IPC message when process.send is available", () => {
        const logs = [];
        process.send = (msg) => logs.push(msg);
        const logger = createLogger(makeClient());

        logger.info("Bot", "IPC", "test");
        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].type, "log");
        assert.ok(logs[0].message.includes("IPC > test"));

        delete process.send;
    });
});

describe("Logger SIGINT registration", () => {
    // Fresh module to test SIGINT registration in isolation
    beforeEach(() => {
        delete require.cache[require.resolve("../src/services/logger")];
    });

    it("registers SIGINT listener on first instance", () => {
        const createLogger = require("../src/services/logger");
        const before = process.listeners("SIGINT").length;
        createLogger(makeClient());
        assert.strictEqual(process.listeners("SIGINT").length, before + 1);
    });

    it("does NOT add duplicate listener on second instance", () => {
        const createLogger = require("../src/services/logger");
        createLogger(makeClient());
        const afterFirst = process.listeners("SIGINT").length;

        createLogger(makeClient());
        assert.strictEqual(process.listeners("SIGINT").length, afterFirst);
    });
});
