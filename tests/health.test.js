const { describe, it, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const {
    buildHealthPayload,
    handleRequest,
    startHealthServer,
} = require("../src/services/health.js");
const { makeCtx } = require("./helpers/makeCtx.js");

describe("health", () => {
    describe("buildHealthPayload", () => {
        it("reflects the current state and totals", () => {
            const ctx = makeCtx({
                global: {
                    paused: true,
                    captchadetected: false,
                    total: { hunt: 5, battle: 2, captcha: 1, solvedcaptcha: 1 }
                },
            });
            const payload = buildHealthPayload(ctx);
            assert.strictEqual(payload.status, "paused");
            assert.strictEqual(payload.paused, true);
            assert.strictEqual(payload.captcha, false);
            assert.strictEqual(payload.totals.hunt, 5);
            assert.strictEqual(payload.totals.captcha, 1);
            assert.ok(typeof payload.uptime === "number");
            assert.ok(!Number.isNaN(Date.parse(payload.timestamp)));
        });

        it("computes captcha metrics defensively", () => {
            const ctx = makeCtx({
                global: { total: { captcha: 0, solvedcaptcha: 0 } },
            });
            const payload = buildHealthPayload(ctx);
            // No captchas encountered -> solve rate defaults to 1.
            assert.strictEqual(payload.metrics.captchaSolveRate, 1);
            assert.strictEqual(typeof payload.metrics.captchaPerHour, "number");
        });
    });

    describe("handleRequest", () => {
        function mockRes() {
            return {
                statusCode: null,
                headers: null,
                body: null,
                writeHead(code, headers) {
                    this.statusCode = code;
                    this.headers = headers;
                },
                end(body) {
                    this.body = body;
                },
            };
        }

        it("returns 200 JSON for /health", () => {
            const ctx = makeCtx();
            const res = mockRes();
            handleRequest(ctx, { url: "/health" }, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.headers["Content-Type"], "application/json");
            const obj = JSON.parse(res.body);
            assert.ok(obj.status);
        });

        it("accepts the /:health alias and ignores query strings", () => {
            const ctx = makeCtx();
            const res = mockRes();
            handleRequest(ctx, { url: "/:health?x=1" }, res);
            assert.strictEqual(res.statusCode, 200);
        });

        it("returns 404 for unknown paths", () => {
            const ctx = makeCtx();
            const res = mockRes();
            handleRequest(ctx, { url: "/nope" }, res);
            assert.strictEqual(res.statusCode, 404);
        });
    });

    describe("startHealthServer", () => {
        const servers = [];
        after(() => {
            for (const s of servers) s.close();
        });

        it("serves a live 200 response on GET /health", async () => {
            const ctx = makeCtx();
            const server = startHealthServer(ctx, { port: 0 });
            servers.push(server);

            await new Promise((resolve) => {
                if (server.listening) resolve();
                else server.once("listening", resolve);
            });

            const port = server.address().port;
            const { statusCode, body } = await new Promise(
                (resolve, reject) => {
                    http.get(`http://127.0.0.1:${port}/health`, (res) => {
                        let data = "";
                        res.on("data", (c) => {
                            data += c;
                        });
                        res.on("end", () =>
                            resolve({ statusCode: res.statusCode, body: data }),
                        );
                    }).on("error", reject);
                },
            );

            assert.strictEqual(statusCode, 200);
            const obj = JSON.parse(body);
            assert.ok(obj.status);
            assert.ok(obj.totals);
        });
    });
});
