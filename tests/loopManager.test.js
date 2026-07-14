const { describe, it, mock, before, after, afterEach } = require("node:test");
const assert = require("node:assert");

const LoopManager = require("../src/services/loopManager.js");

describe("LoopManager", () => {
    before(() => mock.timers.enable({ apis: ["setTimeout"] }));
    after(() => mock.timers.reset());
    afterEach(() => mock.restoreAll());

    describe("tryStart / started / reset", () => {
        it("returns true on the first call and false afterwards", () => {
            const loops = new LoopManager();
            assert.strictEqual(loops.started, false);
            assert.strictEqual(loops.tryStart(), true);
            assert.strictEqual(loops.started, true);
            assert.strictEqual(loops.tryStart(), false);
            assert.strictEqual(loops.tryStart(), false);
        });

        it("reset allows tryStart to succeed again", () => {
            const loops = new LoopManager();
            loops.tryStart();
            loops.reset();
            assert.strictEqual(loops.started, false);
            assert.strictEqual(loops.tryStart(), true);
        });
    });

    describe("schedule", () => {
        it("runs the callback after the delay", () => {
            const loops = new LoopManager();
            let ran = false;
            loops.schedule(() => {
                ran = true;
            }, 1000);
            assert.strictEqual(ran, false);
            mock.timers.tick(1000);
            assert.strictEqual(ran, true);
        });

        it("removes the timer from the registry once it fires", () => {
            const loops = new LoopManager();
            loops.schedule(() => {}, 1000);
            assert.strictEqual(loops.size, 1);
            mock.timers.tick(1000);
            assert.strictEqual(loops.size, 0);
        });

        it("returns unique ids", () => {
            const loops = new LoopManager();
            const a = loops.schedule(() => {}, 1000);
            const b = loops.schedule(() => {}, 1000);
            assert.notStrictEqual(a, b);
            assert.strictEqual(loops.size, 2);
        });
    });

    describe("stop", () => {
        it("cancels a pending timer so it never runs", () => {
            const loops = new LoopManager();
            let ran = false;
            const id = loops.schedule(() => {
                ran = true;
            }, 1000);
            assert.strictEqual(loops.stop(id), true);
            mock.timers.tick(1000);
            assert.strictEqual(ran, false);
            assert.strictEqual(loops.size, 0);
        });

        it("returns false for an unknown id", () => {
            const loops = new LoopManager();
            assert.strictEqual(loops.stop(999), false);
        });
    });

    describe("stopAll / reset", () => {
        it("cancels all pending timers and reports the count", () => {
            const loops = new LoopManager();
            let count = 0;
            loops.schedule(() => count++, 1000);
            loops.schedule(() => count++, 1000);
            loops.schedule(() => count++, 2000);
            assert.strictEqual(loops.stopAll(), 3);
            assert.strictEqual(loops.size, 0);
            mock.timers.tick(5000);
            assert.strictEqual(count, 0);
        });

        it("reset also cancels pending timers", () => {
            const loops = new LoopManager();
            let ran = false;
            loops.schedule(() => {
                ran = true;
            }, 1000);
            loops.reset();
            mock.timers.tick(1000);
            assert.strictEqual(ran, false);
            assert.strictEqual(loops.size, 0);
        });
    });
});
