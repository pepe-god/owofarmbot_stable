const { describe, it } = require("node:test");
const assert = require("node:assert");

const {
    BotState,
    attachState,
    BUSY_FLAGS,
} = require("../src/services/botState.js");

describe("BotState", () => {
    describe("construction & flags", () => {
        it("defaults every flag to false", () => {
            const state = new BotState();
            for (const flag of BUSY_FLAGS) {
                assert.strictEqual(state.get(flag), false);
            }
            assert.strictEqual(state.isBusy(), false);
            assert.strictEqual(state.status, "running");
        });

        it("seeds flags from the initial object", () => {
            const state = new BotState({ paused: true });
            assert.strictEqual(state.get("paused"), true);
            assert.strictEqual(state.isBusy(), true);
            assert.strictEqual(state.status, "paused");
        });
    });

    describe("set", () => {
        it("returns true and emits change on a real change", () => {
            const state = new BotState();
            const events = [];
            state.on("change", (p) => events.push(p));

            assert.strictEqual(state.set("paused", true), true);
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].flag, "paused");
            assert.strictEqual(events[0].value, true);
            assert.strictEqual(events[0].busy, true);
        });

        it("is a no-op (no event) when value is unchanged", () => {
            const state = new BotState({ paused: true });
            let fired = 0;
            state.on("change", () => fired++);
            assert.strictEqual(state.set("paused", true), false);
            assert.strictEqual(fired, 0);
        });

        it("ignores unknown flags", () => {
            const state = new BotState();
            assert.strictEqual(state.set("nope", true), false);
        });

        it("emits idle when the last busy flag clears", () => {
            const state = new BotState({ paused: true });
            let idleFired = 0;
            state.on("idle", () => idleFired++);
            state.set("paused", false);
            assert.strictEqual(idleFired, 1);
            assert.strictEqual(state.isBusy(), false);
        });

        it("does not emit idle while other flags remain set", () => {
            const state = new BotState({ paused: true, inventory: true });
            let idleFired = 0;
            state.on("idle", () => idleFired++);
            state.set("paused", false);
            assert.strictEqual(idleFired, 0);
            assert.strictEqual(state.isBusy(), true);
        });
    });

    describe("status priority", () => {
        it("captcha outranks everything", () => {
            const state = new BotState({
                paused: true,
                inventory: true,
                captchadetected: true,
            });
            assert.strictEqual(state.status, "captcha");
        });

        it("inventory outranks paused", () => {
            const state = new BotState({ paused: true, inventory: true });
            assert.strictEqual(state.status, "inventory");
        });
    });

    describe("transitions", () => {
        it("pause / resume", () => {
            const state = new BotState();
            state.pause();
            assert.strictEqual(state.get("paused"), true);
            state.resume();
            assert.strictEqual(state.get("paused"), false);
        });

        it("captcha sets both captcha and paused", () => {
            const state = new BotState();
            state.captcha();
            assert.strictEqual(state.get("captchadetected"), true);
            assert.strictEqual(state.get("paused"), true);
        });

        it("captchaSolved(false) clears captcha but keeps paused", () => {
            const state = new BotState();
            state.captcha();
            state.captchaSolved(false);
            assert.strictEqual(state.get("captchadetected"), false);
            assert.strictEqual(state.get("paused"), true);
        });

        it("captchaSolved(true) clears captcha and resumes", () => {
            const state = new BotState();
            state.captcha();
            state.captchaSolved(true);
            assert.strictEqual(state.get("captchadetected"), false);
            assert.strictEqual(state.get("paused"), false);
        });

        it("inventory start/end", () => {
            const state = new BotState();
            state.startInventory();
            assert.strictEqual(state.get("inventory"), true);
            state.endInventory();
            assert.strictEqual(state.get("inventory"), false);
        });

    });

    describe("waitUntilIdle", () => {
        it("resolves synchronously when already idle", async () => {
            const state = new BotState();
            await state.waitUntilIdle();
            assert.ok(true);
        });

        it("resolves immediately when the last flag clears (no polling)", async () => {
            const state = new BotState({ paused: true });
            const p = state.waitUntilIdle();
            // Nothing should have resolved yet; clear the flag to release it.
            setImmediate(() => state.resume());
            await p;
            assert.strictEqual(state.isBusy(), false);
        });

        it("does not resolve until ALL flags clear", async () => {
            const state = new BotState({ paused: true, inventory: true });
            let resolved = false;
            state.waitUntilIdle().then(() => {
                resolved = true;
            });
            state.resume();
            await new Promise((r) => setImmediate(r));
            assert.strictEqual(resolved, false);
            state.endInventory();
            await new Promise((r) => setImmediate(r));
            assert.strictEqual(resolved, true);
        });
    });
});

describe("attachState", () => {
    it("delegates global flag reads/writes through the state machine", () => {
        const global = {
            paused: true,
            captchadetected: false,
            inventory: false,
            temp: { started: true },
        };
        const state = attachState(global);

        // Seeded from the object's current values.
        assert.strictEqual(state.get("paused"), true);

        // Writing the flag flows through the state machine.
        let changes = 0;
        state.on("change", () => changes++);
        global.paused = false;
        assert.strictEqual(state.get("paused"), false);
        assert.strictEqual(changes, 1);

        // Writing the state reflects back onto the global accessor.
        state.pause();
        assert.strictEqual(global.paused, true);
    });

    it("treats missing initial flags as false", () => {
        const global = {};
        const state = attachState(global);
        assert.strictEqual(global.paused, false);
        assert.strictEqual(global.inventory, false);
        assert.strictEqual(state.status, "running");
    });
});
