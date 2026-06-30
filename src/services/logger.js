const chalk = require("chalk");

let sigintRegistered = false;

class Logger {
    constructor(client) {
        this.client = client;
        this.logs = [];
        this.fullLogs = [];
        this.simpleLogs = [];

        const cfg = client?.config?.settings?.logging || {};
        this.logLength = cfg.loglength ?? 16;
        this.exitLog = cfg.showlogbeforeexit && cfg.newlog;

        if (!sigintRegistered) {
            sigintRegistered = true;
            process.on("SIGINT", () => {
                if (this.exitLog && this.fullLogs.length > 0) {
                    console.log("//START OF LOG//");
                    for (const log of this.fullLogs) console.log(log);
                    console.log("//END OF LOG//");
                }
                process.exit(0);
            });
        }
    }

    info(type, module, result = "") {
        this._log("🟢", type, module, result, "green");
    }

    warn(type, module, result = "") {
        this._log("🟡", type, module, result, "yellow");
    }

    alert(type, module, result = "") {
        this._log("🔴", type, module, result, "red");
    }

    debug(result = "") {
        this._log("⚪", "Bot", "Debug", result, "white");
    }

    _log(emoji, type, module, result, colorName) {
        const color = chalk[colorName];
        const time = chalk.white(`[${new Date().toLocaleTimeString()}]`);
        const msg =
            `${time} ${chalk.white(emoji)} ` +
            `${chalk.blue(chalk.bold(type))}${chalk.white(" >> ")}` +
            `${chalk.cyan(chalk.bold(this.client.global.type))} > ` +
            `${chalk.magenta(module)} > ${color(result)}`;

        if (colorName !== "white") {
            this.logs.push(msg);
            if (this.exitLog) this.fullLogs.push(msg);
            if (this.logs.length > this.logLength) this.logs.shift();
            this._show();

            const plain =
                `[${new Date().toLocaleTimeString()}] ${emoji} ${type} >> ` +
                `${this.client.global.type} > ${module} > ${result}`;
            this.simpleLogs.push(plain);

            if (process.send) {
                process.send({ type: "log", message: plain });
            }
        }
    }

    _show() {
        if (this.logs.length === 0) return;
        console.log(this.logs[this.logs.length - 1]);
    }

    getSimpleLog() {
        return this.simpleLogs;
    }
}

module.exports = (client) => new Logger(client);
