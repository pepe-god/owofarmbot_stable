const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("parseQuests (basic)", () => {
    it("parses multiple quests with all fields", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const embed = [
            `**1. Say 'owo' x10**`,
            `Reward:\` 25 <:cowoncy:123>\``,
            `Progress: [0/10]`,
            ``,
            `**2. Gamble 2 times**`,
            `Reward:\` 1 <:weaponshard:456>\``,
            `Progress: [1/2] 🔒 Locked`,
            ``,
            `**3. Use an action command on someone**`,
            `Reward:\` 50 <:cowoncy:789>\``,
            `Progress: [0/5]`,
        ].join("\n");

        const quests = parseQuests(embed);

        assert.strictEqual(quests.length, 3);
        assert.strictEqual(quests[0].title, "Say 'owo' x10");
        assert.strictEqual(quests[0].reward, "25");
        assert.strictEqual(quests[0].type, "cowoncy");
        assert.strictEqual(quests[0].pro1, 0);
        assert.strictEqual(quests[0].pro2, 10);
        assert.strictEqual(quests[0].isLocked, false);
        assert.strictEqual(quests[1].title, "Gamble 2 times");
        assert.strictEqual(quests[1].reward, "1");
        assert.strictEqual(quests[1].type, "weaponshard");
        assert.strictEqual(quests[1].pro1, 1);
        assert.strictEqual(quests[1].pro2, 2);
        assert.strictEqual(quests[1].isLocked, true);
        assert.strictEqual(quests[2].title, "Use an action command on someone");
        assert.strictEqual(quests[2].reward, "50");
        assert.strictEqual(quests[2].type, "cowoncy");
        assert.strictEqual(quests[2].pro1, 0);
        assert.strictEqual(quests[2].pro2, 5);
        assert.strictEqual(quests[2].isLocked, false);
    });

    it("returns empty for finished-all message", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const quests = parseQuests("You finished all of your quests!");
        assert.strictEqual(quests.length, 0);
    });

    it("returns empty for empty string", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const quests = parseQuests("");
        assert.strictEqual(quests.length, 0);
    });

    it("handles single quest", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const embed = [
            `**1. Say 'owo' x1**`,
            `Reward:\` 100 <:cowoncy:123>\``,
            `Progress: [0/1]`,
        ].join("\n");

        const quests = parseQuests(embed);
        assert.strictEqual(quests.length, 1);
        assert.strictEqual(quests[0].title, "Say 'owo' x1");
    });
});

describe("parseQuests (reward types)", () => {
    it("handles quest without reward section", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const embed = [`**1. Special quest**`, `Progress: [0/3]`].join("\n");

        const quests = parseQuests(embed);

        assert.strictEqual(quests.length, 1);
        assert.strictEqual(quests[0].reward, "");
        assert.strictEqual(quests[0].type, "");
        assert.strictEqual(quests[0].pro1, 0);
        assert.strictEqual(quests[0].pro2, 3);
        assert.strictEqual(quests[0].isLocked, false);
    });

    it("parses crate reward type", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const embed = [
            `**1. Say 'owo' x5**`,
            `Reward:\` 3 <:crate:456>\``,
            `Progress: [2/5]`,
        ].join("\n");

        const quests = parseQuests(embed);

        assert.strictEqual(quests.length, 1);
        assert.strictEqual(quests[0].reward, "3");
        assert.strictEqual(quests[0].type, "crate");
        assert.strictEqual(quests[0].pro1, 2);
        assert.strictEqual(quests[0].pro2, 5);
    });

    it("parses box reward type", () => {
        const { parseQuests } = require("../src/modules/quest.js");
        const embed = [
            `**1. Open boxes**`,
            `Reward:\` 2 <:box:789>\``,
            `Progress: [0/3]`,
        ].join("\n");

        const quests = parseQuests(embed);

        assert.strictEqual(quests.length, 1);
        assert.strictEqual(quests[0].reward, "2");
        assert.strictEqual(quests[0].type, "box");
    });
});
