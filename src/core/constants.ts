/** Centralized constants shared across the bot (fixed external IDs/strings live here). */

// OwO (408785106942164992) is the only bot that can issue captcha prompts, hunt results, inventory replies, etc.
export const OWO_ID = "408785106942164992";

// Default prefix used when config.settings.owoprefix is empty.
export const DEFAULT_PREFIX = "owo";

// Gem names required for farming — gem1, gem3, gem4 are the three core gems
// that the bot checks for in hunt results and uses from inventory.
export const REQUIRED_GEMS = ["gem1", "gem3", "gem4"] as const;

// Maps gem names to their inventory item codes (weakest-first), matching the
// rarity levels documented in RARITY_MAP.
export const GEM_ITEMS: Record<string, string[]> = {
    gem1: ["057", "056", "055", "054", "053", "052", "051"],
    gem3: ["071", "070", "069", "068", "067", "066", "065"],
    gem4: ["078", "077", "076", "075", "074", "073", "072"],
    star: ["085", "084", "083", "082", "081", "080", "079"],
};

// Maps rarity names to numeric levels used for gem selection.
export const RARITY_MAP: Record<string, number> = {
    fabled: 7,
    legendary: 6,
    mythical: 5,
    epic: 4,
    rare: 3,
    uncommon: 2,
    common: 1,
};

export const RARITY_LIST = Object.keys(RARITY_MAP);

// Maps animal type names to the suffix character OwO uses in commands.
export const ANIMAL_TYPE_MAP: Record<string, string> = {
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

export const ANIMAL_TYPE_LIST = Object.keys(ANIMAL_TYPE_MAP);

// Discord user tokens are three dot-separated base64url segments
// (e.g. "<id>.<timestamp>.<secret>").
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
