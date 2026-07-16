const test = require("node:test");
const assert = require("node:assert");

const inventory = require("../src/modules/inventory.js");
const { parseItemCodes, selectGemCodes, useItemsFromInventory } = inventory;
const { GEM_ITEMS } = require("../src/core/constants.js");

/**
 * Build a minimal ctx mock for the inventory selection helpers.
 * @param {Object} [overrides] - Partial overrides for config/global.
 * @returns {Object} A ctx-shaped object with no-op logger/delay.
 */
function makeCtx(overrides = {}) {
    return {
        config: {
            settings: {
                inventory: {
                    use: {
                        lootbox: true,
                        fabledlootbox: false,
                        crate: true,
                        gems: true,
                    },
                },
            },
        },
        global: {
            gems: {
                need: [],
                use: "",
                rareLevel: 7,
                huntssinceinv: 0,
                missingHandled: false,
            },
        },
        logger: { info: () => {}, warn: () => {}, alert: () => {} },
        delay: async () => {},
        prefix: () => "owo",
    };
}

// ---------------------------------------------------------------------------
// parseItemCodes
// ---------------------------------------------------------------------------

test("parseItemCodes extracts backtick-quoted item codes in order", () => {
    // Arrange
    const inv =
        "Inventory = `057` `071` `078` `050` `049` `100` (some text)";
    // Act
    const codes = parseItemCodes(inv);
    // Assert
    assert.deepStrictEqual(codes, ["057", "071", "078", "050", "049", "100"]);
});

test("parseItemCodes ignores arbitrary 2-3 digit numbers that are not item codes", () => {
    // Arrange: OwO inventory replies contain quantities, counts, ids that are
    // NOT item codes. These must not be treated as selectable items.
    const inv =
        "Inventory = `057` `071` You have 12 of these, 345 total, rank 99.";
    // Act
    const codes = parseItemCodes(inv);
    // Assert: only the backtick-quoted codes should be returned
    assert.deepStrictEqual(codes, ["057", "071"]);
});

test("parseItemCodes returns empty array when no codes present", () => {
    // Arrange
    const inv = "Inventory = You own nothing interesting. 12 345 99.";
    // Act
    const codes = parseItemCodes(inv);
    // Assert
    assert.deepStrictEqual(codes, []);
});

// ---------------------------------------------------------------------------
// selectGemCodes
// ---------------------------------------------------------------------------

test("selectGemCodes picks the HIGHEST-quality (strongest) owned gem code", () => {
    // Arrange: GEM_ITEMS is weakest-first, so gem1 = ["057","056",...,"051"].
    // If the user owns both 057 (strongest) and 053 (weaker), the bot should
    // use 057, not the first/weakest match.
    const ctx = makeCtx();
    ctx.global.gems.need = ["gem1"];
    const owned = ["053", "057", "071"]; // 057 is strongest owned for gem1
    // Act
    selectGemCodes(ctx, owned);
    // Assert
    assert.ok(
        ctx.global.gems.use.includes("057"),
        `expected strongest owned gem 057, got "${ctx.global.gems.use}"`,
    );
    assert.ok(
        !ctx.global.gems.use.includes("053"),
        `should not pick weaker gem 053 when 057 is owned`,
    );
});

test("selectGemCodes falls back to weaker code when strongest is absent", () => {
    // Arrange: only the weakest codes are owned.
    const ctx = makeCtx();
    ctx.global.gems.need = ["gem1"];
    const owned = ["053", "051"]; // 057..054 not owned
    // Act
    selectGemCodes(ctx, owned);
    // Assert: should pick the strongest *owned* = 053
    assert.ok(
        ctx.global.gems.use.includes("053"),
        `expected strongest owned gem 053, got "${ctx.global.gems.use}"`,
    );
});

test("selectGemCodes does nothing when gems setting disabled", () => {
    // Arrange
    const ctx = makeCtx();
    ctx.config.settings.inventory.use.gems = false;
    ctx.global.gems.need = ["gem1"];
    // Act
    selectGemCodes(ctx, ["057"]);
    // Assert
    assert.strictEqual(ctx.global.gems.use, "");
});

test("selectGemCodes handles multiple gem needs", () => {
    // Arrange
    const ctx = makeCtx();
    ctx.global.gems.need = ["gem1", "gem3", "gem4"];
    const owned = ["057", "071", "078"]; // strongest of each
    // Act
    selectGemCodes(ctx, owned);
    // Assert
    assert.ok(ctx.global.gems.use.includes("057"));
    assert.ok(ctx.global.gems.use.includes("071"));
    assert.ok(ctx.global.gems.use.includes("078"));
});

// ---------------------------------------------------------------------------
// useItemsFromInventory
// ---------------------------------------------------------------------------

test("useItemsFromInventory only uses ITEM_ACTIONS codes that are owned", () => {
    // Arrange: values contains a real item (050) plus a stray number (123)
    // that is NOT a defined item action.
    const ctx = makeCtx();
    const sent = [];
    const channel = {
        send: async ({ content }) => {
            sent.push(content);
        },
    };
    const values = ["050", "123"];
    // Act
    // delay is no-op so the loop completes synchronously-ish
    return useItemsFromInventory(ctx, channel, values).then(() => {
        // Assert: only the lootbox (050) use command should be sent
        assert.strictEqual(sent.length, 1);
        assert.ok(sent[0].includes("lb") || sent[0].includes("lootbox"));
        assert.ok(!sent.some((s) => s.includes("123")));
    });
});

test("useItemsFromInventory respects disabled settings", () => {
    // Arrange: lootbox disabled in config.
    const ctx = makeCtx();
    ctx.config.settings.inventory.use.lootbox = false;
    const sent = [];
    const channel = { send: async ({ content }) => sent.push(content) };
    // Act
    return useItemsFromInventory(ctx, channel, ["050"]).then(() => {
        // Assert: nothing sent because the setting is off
        assert.strictEqual(sent.length, 0);
    });
});

test("useItemsFromInventory uses fabled lootbox command for 049", () => {
    // Arrange
    const ctx = makeCtx();
    ctx.config.settings.inventory.use.fabledlootbox = true;
    const sent = [];
    const channel = { send: async ({ content }) => sent.push(content) };
    // Act
    return useItemsFromInventory(ctx, channel, ["049"]).then(() => {
        // Assert
        assert.strictEqual(sent.length, 1);
        assert.ok(sent[0].includes("lootbox fabled"));
    });
});
