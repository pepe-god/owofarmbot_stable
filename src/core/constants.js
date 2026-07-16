/**
 * Centralized constants shared across the bot (fixed external IDs/strings live here).
 */

// OwO (408785106942164992) is the only bot that can issue captcha prompts, hunt results, inventory replies, etc.
const OWO_ID = "408785106942164992";

// Default prefix used when config.settings.owoprefix is empty.
const DEFAULT_PREFIX = "owo";

// Gem names required for farming — gem1, gem3, gem4 are the three core gems
// that the bot checks for in hunt results and uses from inventory.
const REQUIRED_GEMS = ["gem1", "gem3", "gem4"];

// Maps gem names to their inventory item codes (weakest-first), matching the
// rarity levels documented in RARITY_MAP.
const GEM_ITEMS = {
    gem1: ["057", "056", "055", "054", "053", "052", "051"],
    gem3: ["071", "070", "069", "068", "067", "066", "065"],
    gem4: ["078", "077", "076", "075", "074", "073", "072"],
    star: ["085", "084", "083", "082", "081", "080", "079"],
};

// Maps rarity names to numeric levels used for gem selection.
const RARITY_MAP = {
    fabled: 7,
    legendary: 6,
    mythical: 5,
    epic: 4,
    rare: 3,
    uncommon: 2,
    common: 1,
};

const RARITY_LIST = Object.keys(RARITY_MAP);

// Maps animal type names to the suffix character OwO uses in commands.
const ANIMAL_TYPE_MAP = {
    common: " c",
    uncommon: " u",
    rare: " r",
    epic: " e",
    mythical: " m",
    patreon: " p",
    cpatreon: " cp",
    legendary: " l",
    gem: " g",
    bot: " b",
    distorted: " d",
    fabled: " f",
    special: " s",
    hidden: " h",
};

const ANIMAL_TYPE_LIST = Object.keys(ANIMAL_TYPE_MAP);

// Discord user tokens are three dot-separated base64url segments
// (e.g. "<id>.<timestamp>.<secret>").
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

module.exports = {
    OWO_ID,
    DEFAULT_PREFIX,
    REQUIRED_GEMS,
    GEM_ITEMS,
    RARITY_MAP,
    RARITY_LIST,
    ANIMAL_TYPE_MAP,
    ANIMAL_TYPE_LIST,
    TOKEN_SHAPE,
};
