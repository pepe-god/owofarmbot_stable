/**
 * BotContext — explicit dependency-injection container.
 *
 * Replaces the previous "god object" pattern where every service was
 * monkeypatched onto the Discord.js client (`Object.assign(client, {...})`).
 * Modules now receive a `BotContext` and read their dependencies from it
 * directly, so the real dependency graph is visible in each module's
 * signature, and the Discord client is used only as the Discord API.
 *
 * Injected services (formerly `client.logger`, `client.global`, ...):
 *   logger, config, global, loops, globalutil, delay, prefix, basic,
 *   chalk, childprocess, notifier, fs, rpc
 *
 * Discord API (formerly `client.channels`, `client.user`, `client.login`, ...):
 *   client — the underlying Discord.js client instance
 */
class BotContext {
    /**
     * @param {Object} deps
     * @param {Object} deps.client - The Discord.js client (Discord API surface).
     * @param {Object} deps.config - Parsed runtime config (config.json + env).
     * @param {Object} deps.basic - Alias of `config.main` (commands/channel ids/token/userid).
     * @param {Object} deps.logger - The application logger instance.
     * @param {Object} deps.global - Shared runtime state object (`client.global`).
     * @param {Object} deps.state - Event-driven busy-flag state machine (`BotState`).
     * @param {Object} deps.loops - Central loop lifecycle controller.
     * @param {Object} deps.globalutil - Runtime utilities (waitForMessage, waitWhileBusy, getrand, ...).
     * @param {() => Promise<void>} deps.delay - Delay helper.
     * @param {() => string} deps.prefix - Random prefix ("owo"/config prefix) resolver.
     * @param {Object} deps.chalk - chalk instance.
     * @param {Object} deps.childprocess - child_process (spawn/exec).
     * @param {Object} deps.notifier - node-notifier.
     * @param {Object} deps.fs - node:fs.
     * @param {Function} deps.rpc - RPC status updater.
     */
    constructor(deps) {
        this.client = deps.client;
        this.config = deps.config;
        this.basic = deps.basic;
        this.logger = deps.logger;
        this.global = deps.global;
        this.state = deps.state;
        this.loops = deps.loops;
        this.globalutil = deps.globalutil;
        this.delay = deps.delay;
        this.prefix = deps.prefix;
        this.chalk = deps.chalk;
        this.childprocess = deps.childprocess;
        this.notifier = deps.notifier;
        this.fs = deps.fs;
        this.rpc = deps.rpc;
    }
}

module.exports = BotContext;
