/**
 * BotContext — explicit dependency-injection container (replaces the old `Object.assign(client, {...})` god object).
 * Modules receive a `ctx` and read dependencies from it; the Discord client is used only as the Discord API.
 */
class BotContext {
    /**
     * @param {Object} deps
     * @param {Object} deps.client - The Discord.js client (Discord API surface).
     * @param {Object} deps.config - Parsed runtime config (config.json + env).
     * @param {Object} deps.logger - The application logger instance.
     * @param {Object} deps.global - Shared runtime state object (`client.global`).
     * @param {Object} deps.state - Event-driven busy-flag state machine (`BotState`).
     * @param {Object} deps.loops - Central loop lifecycle controller.
     * @param {Object} deps.globalutil - Runtime utilities (waitForMessage, waitWhileBusy, getrand, ...).
     * @param {() => Promise<void>} deps.delay - Delay helper.
     * @param {() => string} deps.prefix - Random prefix ("owo"/config prefix) resolver.
     * @param {Object} deps.chalk - chalk instance.
     * @param {Object} deps.child_process - child_process (spawn/exec).
     * @param {Object} deps.notifier - node-notifier.
     * @param {Object} deps.fs - node:fs.
     */
    constructor(deps) {
        this.client = deps.client;
        this.config = deps.config;
        this.logger = deps.logger;
        this.global = deps.global;
        this.state = deps.state;
        this.loops = deps.loops;
        this.globalutil = deps.globalutil;
        this.delay = deps.delay;
        this.prefix = deps.prefix;
        this.chalk = deps.chalk;
        this.child_process = deps.child_process;
        this.notifier = deps.notifier;
        this.fs = deps.fs;
    }
}

module.exports = BotContext;
