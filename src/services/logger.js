const chalk = require("chalk");

const ANSI_RE = new RegExp(String.fromCharCode(27) + "\\[\\d;]+m", "g");
const stripAnsi = (s) => (typeof s === "string" ? s.replace(ANSI_RE, "") : "");

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

    _table() {
        if (!this.client?.global?.temp?.isready) return null;

        const safe = (v) => (v == null ? "—" : v.toString().trim());
        const g = this.client.global;
        const rows = [
            ["Total hunt", safe(g.total.hunt), "> Title"],
            ["Total battle", safe(g.total.battle), safe(g.quest.title)],
            ["Having event", g.gems.isevent ? "Yes" : "No", "> Reward"],
            [
                "Total cowoncy won",
                safe(g.gamble.cowoncywon),
                safe(g.quest.reward),
            ],
            [
                "Safety level",
                g.captchadetected
                    ? chalk.red("Danger  ")
                    : chalk.green("Safe    "),
                "> Progress",
            ],
            [
                "Running?",
                g.paused ? chalk.yellow("Paused  ") : chalk.cyan("Running "),
                safe(g.quest.progress),
            ],
        ];

        const cols = Math.min(process.stdout.columns || 80, 120);
        const cw = [
            Math.max(10, Math.floor(cols * 0.2)),
            Math.max(10, Math.floor(cols * 0.2)),
            Math.max(20, cols - Math.floor(cols * 0.4) - 4),
        ];
        cw[2] = cols - cw[0] - cw[1] - 4;

        const sep = (c1, c2, c3) =>
            `${c1}${"".padEnd(cw[0], "─")}${c2}${"".padEnd(cw[1], "─")}${c3}${"".padEnd(cw[2], "─")}`;
        const hdr = (v0, v1, v2) => {
            const plain = stripAnsi(v1);
            return `│ ${v0.padEnd(cw[0] - 2)} │ ${v1}${" ".repeat(Math.max(0, cw[1] - 2 - plain.length))} │ ${v2.padEnd(cw[2] - 2)} │`;
        };

        let table = `${sep("┌", "┬", "┐")}\n${hdr("Name", "Status", "Questing")}\n${sep("├", "┼", "┤")}\n`;
        for (const [n, s, q] of rows) table += `${hdr(n, s, q)}\n`;
        table += sep("└", "┴", "┘");

        return table;
    }

    _show() {
        const table = this._table();
        if (!table) {
            console.log(this.logs[this.logs.length - 1]);
            return;
        }

        console.clear();
        console.log(table);
        console.log(">>> Log");
        for (const log of this.logs) console.log(log);
    }

    getSimpleLog() {
        return this.simpleLogs;
    }
}

module.exports = (client) => new Logger(client);
