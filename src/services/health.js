/**
 * Health & metrics HTTP endpoint.
 *
 * Exposes a tiny read-only HTTP server (Node's built-in `http`, no extra deps)
 * that returns a JSON snapshot of the bot's runtime state on `GET /health`
 * (also `GET /:health`). This lets a process manager, uptime monitor, or the
 * operator probe liveness and basic counters without attaching to the Discord
 * session:
 *
 *   curl http://localhost:$HEALTH_PORT/health
 *
 * The server is opt-in: `bot.js` only starts it when the `HEALTH_PORT`
 * environment variable is set, so the default runtime opens no ports.
 */

const http = require("node:http");

/**
 * Normalize the raw total counters into a fixed shape with numeric defaults.
 *
 * @param {Object} total - `ctx.global.total`.
 * @returns {Object} Totals with every field defaulted to 0.
 */
function normalizeTotals(total = {}) {
    return {
        hunt: total.hunt ?? 0,
        battle: total.battle ?? 0,
        captcha: total.captcha ?? 0,
        solvedcaptcha: total.solvedcaptcha ?? 0,
        pray: total.pray ?? 0,
        curse: total.curse ?? 0,
        vote: total.vote ?? 0,
    };
}

/**
 * Derive captcha metrics from the normalized totals and uptime.
 *
 * @param {Object} totals - Output of {@link normalizeTotals}.
 * @param {number} uptime - Process uptime in seconds.
 * @returns {{captchaPerHour: number, captchaSolveRate: number}}
 */
function computeMetrics(totals, uptime) {
    const captchaPerHour =
        uptime > 0 ? Number(((totals.captcha * 3600) / uptime).toFixed(3)) : 0;
    const captchaSolveRate =
        totals.captcha > 0
            ? Number((totals.solvedcaptcha / totals.captcha).toFixed(3))
            : 1;
    return { captchaPerHour, captchaSolveRate };
}

/**
 * Build the JSON health payload from the current bot context.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context.
 * @returns {Object} Serializable health snapshot.
 */
function buildHealthPayload(ctx) {
    const g = ctx.global || {};
    const uptime = Math.floor(process.uptime());
    const totals = normalizeTotals(g.total);

    return {
        status: ctx.state?.status ?? (g.paused ? "paused" : "running"),
        paused: Boolean(g.paused),
        captcha: Boolean(g.captchadetected),
        uptime,
        totals,
        metrics: computeMetrics(totals, uptime),
        timestamp: new Date().toISOString(),
    };
}

/**
 * Handle a single HTTP request against the health server.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {void}
 */
function handleRequest(ctx, req, res) {
    const url = (req.url || "").split("?")[0];
    if (url === "/health" || url === "/:health") {
        const body = JSON.stringify(buildHealthPayload(ctx));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(body);
        return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
}

/**
 * Create and start the health HTTP server.
 *
 * Binds to loopback (127.0.0.1) by default so the endpoint is not exposed to
 * the network; pass `options.host` to override intentionally.
 *
 * @param {import("../core/botContext.js")} ctx - The bot context.
 * @param {Object} [options]
 * @param {number} [options.port] - Port to listen on (default: `HEALTH_PORT` env, else 0/ephemeral).
 * @param {string} [options.host] - Interface to bind (default: "127.0.0.1").
 * @returns {http.Server} The listening server (callers may `close()` it).
 */
function startHealthServer(ctx, options = {}) {
    const envPort = Number(process.env.HEALTH_PORT);
    const port =
        options.port ??
        (Number.isInteger(envPort) && envPort >= 0 ? envPort : 0);
    const host = options.host ?? "127.0.0.1";
    const server = http.createServer((req, res) =>
        handleRequest(ctx, req, res),
    );

    server.listen(port, host, () => {
        const actual = server.address()?.port ?? port;
        ctx.logger?.info?.(
            "Bot",
            "Health",
            `Health endpoint listening on ${host}:${actual}/health`,
        );
    });

    server.on("error", (err) => {
        ctx.logger?.alert?.(
            "Bot",
            "Health",
            `Health server error: ${err.message}`,
        );
    });

    return server;
}

module.exports = { buildHealthPayload, handleRequest, startHealthServer };
