/**
 * Runtime — combined, simplified state + loop lifecycle control.
 *
 * Replaces the old `botState.js` (EventEmitter-based state machine) and
 * `loopManager.js` (timer registry). Kept as two small classes in one file
 * because both are bootstrap-only concerns wired once in `bot.js`.
 *
 * State is now plain booleans on the shared `global` object (no accessor
 * magic, no EventEmitter). `waitWhileBusy` polls the flags — simple and
 * correct for a selfbot that already reschedules on timers.
 */

/**
 * BotState — plain boolean flags for pause / captcha / inventory.
 *
 * @param {Object} globalObj - The shared runtime state object (`ctx.global`).
 */
class BotState {
    constructor(globalObj) {
        this.global = globalObj;
    }

    get status() {
        if (this.global.captchadetected) return "captcha";
        if (this.global.inventory) return "inventory";
        if (this.global.paused) return "paused";
        return "running";
    }

    pause() {
        this.global.paused = true;
    }

    resume() {
        this.global.paused = false;
    }

    captcha() {
        this.global.captchadetected = true;
        this.global.paused = true;
    }

    captchaSolved(autoresume = false) {
        this.global.captchadetected = false;
        if (autoresume) this.global.paused = false;
    }

    startInventory() {
        this.global.inventory = true;
    }

    endInventory() {
        this.global.inventory = false;
    }

    /** Resolve once no busy flag is set (polls — simple, no EventEmitter). */
    waitUntilIdle() {
        const busy = () =>
            this.global.paused ||
            this.global.captchadetected ||
            this.global.inventory;
        if (!busy()) return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                if (!busy()) {
                    clearInterval(timer);
                    resolve();
                }
            }, 500);
        });
    }
}

/**
 * LoopManager — tracks self-rescheduling timers so they can be cancelled on
 * restart, plus an atomic first-start gate.
 */
class LoopManager {
    constructor() {
        /** @type {Map<number, NodeJS.Timeout>} */
        this.timers = new Map();
        this.nextId = 1;
        this.startedFlag = false;
    }

    /** True exactly once (first start); false on every later call. */
    tryStart() {
        if (this.startedFlag) return false;
        this.startedFlag = true;
        return true;
    }

    /** Tracked setTimeout; auto-removed before `fn` runs. */
    schedule(fn, ms, name = "loop") {
        const id = this.nextId++;
        const handle = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, ms);
        this.timers.set(id, { handle, name });
        return id;
    }

    /** Cancel every tracked timer. Returns how many were cancelled. */
    stopAll() {
        const count = this.timers.size;
        for (const { handle } of this.timers.values()) clearTimeout(handle);
        this.timers.clear();
        return count;
    }
}

module.exports = { BotState, LoopManager };
