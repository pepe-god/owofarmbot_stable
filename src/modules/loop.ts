/**
 * Generic self-rescheduling loop helper shared by the farm modules.
 *
 * Encapsulates the repeated pattern in farm/luck/animals:
 *   waitWhileBusy -> pick a randomized interval -> withRateLimit(run, onSuccess: reschedule)
 *
 * Each caller supplies only what differs: how to build the command content and
 * what to do after sending. The loop lifecycle (idle wait, interval, rate-limit
 * handling, reschedule) lives here once.
 */

import { getrand } from "../core/globalutil.js";
import type { Channel, CtxWithLogger } from "../core/types.js";
import { withRateLimit } from "../services/errors.js";

interface SelfLoopOpts<T> {
    type: string;
    key: string;
    intervalKey?: string;
    min?: number;
    max?: number;
    buildContent: () => string;
    onRun?: (ctx: T, channel: Channel, msg: { id: string }) => Promise<void>;
    beforeRun?: () => void;
    onFinally?: () => void;
    logModule?: string;
    logType?: string;
}

/**
 * Run one iteration of a self-looping command sender and reschedule.
 */
async function selfLoop<T>(
    ctx: T,
    channel: Channel,
    opts: SelfLoopOpts<T>,
): Promise<void> {
    const {
        type,
        key,
        intervalKey,
        min,
        max,
        buildContent,
        onRun,
        beforeRun,
        onFinally,
        logModule,
        logType = "Farm",
    } = opts;

    await (
        ctx as {
            globalutil: { waitWhileBusy: (ctx: unknown) => Promise<void> };
        }
    ).globalutil.waitWhileBusy(ctx);

    const interval = intervalKey
        ? getrand(
              (
                  ctx as {
                      config: {
                          interval: Record<
                              string,
                              { min: number; max: number }
                          >;
                      };
                  }
              ).config.interval[intervalKey].min,
              (
                  ctx as {
                      config: {
                          interval: Record<
                              string,
                              { min: number; max: number }
                          >;
                      };
                  }
              ).config.interval[intervalKey].max,
          )
        : getrand(min ?? 0, max ?? 0);

    const moduleName =
        logModule || type.charAt(0).toUpperCase() + type.slice(1);

    const ctxBase = ctx as unknown as CtxWithLogger;

    await withRateLimit(ctxBase, {
        type: logType,
        module: moduleName,
        key,
        run: async () => {
            if (beforeRun) beforeRun();
            const msg = await channel.send({ content: buildContent() });
            if (onRun) await onRun(ctx, channel, msg);
        },
        onFinally,
        onSuccess: () => {
            ctxBase.loops.schedule(
                () => selfLoop(ctx, channel, opts),
                interval,
                key,
            );
        },
    });
}

export type { Channel, SelfLoopOpts };
export { selfLoop };
