/**
 * Main orchestration entry point for the `start`/`resume` command.
 *
 * Coordinates the initialization of every bot subsystem in sequence:
 *  - farming (hunt/battle)
 *  - animal sell/sacrifice
 *  - pray/curse luck buffs
 *  - safety auto-pause
 *
 * Each subsystem is a self-looping module that manages its own timers.
 * This function only triggers their initial launch (with small inter-subsystem
 * delays to avoid command floods). The `owoprefix` default is already applied
 * at startup by `config.js`, so no normalization is needed here.
 */

import type { Ctx } from "../core/types.js";
import { startAnimals, startFarm, startLuck } from "../modules/farming.js";
import { startSafety } from "../modules/safety.js";

/** Delay between subsystem starts to avoid command floods (ms). */
const FARM_START_DELAY = 2000;
/** Delay before starting luck module to space out from farming (ms). */
const PRAYER_START_DELAY = 32000;

/**
 * Shared start/resume logic used by both the autostart (ready) and the
 * admin `start`/`resume` command. Clears a stale captcha flag, unpauses, and
 * either launches all subsystems (first start) or just resumes (already ran).
 *
 * @param ctx      - The bot context.
 * @param onFirstStart - Called only on the first start (after launching subsystems).
 * @returns True if this was the first start, false if a plain resume.
 */
function startOrResume(ctx: Ctx, onFirstStart?: () => void): boolean {
    // Clear a stale captcha flag from a previous session on resume.
    if (ctx.global.captchadetected) ctx.state.captchaSolved();
    ctx.state.resume();

    // loops.tryStart() is the atomic gate: true exactly once (first start).
    if (ctx.loops.tryStart()) {
        ctx.global.temp.started = true;
        // Small delay so the ctx is fully settled before orchestrating.
        setTimeout(() => {
            mainHandler(ctx);
            if (onFirstStart) onFirstStart();
        }, 1000);
        return true;
    }
    return false;
}

export async function mainHandler(ctx: Ctx): Promise<void> {
    await ctx.globalutil.waitWhileBusy(ctx);

    await initFarming(ctx);
    await ctx.delay(FARM_START_DELAY);

    await initAnimals(ctx);
    await initPrayer(ctx);
    initSafety(ctx);
}

export { startOrResume };

/**
 * Start the farm subsystem (hunt/battle).
 *
 * The farm module resolves its own commands channel from ctx, so the channel
 * is refreshed each iteration and does not need to be passed from here.
 */
async function initFarming(ctx: Ctx): Promise<void> {
    await ctx.globalutil.waitWhileBusy(ctx);
    await ctx.delay(FARM_START_DELAY);
    await startFarm(ctx);
}

/**
 * Start the animal sell/sacrifice loop.
 *
 * Resolves the current commands channel from ctx so that the reference is
 * refreshed each call. Selects "sell" vs "sacrifice" from config and passes
 * the concatenated animal-type suffix to the module.
 */
async function initAnimals(ctx: Ctx): Promise<void> {
    if (ctx.config.main.commands.animals) {
        await ctx.globalutil.waitWhileBusy(ctx);
        const channel = ctx.client.channels.cache.get(
            ctx.config.main.commandschannelid,
        );
        if (!channel) {
            ctx.logger.warn("System", "Animals", "Commands channel not found");
            return;
        }
        await startAnimals(
            ctx,
            channel,
            ctx.config.animals.type.sell ? "sell" : "sacrifice",
            ctx.global.temp.animaltype,
        );
    }
}

/**
 * Start the pray/curse luck buff loop.
 */
async function initPrayer(ctx: Ctx): Promise<void> {
    if (ctx.config.main.commands.pray || ctx.config.main.commands.curse) {
        await ctx.globalutil.waitWhileBusy(ctx);
        // Initial wait to space out luck buffs from farming actions.
        await ctx.delay(PRAYER_START_DELAY);
        await startLuck(ctx);
    }
}

/**
 * Start the safety auto-pause module.
 */
function initSafety(ctx: Ctx): void {
    if (ctx.config.settings.safety.autopause) {
        startSafety(ctx);
    }
}
