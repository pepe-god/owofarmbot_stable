/**
 * Farming subsystems: hunt/battle, pray/curse, animal sell/sacrifice.
 *
 * Merged from: farm.js, luck.js, animals.js
 * All use the shared selfLoop helper from loop.js.
 */

import { capitalize, commandrandomizer } from "../core/globalutil.js";
import type { Ctx } from "../core/types.js";
import { startAutophrases } from "./autophrases.js";
import { huntResult } from "./inventory.js";
import { selfLoop } from "./loop.js";

// ─── Farm (hunt/battle) ──────────────────────────────────────────────────

/**
 * Boots the hunt/battle loop (battle starts 2s after hunt) and optional autophrases.
 */
export async function startFarm(ctx: Ctx) {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );
    if (!channel) return;

    if (ctx.config.settings.autophrases) {
        startAutophrases(ctx, channel);
    }

    if (ctx.config.main.commands.hunt) {
        startFarmAction(ctx, channel, "hunt", () =>
            commandrandomizer(["h", "hunt"]),
        );
        await ctx.delay(2000);
        if (ctx.config.main.commands.battle)
            startFarmAction(ctx, channel, "battle", () =>
                commandrandomizer(["b", "battle"]),
            );
    } else if (ctx.config.main.commands.battle)
        startFarmAction(ctx, channel, "battle", () =>
            commandrandomizer(["b", "battle"]),
        );
}

function startFarmAction(
    ctx: Ctx,
    channel: NonNullable<ReturnType<Ctx["client"]["channels"]["cache"]["get"]>>,
    type: string,
    cmd: () => string,
) {
    const other = type === "hunt" ? "battle" : "hunt";
    selfLoop(ctx, channel, {
        type,
        key: `farm:${type}`,
        intervalKey: type,
        buildContent: () => `${ctx.prefix()} ${cmd()}`,
        onRun: async (c: Ctx, ch: unknown, msg: { id: string }) => {
            if (c.global[other] as boolean) await c.delay(1500);
            c.global.total[type]++;
            c.logger.info(
                "Farm",
                capitalize(type),
                `Total ${type}: ${c.global.total[type]}`,
            );
            if (type === "hunt")
                await huntResult(
                    c as unknown as Parameters<typeof huntResult>[0],
                    ch as Parameters<typeof huntResult>[1],
                    msg,
                );
        },
        onFinally: () => {
            (ctx.global[type] as boolean) = false;
        },
        beforeRun: () => {
            (ctx.global[type] as boolean) = true;
        },
    });
}

// ─── Luck (pray/curse) ───────────────────────────────────────────────────

/**
 * Starts the pray/curse loop (whichever is enabled in config).
 */
export async function startLuck(ctx: Ctx) {
    if (ctx.config.main.commands.pray) prayOrCurse(ctx, "pray");
    else if (ctx.config.main.commands.curse) prayOrCurse(ctx, "curse");
}

function prayOrCurse(ctx: Ctx, type: string) {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );
    if (!channel) return;
    const target = ctx.config.main.commands.pray
        ? ` <@${ctx.config.main.userid}>`
        : "";

    selfLoop(ctx, channel, {
        type,
        key: `luck:${type}`,
        intervalKey: "pray",
        buildContent: () => `${ctx.prefix()}${type}${target}`,
        onRun: async (c: Ctx) => {
            c.global.total[type]++;
            c.logger.info(
                "Farm",
                capitalize(type),
                `Total ${type}: ${c.global.total[type]}`,
            );
        },
    });
}

// ─── Animals (sell/sacrifice) ────────────────────────────────────────────

/**
 * Self-looping sell/sacrifice for configured animal types.
 */
export async function startAnimals(
    ctx: Ctx,
    channel: NonNullable<ReturnType<Ctx["client"]["channels"]["cache"]["get"]>>,
    choose: string,
    types: string,
) {
    if (ctx.global.captchadetected || ctx.global.paused) {
        ctx.loops.schedule(
            () => startAnimals(ctx, channel, choose, types),
            16000,
            "animals",
        );
        return;
    }

    selfLoop(ctx, channel, {
        type: choose,
        key: `animals:${choose}`,
        intervalKey: "animals",
        logModule: capitalize(choose),
        buildContent: () => `${ctx.prefix()} ${choose} ${types}`,
    });
}
