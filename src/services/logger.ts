/**
 * Lightweight, in-memory logger with colored console output and optional
 * shutdown dump.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

// Alerts are also mirrored to a rolling file so a hard crash still leaves a
// post-mortem trail. `data/` is gitignored, so no secrets/state leak to git.
const ALERT_LOG_DIR = path.join(__dirname, "../../data/logs");
const ALERT_LOG_PATH = path.join(ALERT_LOG_DIR, "alert.log");

// Cap the alert file so it can never grow without bound.
const ALERT_LOG_MAX_BYTES = 1024 * 1024;

// When stdout/stderr is a pipe (e.g. launched via a parent process or `|`),
// the reader can close it and any further write throws EPIPE.
for (const stream of [process.stdout, process.stderr]) {
    if (stream && typeof stream.on === "function") {
        stream.on("error", (err: NodeJS.ErrnoException) => {
            if (err && err.code !== "EPIPE") throw err;
        });
    }
}

interface LoggerCtx {
    config?: {
        settings?: {
            logging?: {
                loglength?: number;
                showlogbeforeexit?: boolean;
                newlog?: boolean;
            };
        };
    };
    global: {
        type: string;
    };
}

class Logger {
    private ctx: LoggerCtx;
    logs: string[];
    private fullLogs: string[];
    private logLength: number;
    private exitLog: boolean;

    constructor(ctx: LoggerCtx) {
        this.ctx = ctx;
        this.logs = [];
        this.fullLogs = [];

        const cfg = ctx?.config?.settings?.logging || {};
        this.logLength = cfg.loglength ?? 16;
        this.exitLog = !!(cfg.showlogbeforeexit && cfg.newlog);
    }

    /**
     * Flush the buffered `fullLogs` to stdout, wrapped in marker lines.
     */
    dumpExitLog(): void {
        if (this.exitLog && this.fullLogs.length > 0) {
            console.log("//START OF LOG//");
            for (const log of this.fullLogs) console.log(log);
            console.log("//END OF LOG//");
        }
    }

    info(type: string, module: string, result = ""): void {
        this._log("🟢", type, module, result, "green");
    }

    warn(type: string, module: string, result = ""): void {
        this._log("🟡", type, module, result, "yellow");
    }

    alert(type: string, module: string, result = ""): void {
        this._log("🔴", type, module, result, "red");
        this._appendAlertToFile(type, module, result);
    }

    private _appendAlertToFile(
        type: string,
        module: string,
        result: string,
    ): void {
        try {
            fs.mkdirSync(ALERT_LOG_DIR, { recursive: true });
            const line =
                `[${new Date().toLocaleTimeString()}] ${type} >> ` +
                `${this.ctx.global.type} > ${module} > ${result}\n`;

            let truncate = false;
            try {
                const stat = fs.statSync(ALERT_LOG_PATH);
                truncate = stat.size + line.length > ALERT_LOG_MAX_BYTES;
            } catch {
                /* file does not exist yet — append normally */
            }

            if (truncate) {
                fs.writeFileSync(
                    ALERT_LOG_PATH,
                    `--- alert.log rotated at ${new Date().toISOString()} ---\n${line}`,
                );
            } else {
                fs.appendFileSync(ALERT_LOG_PATH, line);
            }
        } catch {
            /* logging must never crash the bot */
        }
    }

    debug(result = ""): void {
        this._log("⚪", "Bot", "Debug", result, "white");
    }

    private _log(
        emoji: string,
        type: string,
        module: string,
        result: string,
        colorName: keyof typeof chalk,
    ): void {
        const color = chalk[colorName] as (...text: string[]) => string;
        const time = chalk.white(`[${new Date().toLocaleTimeString()}]`);
        const colored =
            `${time} ${chalk.white(emoji)} ` +
            `${chalk.blue(chalk.bold(type))}${chalk.white(" >> ")}` +
            `${chalk.cyan(chalk.bold(this.ctx.global.type))} > ` +
            `${chalk.magenta(module)} > ${color(result)}`;

        const msg = colored;

        if (colorName !== "white") {
            this.logs.push(msg);
            if (this.exitLog) this.fullLogs.push(msg);
            if (this.logs.length > this.logLength) this.logs.shift();
            this._show();
        }
    }

    private _show(): void {
        if (this.logs.length === 0) return;
        try {
            console.log(this.logs[this.logs.length - 1]);
        } catch {
            /* EPIPE / broken pipe — never let logging crash the bot */
        }
    }
}

function createLogger(ctx: LoggerCtx): Logger {
    return new Logger(ctx);
}

export { createLogger, Logger };
