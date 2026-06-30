const { describe, it } = require("node:test");
const assert = require("node:assert");

const {
    parseChecklistInterval,
    getIncompleteItems,
} = require("../src/services/checklist");

describe("parseChecklistInterval", () => {
    it("parses hours and minutes", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 1H 30M"),
            5400000,
        );
    });

    it("parses only hours", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 2H"),
            7200000,
        );
    });

    it("parses only minutes", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 45M"),
            2700000,
        );
    });

    it("parses only seconds", () => {
        assert.strictEqual(
            parseChecklistInterval("Next checklist in 30S"),
            30000,
        );
    });

    it("returns 0 for empty string", () => {
        assert.strictEqual(parseChecklistInterval(""), 0);
    });

    it("returns 0 when no duration pattern found", () => {
        assert.strictEqual(parseChecklistInterval("No checklist available"), 0);
    });
});

describe("getIncompleteItems", () => {
    it("returns empty array when checklist is complete", () => {
        const items = getIncompleteItems("☑️ 🎉 Some completed checklist");
        assert.deepStrictEqual(items, []);
    });

    it("returns array of incomplete items", () => {
        const description = "⬛ 🎁 Claim daily reward\n⬛ 🍪 Send a cookie";
        const items = getIncompleteItems(description);
        assert.deepStrictEqual(items, [
            "⬛ 🎁 Claim daily reward",
            "⬛ 🍪 Send a cookie",
        ]);
    });
});
