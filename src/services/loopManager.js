/**
 * LoopManager — centralized lifecycle control for the bot's self-looping
 * subsystems.
 *
 * Every farm subsystem (hunt/battle, quest, luck, animals, huntbot,
 * safety, checklist) runs as a self-rescheduling loop driven by `setTimeout`.
 * Previously each module owned its raw timer handles and the "have the loops
 * been started" flag was duplicated across `ready.js` and `admin.js` via
 * `client.global.temp.started`. That made two things impossible/fragile:
 *
 *  1. Preventing a double start (two callers launching the orchestrator).
 *  2. Cancelling pending timers for a clean restart.
 *
 * This class owns both concerns:
 *  - `tryStart()` is the single, atomic "first start vs. resume" gate.
 *  - `schedule()`/`stop()`/`stopAll()` track timer handles so pending loop
 *    iterations can be cancelled.
 */
class LoopManager {
    constructor() {
        /** @type {Map<number, { handle: NodeJS.Timeout, name: string }>} */
        this.timers = new Map();
        this.nextId = 1;
        this.startedFlag = false;
    }

    /**
     * Whether the subsystem loops have been started at least once.
     * @returns {boolean}
     */
    get started() {
        return this.startedFlag;
    }

    /**
     * Number of currently pending (not-yet-fired, not-cancelled) timers.
     * @returns {number}
     */
    get size() {
        return this.timers.size;
    }

    /**
     * Atomically claim the "first start". Returns true exactly once — the
     * first time it is called after construction/reset — and false on every
     * subsequent call. Callers use the boolean to decide between launching the
     * orchestrator (first start) and simply un-pausing (resume).
     *
     * @returns {boolean} True if this call performed the first start.
     */
    tryStart() {
        if (this.startedFlag) return false;
        this.startedFlag = true;
        return true;
    }

    /**
     * Cancel all tracked timers and clear the started flag, returning the
     * manager to its initial state so a fresh `tryStart()` will succeed again.
     *
     * @returns {void}
     */
    reset() {
        this.stopAll();
        this.startedFlag = false;
    }

    /**
     * Schedule a tracked one-shot timer. Behaves like `setTimeout` but records
     * the handle so it can be cancelled via {@link stop}/{@link stopAll}. The
     * entry is auto-removed from the registry right before `fn` runs.
     *
     * @param {() => void} fn - Callback to run after the delay.
     * @param {number} ms - Delay in milliseconds.
     * @param {string} [name="loop"] - Human-readable label for diagnostics.
     * @returns {number} A registry id usable with {@link stop}.
     */
    schedule(fn, ms, name = "loop") {
        const id = this.nextId++;
        const handle = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, ms);
        this.timers.set(id, { handle, name });
        return id;
    }

    /**
     * Cancel a single tracked timer by its id.
     *
     * @param {number} id - The id returned by {@link schedule}.
     * @returns {boolean} True if a pending timer was found and cancelled.
     */
    stop(id) {
        const entry = this.timers.get(id);
        if (!entry) return false;
        clearTimeout(entry.handle);
        return this.timers.delete(id);
    }

    /**
     * Cancel every tracked timer.
     *
     * @returns {number} How many pending timers were cancelled.
     */
    stopAll() {
        const count = this.timers.size;
        for (const { handle } of this.timers.values()) clearTimeout(handle);
        this.timers.clear();
        return count;
    }
}

module.exports = LoopManager;
