/**
 * BotState — event-driven state machine for the bot's busy flags.
 *
 * The bot tracks three boolean flags on `ctx.global` that pause competing
 * actions or the whole bot:
 *  - `paused`          — user/admin/safety paused the bot.
 *  - `captchadetected` — an OwO captcha is being handled.
 *  - `inventory`       — the inventory routine is running.
 *
 * This class makes the flags the source of truth behind an {@link EventEmitter}:
 *
 *  1. Any write emits a `change` event (and `idle` when nothing is busy),
 *     letting `waitWhileBusy` resolve *immediately* instead of polling.
 *  2. Named transition helpers (`pause()`, `captcha()`, `startInventory()`, …)
 *     give call-sites an explicit, greppable API.
 *  3. A single derived {@link BotState#status} label is available for logging
 *     and the `/health` endpoint.
 *
 * {@link attachState} binds a state instance to an existing `global` object by
 * redefining the three flags as delegating accessors, so all existing
 * `ctx.global.paused = true` reads/writes keep working unchanged while now
 * flowing through the state machine.
 */

const { EventEmitter } = require("node:events");

// The busy flags owned by the state machine, in status-priority order
// (captcha is the most severe, running/idle is the absence of all flags).
const BUSY_FLAGS = ["paused", "captchadetected", "inventory"];

class BotState extends EventEmitter {
    /**
     * @param {Object} [initial] - Initial flag values (missing = false).
     * @param {boolean} [initial.paused]
     * @param {boolean} [initial.captchadetected]
     * @param {boolean} [initial.inventory]
     */
    constructor(initial = {}) {
        super();
        this._flags = {
            paused: Boolean(initial.paused),
            captchadetected: Boolean(initial.captchadetected),
            inventory: Boolean(initial.inventory),
        };
    }

    /**
     * Read a single busy flag.
     *
     * @param {string} flag - One of {@link BUSY_FLAGS}.
     * @returns {boolean}
     */
    get(flag) {
        return Boolean(this._flags[flag]);
    }

    /**
     * Set a single busy flag. No-op if unknown or unchanged. Emits `change`
     * (always on a real change) and `idle` (when no flags remain set).
     *
     * @param {string} flag - One of {@link BUSY_FLAGS}.
     * @param {boolean} value - New value (coerced to boolean).
     * @returns {boolean} True if the value actually changed.
     */
    set(flag, value) {
        if (!(flag in this._flags)) return false;
        const next = Boolean(value);
        if (this._flags[flag] === next) return false;
        this._flags[flag] = next;
        const payload = {
            flag,
            value: next,
            status: this.status,
            busy: this.isBusy(),
        };
        this.emit("change", payload);
        if (!payload.busy) this.emit("idle", payload);
        return true;
    }

    /**
     * @returns {boolean} True while any busy flag is set.
     */
    isBusy() {
        return BUSY_FLAGS.some((flag) => this._flags[flag]);
    }

    /**
     * Derived, human-readable state label (highest-priority flag wins).
     *
     * @returns {"captcha"|"inventory"|"paused"|"running"}
     */
    get status() {
        if (this._flags.captchadetected) return "captcha";
        if (this._flags.inventory) return "inventory";
        if (this._flags.paused) return "paused";
        return "running";
    }

    /** Transition: (any) → paused. */
    pause() {
        this.set("paused", true);
    }

    /** Transition: paused → running. */
    resume() {
        this.set("paused", false);
    }

    /** Transition: (any) → captcha (also pauses farming). */
    captcha() {
        this.set("captchadetected", true);
        this.set("paused", true);
    }

    /**
     * Transition: captcha → paused, or → running when `autoresume`.
     *
     * @param {boolean} [autoresume=false] - Also clear the pause flag.
     */
    captchaSolved(autoresume = false) {
        this.set("captchadetected", false);
        if (autoresume) this.set("paused", false);
    }

    /** Transition: running → inventory. */
    startInventory() {
        this.set("inventory", true);
    }

    /** Transition: inventory → running. */
    endInventory() {
        this.set("inventory", false);
    }

    /**
     * Resolve as soon as no busy flag is set. Resolves synchronously (already
     * idle) or on the next `change` that clears the last flag — no polling.
     *
     * @returns {Promise<void>}
     */
    waitUntilIdle() {
        if (!this.isBusy()) return Promise.resolve();
        return new Promise((resolve) => {
            const onChange = () => {
                if (!this.isBusy()) {
                    this.off("change", onChange);
                    resolve();
                }
            };
            this.on("change", onChange);
        });
    }
}

/**
 * Bind a {@link BotState} to an existing `global` state object.
 *
 * Seeds the state from the object's current flag values, then redefines each
 * busy flag as an accessor that delegates to the state machine. After this call
 * `global.paused = true` (and reads) transparently flow through the state so
 * events fire and `status` stays correct, with zero changes to existing code.
 *
 * @param {Object} globalObj - The shared runtime state object (`ctx.global`).
 * @returns {BotState} The bound state instance (assign to `ctx.state`).
 */
function attachState(globalObj) {
    const state = new BotState({
        paused: globalObj.paused,
        captchadetected: globalObj.captchadetected,
        inventory: globalObj.inventory,
    });

    for (const flag of BUSY_FLAGS) {
        Object.defineProperty(globalObj, flag, {
            get() {
                return state.get(flag);
            },
            set(value) {
                state.set(flag, value);
            },
            enumerable: true,
            configurable: true,
        });
    }

    return state;
}

module.exports = { BotState, attachState, BUSY_FLAGS };
