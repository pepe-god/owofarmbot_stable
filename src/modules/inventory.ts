/**
 * Inventory subsystem: parse hunt results for missing gems, fetch inventory,
 * select gem codes, use items, apply gems.
 */

import { GEM_ITEMS, OWO_ID, REQUIRED_GEMS } from "../core/constants.js";
import { commandrandomizer, getrand } from "../core/globalutil.js";
import type { Channel, Ctx } from "../core/types.js";

// ─── ITEM_ACTIONS ────────────────────────────────────────────────────────

interface ItemAction {
    setting: string;
    cmd: () => string;
}

const ITEM_ACTIONS: Record<string, ItemAction> = {
    "050": {
        setting: "lootbox",
        cmd: () => commandrandomizer(["lb", "lootbox"]),
    },
    "049": { setting: "fabledlootbox", cmd: () => "lootbox fabled" },
    100: { setting: "crate", cmd: () => commandrandomizer(["wc", "crate"]) },
};

// ─── gemHandler logic ────────────────────────────────────────────────────

/**
 * Recompute `ctx.global.gems.need` from the hunt reply (missing REQUIRED_GEMS + first-time event star) and delegate to handleMissingGems.
 */
export async function huntResult(
    ctx: Ctx,
    channel: Channel,
    huntmsg: { id: string },
) {
    if (!ctx.config.settings.inventory.use.gems) return;

    const message = await ctx.globalutil.waitForMessage(
        ctx,
        channel,
        (msg: unknown) => {
            const m = msg as {
                content: string;
                author: { id: string };
                channel: { id: string };
                id: string;
            };
            return (
                (m.content.includes("and caught a") ||
                    m.content.includes("You found:")) &&
                m.author.id === OWO_ID &&
                m.channel.id === channel.id &&
                m.id.localeCompare(huntmsg.id) > 0
            );
        },
    );

    if (message == null) {
        ctx.logger.alert("Farm", "Hunt", "Couldn't retrieve hunting result!");
        return;
    }

    const huntmsgcontent = (message as { content: string }).content;
    ctx.global.gems.need = [];
    ctx.global.gems.use = "";
    ctx.global.gems.huntssinceinv++;

    if (!huntmsgcontent) return;

    for (const gem of REQUIRED_GEMS) {
        if (!huntmsgcontent.includes(gem)) ctx.global.gems.need.push(gem);
    }

    if (ctx.global.gems.isevent) {
        if (!huntmsgcontent.includes("star")) {
            if (!ctx.global.temp.usedevent) {
                ctx.global.gems.need.push("star");
                ctx.global.temp.usedevent = true;
            } else {
                ctx.global.gems.isevent = false;
                ctx.logger.info("Farm", "Hunt", "Event not found");
            }
        } else ctx.global.temp.usedevent = false;
    }

    if (ctx.global.gems.need.length > 0) {
        handleMissingGems(ctx, channel, huntmsgcontent);
    }
}

function triggerInventory(ctx: Ctx, delay: number) {
    ctx.loops.schedule(
        () => inventory(ctx, channelFromCtx(ctx)),
        delay,
        "farm:inventory",
    );
}

function channelFromCtx(ctx: Ctx): Channel {
    return ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    ) as Channel;
}

function handleMissingGems(ctx: Ctx, channel: Channel, huntContent: string) {
    ctx.logger.warn("Farm", "Hunt", `Missing gems: ${ctx.global.gems.need}`);
    if (!ctx.config.main.commands.inventory) return;

    if (!ctx.global.gems.missingHandled) {
        ctx.global.gems.missingHandled = true;
        ctx.global.gems.huntssinceinv = 0;
        channel.send({
            content: `${ctx.prefix()} ${commandrandomizer(["lb", "lootbox"])} all`,
        });
        triggerInventory(ctx, 5000);
        return;
    }

    if (huntContent?.includes("lootbox")) {
        ctx.global.gems.huntssinceinv = 0;
        triggerInventory(ctx, 2000);
        return;
    }

    if (ctx.global.gems.huntssinceinv >= getrand(15, 30)) {
        ctx.global.gems.huntssinceinv = 0;
        triggerInventory(ctx, 2000);
    }
}

// ─── Inventory logic ─────────────────────────────────────────────────────

/**
 * Entry point: resolves the commands channel and runs the one-shot inventory routine.
 */
export default async function runInventory(ctx: Ctx) {
    const channel = ctx.client.channels.cache.get(
        ctx.config.main.commandschannelid,
    );
    if (!channel) return;
    await inventory(ctx, channel as unknown as Channel);
}

