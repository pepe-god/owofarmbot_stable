/**
 * Shared type definitions for the OwO Farm Bot.
 *
 * Centralises the context (Ctx) shape used by every module so each file
 * doesn't re-declare its own partial interface.  Granular interfaces
 * (CtxLogger, CtxLoops, CtxState, …) let functions require only the slice
 * they actually touch; FullCtx composes everything.
 */

// ─── Logger ───────────────────────────────────────────────────────────────

export interface LoggerLike {
    alert: (type: string, module: string, message: string) => void;
    debug: (msg: unknown) => void;
    warn: (type: string, module: string, message: string) => void;
    info: (type: string, module: string, message: string) => void;
    /** Flush buffered fullLogs to stdout. */
    dumpExitLog?: () => void;
}

export interface CtxLogger {
    logger: LoggerLike;
}

// ─── Global state (plain booleans + counters) ─────────────────────────────

export interface CtxGlobal {
    captchadetected: boolean;
    paused: boolean;
    inventory: boolean;
    use: boolean;
    type: string;
    total: Record<string, number>;
    gems: {
        need: string[];
        use: string;
        isevent: boolean;
        rareLevel: number;
        huntssinceinv: number;
        missingHandled: boolean;
    };
    temp: {
        isready: boolean;
        started: boolean;
        usedevent: boolean;
        lastPhraseIndex?: number;
        rateLimit?: Record<string, number>;
        animaltype: string;
    };
    /** Allow dynamic keys used by farm modules (hunt/battle etc. flags). */
    [key: string]: unknown;
}

export interface CtxGlobalMin {
    global: { temp: { rateLimit?: Record<string, number> } };
}

export interface CtxWithLogger extends CtxGlobalMin, CtxLogger, CtxLoops {}

// ─── State helpers (BotState) ─────────────────────────────────────────────

export interface CtxState {
    state: {
        waitUntilIdle: () => Promise<void>;
        pause: () => void;
        resume: () => void;
        captcha: () => void;
        captchaSolved: (autoresume?: boolean) => void;
        startInventory: () => void;
        endInventory: () => void;
        status?: string;
    };
}

// ─── Loop manager ─────────────────────────────────────────────────────────

export interface CtxLoops {
    loops: {
        schedule: (fn: () => void, delay: number, key: string) => void;
        stopAll: () => void;
        tryStart: () => boolean;
    };
}

// ─── Config shapes ────────────────────────────────────────────────────────

export interface CtxConfig {
    config: {
        main: {
            commandschannelid: string;
            owodmchannelid: string;
            userid: string;
            autostart: boolean;
            commands: {
                hunt: boolean;
                battle: boolean;
                pray: boolean;
                curse: boolean;
                inventory: boolean;
                animals: boolean;
            };
        };
        animals: {
            type: {
                sell: boolean;
            };
        };
        settings: {
            chatfeedback: boolean;
            autoresume: boolean;
            autophrases: boolean;
            inventory: {
                use: {
                    gems: boolean;
                    lootbox: boolean;
                    fabledlootbox: boolean;
                    crate: boolean;
                };
            };
            safety: {
                autopause: boolean;
                pauseafter: number;
                pausefor: number;
            };
            captcha: {
                alerttype: {
                    webhook: boolean;
                    webhookurl: string;
                    desktop: {
                        force: boolean;
                        notification: boolean;
                        prompt: boolean;
                    };
                };
            };
        };
        interval: Record<string, { min: number; max: number }>;
    };
}

// ─── Client (Discord) ─────────────────────────────────────────────────────

export interface CtxClient {
    client: {
        user: { id: string; username: string };
        channels: {
            cache: {
                get: (id: string) => Channel | undefined;
                values: () => Iterable<{
                    messages?: { cache: Map<string, unknown> };
                }>;
            };
        };
        destroy: () => Promise<void>;
        login: (token: string) => Promise<string>;
        commands: Map<
            string,
            {
                run?: (ctx: Ctx, msg: Message, args: string[]) => void;
                config?: { name?: string; aliases?: string[] };
            }
        >;
        aliases: Map<string, string>;
        on: (event: string, listener: (...args: unknown[]) => void) => unknown;
        off: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };
}

// ─── Channel / Message (minimal) ──────────────────────────────────────────

export interface Channel {
    id: string;
    send: (opts: { content: string }) => Promise<{ id: string }>;
    type?: string;
    createMessageCollector: (opts: {
        filter: (msg: unknown) => boolean;
        time: number;
    }) => {
        on: (event: string, cb: (msg: unknown) => void) => void;
        stop: () => void;
    };
}

export interface Message {
    content: string;
    author: { id: string };
    channel: Channel;
    delete: () => Promise<void>;
}

// ─── Utilities (globalutil) ───────────────────────────────────────────────

export interface CtxGlobalUtil {
    globalutil: {
        waitWhileBusy: (ctx: CtxState) => Promise<void>;
        waitForMessage: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ctx: any,
            channel: Channel,
            filter: (msg: unknown) => boolean,
        ) => Promise<unknown>;
        removeInvisibleChars: (str: string) => string;
        commandrandomizer: <T>(arr: T[]) => T;
        getrand: (min: number, max: number) => number;
    };
}

// ─── Wait-while-busy subset ───────────────────────────────────────────────

export interface CtxWaitWhileBusy {
    global: {
        paused: boolean;
        captchadetected: boolean;
        inventory: boolean;
    };
    state: {
        waitUntilIdle: () => Promise<void>;
    };
}

// ─── Extra optional services ──────────────────────────────────────────────

export interface CtxNotifier {
    notifier?: {
        notify: (opts: {
            title: string;
            message: string;
            sound: boolean;
            wait: boolean;
            appID: string;
        }) => void;
    };
    child_process?: {
        spawn: (cmd: string, args: string[]) => void;
    };
}

export interface CtxFs {
    fs?: {
        promises: {
            readFile: (path: string, encoding: string) => Promise<string>;
        };
    };
}

// ─── Composed context (what every module actually receives) ────────────────

export interface Ctx
    extends CtxConfig,
        CtxClient,
        CtxLogger,
        CtxGlobalUtil,
        CtxState,
        CtxLoops,
        CtxNotifier,
        CtxFs {
    global: CtxGlobal;
    delay: (ms: number) => Promise<void>;
    prefix: () => string;
}
