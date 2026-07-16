/**
 * General-purpose runtime utilities: removeInvisibleChars, waitForMessage, commandrandomizer, getrand, waitWhileBusy.
 */

import type { CtxClient, CtxState } from "./types.js";

type CtxWithClient = Pick<CtxClient, "client">;
type CtxWithState = Pick<CtxState, "state">;

/**
 * Capitalize the first character of a string.
 */
export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Escape special regex characters so a string can be used safely inside a RegExp constructor.
 */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeInvisibleChars(str: string): string {
    const invisibleRegex = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;
    return str.replace(invisibleRegex, "");
}

/**
 * Wait for a Discord message matching `filter`; uses an immediate listener, falling back to a MessageCollector after `timeout` ms.
 */
export function waitForMessage(
    ctx: CtxWithClient,
    channel: {
        createMessageCollector: (opts: {
            filter: (msg: unknown) => boolean;
            time: number;
        }) => {
            on: (event: string, cb: (msg: unknown) => void) => void;
            stop: () => void;
        };
    },
    filter: (msg: unknown) => boolean,
    timeout = 6100,
): Promise<unknown | null> {
    const discord = ctx.client;
    return new Promise((resolve) => {
        const listener = (msg: unknown) => {
            if (filter(msg)) {
                clearTimeout(timer);
                discord.off("messageCreate", listener);
                resolve(msg);
            }
        };

        const timer = setTimeout(() => {
            discord.off("messageCreate", listener);
            const collector = channel.createMessageCollector({
                filter,
                time: timeout,
            });
            collector.on("collect", (msg: unknown) => {
                collector.stop();
                resolve(msg);
            });
            collector.on("end", () => resolve(null));
        }, timeout);

        discord.on("messageCreate", listener);
    });
}

/**
 * Return a random element from the provided array.
 */
export function commandrandomizer<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)] as T;
}

/**
 * Generate a random floating-point number between min and max.
 */
export function getrand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * Pause execution while any global busy flag (paused/captchadetected/inventory) is active.
 */
export async function waitWhileBusy(ctx: CtxWithState): Promise<void> {
    await ctx.state.waitUntilIdle();
}
