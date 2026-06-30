const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert");

function makeClient() {
    return {
        global: { gamble: { cowoncywon: 0 } },
        logger: { info: () => {}, warn: () => {}, alert: () => {} },
    };
}

function makeGame(overrides = {}) {
    return {
        defaultBet: 100,
        maxBet: 10000,
        multiplier: 2,
        label: "Coinflip",
        checkWin: (content) => content.includes("and you won"),
        checkLoss: (content) => content.includes("and you lost"),
        parseWin: (_content, currentBet) => currentBet,
        ...overrides,
    };
}

describe("gamble", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe("processResult", () => {
        it("returns default bet on coinflip win", () => {
            const gamble = require("../src/modules/gamble.js");
            const client = makeClient();
            const game = makeGame();
            const logs = [];
            client.logger.info = (_, __, msg) => logs.push(msg);

            const result = gamble.processResult(
                client,
                game,
                "and you won!",
                100,
            );

            assert.deepStrictEqual(result, { newBet: 100 });
            assert.strictEqual(client.global.gamble.cowoncywon, 100);
            assert.ok(logs.some((l) => l.includes("Won")));
        });

        it("returns multiplied bet on coinflip loss", () => {
            const gamble = require("../src/modules/gamble.js");
            const client = makeClient();
            client.global.gamble.cowoncywon = 500;
            const game = makeGame();
            const logs = [];
            client.logger.info = (_, __, msg) => logs.push(msg);

            const result = gamble.processResult(
                client,
                game,
                "and you lost!",
                100,
            );

            assert.deepStrictEqual(result, { newBet: 200 }); // 100 * 2
            assert.strictEqual(client.global.gamble.cowoncywon, 400);
            assert.ok(logs.some((l) => l.includes("Lost")));
        });

        it("caps loss bet at maxBet", () => {
            const gamble = require("../src/modules/gamble.js");
            const client = makeClient();
            const game = makeGame({ maxBet: 150 });

            const result = gamble.processResult(
                client,
                game,
                "and you lost!",
                100,
            );

            // Math.min(Math.round(100 * 2), 150) = Math.min(200, 150) = 150
            assert.deepStrictEqual(result, { newBet: 150 });
        });

        it("returns default bet on slot win", () => {
            const gamble = require("../src/modules/gamble.js");
            const client = makeClient();
            const game = makeGame({
                defaultBet: 50,
                maxBet: 500,
                multiplier: 1.5,
                label: "Slot",
                checkWin: (content) =>
                    content.includes("and won") &&
                    !content.includes("nothing..."),
                checkLoss: (content) => content.includes("and won nothing..."),
                parseWin: (content, currentBet) => {
                    const match = content.match(
                        /and won <:\w+:\d+> (\d[\d,]*)/,
                    );
                    return Number(match[1].replace(/,/g, "")) - currentBet;
                },
            });

            const result = gamble.processResult(
                client,
                game,
                "SLOTS and won <:cowoncy:123> 5000",
                50,
            );

            assert.deepStrictEqual(result, { newBet: 50 });
            assert.strictEqual(client.global.gamble.cowoncywon, 4950);
        });

        it("returns multiplied bet on slot loss", () => {
            const gamble = require("../src/modules/gamble.js");
            const client = makeClient();
            const game = makeGame({
                defaultBet: 50,
                maxBet: 500,
                multiplier: 1.5,
                label: "Slot",
                checkWin: (content) =>
                    content.includes("and won") &&
                    !content.includes("nothing..."),
                checkLoss: (content) => content.includes("and won nothing..."),
                parseWin: () => 0,
            });

            const result = gamble.processResult(
                client,
                game,
                "SLOTS and won nothing...",
                50,
            );

            assert.deepStrictEqual(result, { newBet: 75 });
            assert.strictEqual(client.global.gamble.cowoncywon, -50);
        });

        it("returns null when no win or loss detected", () => {
            const gamble = require("../src/modules/gamble.js");
            const client = makeClient();
            const game = makeGame();

            const result = gamble.processResult(
                client,
                game,
                "some unrelated message",
                100,
            );

            assert.strictEqual(result, null);
            assert.strictEqual(client.global.gamble.cowoncywon, 0);
        });
    });

    describe("GAME_CONFIG", () => {
        it("coinflip checkWin detects win", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(
                GAME_CONFIG.coinflip.checkWin("and you won 100"),
                true,
            );
            assert.strictEqual(
                GAME_CONFIG.coinflip.checkWin("and you lost"),
                false,
            );
        });

        it("coinflip checkLoss detects loss", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(
                GAME_CONFIG.coinflip.checkLoss("and you lost 50"),
                true,
            );
            assert.strictEqual(
                GAME_CONFIG.coinflip.checkLoss("and you won"),
                false,
            );
        });

        it("coinflip isFreshResult correctly identifies old content", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(
                GAME_CONFIG.coinflip.isFreshResult("some random message"),
                true,
            );
            assert.strictEqual(
                GAME_CONFIG.coinflip.isFreshResult("and you won 100"),
                false,
            );
            assert.strictEqual(
                GAME_CONFIG.coinflip.isFreshResult("and you lost 50"),
                false,
            );
        });

        it("slot checkWin detects win", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(
                GAME_CONFIG.slot.checkWin("SLOTS and won 5000"),
                true,
            );
            assert.strictEqual(
                GAME_CONFIG.slot.checkWin("SLOTS and won nothing..."),
                false,
            );
        });

        it("slot checkLoss detects loss", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(
                GAME_CONFIG.slot.checkLoss("SLOTS and won nothing..."),
                true,
            );
            assert.strictEqual(
                GAME_CONFIG.slot.checkLoss("SLOTS and won 5000"),
                false,
            );
        });

        it("slot parseWin extracts winnings minus bet", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            const result = GAME_CONFIG.slot.parseWin(
                "and won <:cowoncy:12345> 5000",
                100,
            );
            assert.strictEqual(result, 4900);
        });

        it("slot parseWin handles comma-separated amounts", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            const result = GAME_CONFIG.slot.parseWin(
                "and won <:cowoncy:12345> 10,000",
                500,
            );
            assert.strictEqual(result, 9500);
        });

        it("coinflip parseWin returns currentBet", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            const result = GAME_CONFIG.coinflip.parseWin("and you won", 200);
            assert.strictEqual(result, 200);
        });

        it("coinfip collectorFilter matches and chose", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(
                GAME_CONFIG.coinflip.collectorFilter(
                    "You flipped and chose heads",
                ),
                true,
            );
            assert.strictEqual(
                GAME_CONFIG.coinflip.collectorFilter("SLOTS"),
                false,
            );
        });

        it("slot collectorFilter matches SLOTS", () => {
            const { GAME_CONFIG } = require("../src/modules/gamble.js");
            assert.strictEqual(GAME_CONFIG.slot.collectorFilter("SLOTS"), true);
            assert.strictEqual(
                GAME_CONFIG.slot.collectorFilter("and you won"),
                false,
            );
        });
    });
});