/**
 * Extract backtick-quoted item codes (e.g. `` `057` ``) from the inventory response.
 */
export function parseItemCodes(invContent: string): string[] {
    const values: string[] = [];
    const regex = /`(\d{2,3})`/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(invContent)) !== null) {
        values.push(match[1]);
    }
    return values;
}

/**
 * For each needed gem, append the weakest owned GEM_ITEMS code usable at the current rareLevel.
 */
export function selectGemCodes(ctx: Ctx, values: string[]) {
    if (
        ctx.global.gems.need.length === 0 ||
        !ctx.config.settings.inventory.use.gems
    )
        return;

    ctx.global.gems.need.forEach((gem) => {
        const codes = GEM_ITEMS[gem];
        if (!codes) return;
        for (let i = 0; i < codes.length; i++) {
            if (values.includes(codes[i])) {
                ctx.global.gems.use += `${codes[i]} `;
                break;
            }
        }
    });
}

/**
 * For each enabled ITEM_ACTIONS code, send its use command ("all").
 */
export async function useItemsFromInventory(
    ctx: Ctx,
    channel: Channel,
    values: string[],
) {
    for (const code of values) {
        const action = ITEM_ACTIONS[code];
        if (!action) continue;
        if (
            (ctx.config.settings.inventory.use as Record<string, boolean>)[
                action.setting
            ]
        ) {
            await use(ctx, channel, action.cmd(), "all", "inventory");
            ctx.global.gems.huntssinceinv = 0;
        }
        await ctx.delay(2500);
    }
}

async function applyGems(ctx: Ctx, channel: Channel) {
    if (ctx.global.gems.use.length === 0) return;

    await use(ctx, channel, `use ${ctx.global.gems.use}`, "", "inventory");
    ctx.global.gems.need = [];
    ctx.global.gems.use = "";
    ctx.global.gems.huntssinceinv = 0;
    ctx.global.gems.missingHandled = false;
    await ctx.delay(3000);
}

async function inventory(ctx: Ctx, channel: Channel) {
    if (ctx.global.captchadetected || ctx.global.paused || ctx.global.inventory)
        return;

    try {
        const invContent = await fetchInventoryData(ctx, channel);
        if (invContent == null) return;

        const codes = parseItemCodes(invContent);
        ctx.logger.info(
            "Farm",
            "Inventory",
            `Parsed codes: ${codes.join(",")}`,
        );
        selectGemCodes(ctx, codes);
        ctx.logger.info(
            "Farm",
            "Inventory",
            `Gems to use: "${ctx.global.gems.use}" (need: ${ctx.global.gems.need.join(",")})`,
        );

        await ctx.delay(4000);
        await useItemsFromInventory(ctx, channel, codes);
        await applyGems(ctx, channel);

        ctx.logger.info("Farm", "Inventory", `Paused: ${ctx.global.inventory}`);
    } finally {
        ctx.state.endInventory();
    }
}

async function fetchInventoryData(ctx: Ctx, channel: Channel) {
    ctx.state.startInventory();
    ctx.logger.info(
        "Farm",
        "Inventory",
        "Paused: true! Retrieving inventory...",
    );

    const msg = await channel.send({
        content: `owo ${commandrandomizer(["inv", "inventory"])}`,
    });

    const reply = await ctx.globalutil.waitForMessage(
        ctx,
        channel,
        (m: unknown) => {
            const msgObj = m as {
                content: string;
                author: { id: string };
                channel: { id: string };
                id: string;
            };
            return (
                msgObj.content.includes("Inventory =") &&
                msgObj.author.id === OWO_ID &&
                msgObj.channel.id === channel.id &&
                msgObj.id.localeCompare(msg.id) > 0
            );
        },
    );

    if (reply == null) {
        ctx.logger.alert("Farm", "inventory", "Couldn't retrieve inventory");
        return null;
    }

    if (ctx.global.captchadetected || ctx.global.paused) return null;
    return (reply as { content: string }).content;
}

async function use(
    ctx: Ctx,
    channel: Channel,
    item: string,
    count: string,
    where: string,
) {
    if (
        ctx.global.captchadetected ||
        (ctx.global.paused && where !== "inventory")
    )
        return;
    ctx.global.use = true;
    try {
        await channel.send({ content: `${ctx.prefix()} ${item} ${count}` });
        ctx.logger.info("Farm", "Use", item);
        await ctx.delay(5000);
    } finally {
        ctx.global.use = false;
    }
}
