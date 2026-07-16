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

interface BusyFlags {
    paused: boolean;
    captchadetected: boolean;
    inventory: boolean;
}

/**
 * BotState — plain boolean flags for pause / captcha / inventory.
 */
class BotState {
    global: BusyFlags;

    constructor(globalObj: BusyFlags) {
        this.global = globalObj;
    }

    get status(): string {
        if (this.global.captchadetected) return "captcha";
        if (this.global.inventory) return "inventory";
        if (this.global.paused) return "paused";
        return "running";
    }

    pause(): void {
        this.global.paused = true;
    }

    resume(): void {
        this.global.paused = false;
    }

    captcha(): void {
        this.global.captchadetected = true;
        this.global.paused = true;
    }

    captchaSolved(autoresume = false): void {
        this.global.captchadetected = false;
        if (autoresume) this.global.paused = false;
    }

    startInventory(): void {
        this.global.inventory = true;
    }

    endInventory(): void {
        this.global.inventory = false;
    }

    /** Resolve once no busy flag is set (polls — simple, no EventEmitter). */
    waitUntilIdle(): Promise<void> {
        const busy = (): boolean =>
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

interface TimerEntry {
    handle: ReturnType<typeof setTimeout>;
    name: string;
}

/**
 * LoopManager — tracks self-rescheduling timers so they can be cancelled on
 * restart, plus an atomic first-start gate.
 */
class LoopManager {
    timers: Map<number, TimerEntry>;
    nextId: number;
    startedFlag: boolean;

    constructor() {
        this.timers = new Map();
        this.nextId = 1;
        this.startedFlag = false;
    }

    /** True exactly once (first start); false on every later call. */
    tryStart(): boolean {
        if (this.startedFlag) return false;
        this.startedFlag = true;
        return true;
    }

    /** Tracked setTimeout; auto-removed before `fn` runs. */
    schedule(fn: () => void, ms: number, name = "loop"): number {
        const id = this.nextId++;
        const handle = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, ms);
        this.timers.set(id, { handle, name });
        return id;
    }

    /** Cancel every tracked timer. Returns how many were cancelled. */
    stopAll(): number {
        const count = this.timers.size;
        for (const { handle } of this.timers.values()) clearTimeout(handle);
        this.timers.clear();
        return count;
    }
}

export { BotState, LoopManager };
