const chalk = require("chalk");
const fse = require("fs-extra");
const path = require("node:path");

// Alerts are also mirrored to a rolling file so a hard crash still leaves a
// post-mortem trail. `data/` is gitignored, so no secrets/state leak to git.
const ALERT_LOG_DIR = path.join(__dirname, "../../data/logs");
const ALERT_LOG_PATH = path.join(ALERT_LOG_DIR, "alert.log");

/**
 * Lightweight, in-memory logger with colored console output and optional
 * shutdown dump.
 *
 * Each instance keeps three rolling buffers: `logs` (capped to `logLength` recent
 * non-debug lines), `fullLogs` (every non-debug line when exit-dump is enabled),
 * and `simpleLogs` (the same lines without color, forwarded to the parent cluster
 * process via `process.send` when running as a worker).
 *
 * The buffered `fullLogs` are flushed on shutdown by `dumpExitLog()`, which the
 * process-wide SIGINT handler (registered in `src/core/bootstrap.js`) calls before
 * the process exits — but only when `exitLog` is on.
 */
class Logger {
    /**
     * Construct a logger bound to a context.
     *
     * Reads logging options from `ctx.config.settings.logging`:
     *  - `loglength` — max number of recent lines retained in `logs` (default 16).
     *  - `showlogbeforeexit` + `newlog` — enable the shutdown dump.
     *
     * @param {BotContext} ctx - The bot context; provides `config` and `global.type` (used in log formatting).
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.logs = [];
        this.fullLogs = [];
        this.simpleLogs = [];

        const cfg = ctx?.config?.settings?.logging || {};
        this.logLength = cfg.loglength ?? 16;
        this.exitLog = cfg.showlogbeforeexit && cfg.newlog;
    }

    /**
     * Flush the buffered `fullLogs` to stdout, wrapped in marker lines.
     * No-op unless `exitLog` is enabled and at least one line was captured.
     * Called by the process-wide SIGINT handler in `src/core/bootstrap.js`.
     *
     * @returns {void}
     */
    dumpExitLog() {
        if (this.exitLog && this.fullLogs.length > 0) {
            console.log("//START OF LOG//");
            for (const log of this.fullLogs) console.log(log);
            console.log("//END OF LOG//");
        }
    }

    /**
     * Log an informational (green) message.
     *
     * @param {string} type - High-level category (e.g. "Farm", "Bot").
     * @param {string} module - Sub-system / module name.
     * @param {string} [result=""] - The message body to log.
     * @returns {void}
     */
    info(type, module, result = "") {
        this._log("🟢", type, module, result, "green");
    }

    /**
     * Log a warning (yellow) message.
     *
     * @param {string} type - High-level category.
     * @param {string} module - Sub-system / module name.
     * @param {string} [result=""] - The message body to log.
     * @returns {void}
     */
    warn(type, module, result = "") {
        this._log("🟡", type, module, result, "yellow");
    }

    /**
     * Log an alert (red) message — typically used for errors/conflicts.
     *
     * @param {string} type - High-level category.
     * @param {string} module - Sub-system / module name.
     * @param {string} [result=""] - The message body to log.
     * @returns {void}
     */
    alert(type, module, result = "") {
        this._log("🔴", type, module, result, "red");
        this._appendAlertToFile(type, module, result);
    }

    /**
     * Best-effort mirror of an alert line to `data/logs/alert.log`.
     * Failures are swallowed so logging can never crash the bot.
     *
     * @param {string} type - High-level category.
     * @param {string} module - Sub-system / module name.
     * @param {string} result - The message body.
     * @returns {void}
     */
    _appendAlertToFile(type, module, result) {
        try {
            fse.ensureDirSync(ALERT_LOG_DIR);
            fse.appendFileSync(
                ALERT_LOG_PATH,
                `[${new Date().toLocaleTimeString()}] ${type} >> ` +
                    `${this.ctx.global.type} > ${module} > ${result}\n`,
            );
        } catch (_err) {
            /* logging must never crash the bot */
        }
    }

    /**
     * Log a debug (white) message.
     *
     * Debug lines are intentionally excluded from the rolling `logs`/`fullLogs`
     * buffers and the console; they are only forwarded to the parent process.
     *
     * @param {string|Error} [result=""] - The debug payload (string or Error object).
     * @returns {void}
     */
    debug(result = "") {
        this._log("⚪", "Bot", "Debug", result, "white");
    }

    /**
     * Internal formatter/dispatcher for all log levels.
     *
     * Builds a colorized console line, pushes it into the rolling buffers when the
     * level is not `white` (debug), prints the latest line, and forwards a plain
     * (uncolored) copy to the parent process via `process.send` when available.
     *
     * @param {string} emoji - Status emoji prefix (🟢/🟡/🔴/⚪).
     * @param {string} type - High-level category.
     * @param {string} module - Sub-system / module name.
     * @param {string} result - The message body.
     * @param {keyof typeof chalk} colorName - chalk color name for the message.
     * @returns {void}
     * @sideeffect Mutates `logs`/`fullLogs`/`simpleLogs` and may call `process.send`.
     */
    _log(emoji, type, module, result, colorName) {
        const color = chalk[colorName];
        const time = chalk.white(`[${new Date().toLocaleTimeString()}]`);
        const msg =
            `${time} ${chalk.white(emoji)} ` +
            `${chalk.blue(chalk.bold(type))}${chalk.white(" >> ")}` +
            `${chalk.cyan(chalk.bold(this.ctx.global.type))} > ` +
            `${chalk.magenta(module)} > ${color(result)}`;

        if (colorName !== "white") {
            this.logs.push(msg);
            if (this.exitLog) this.fullLogs.push(msg);
            if (this.logs.length > this.logLength) this.logs.shift();
            this._show();

            const plain =
                `[${new Date().toLocaleTimeString()}] ${emoji} ${type} >> ` +
                `${this.ctx.global.type} > ${module} > ${result}`;
            this.simpleLogs.push(plain);

            if (process.send) {
                process.send({ type: "log", message: plain });
            }
        }
    }

    /**
     * Print the most recent buffered log line to the console.
     * No-op when the buffer is empty.
     *
     * @returns {void}
     */
    _show() {
        if (this.logs.length === 0) return;
        console.log(this.logs[this.logs.length - 1]);
    }

    /**
     * Return the plain (uncolored) log history.
     *
     * @returns {string[]} All captured simple log lines in insertion order.
     */
    getSimpleLog() {
        return this.simpleLogs;
    }
}

module.exports = (ctx) => new Logger(ctx);
