/* eslint-disable no-control-regex */

/**
 * Schema-based configuration validation using valibot.
 *
 * Responsibilities:
 *  - validateConfig: run fatal and non-fatal checks, mutate config where the
 *    original validator did (pray/curse exclusion, interval clamping, gem rarity
 *    level, animal type suffix building) and return `{ success, errors }`.
 *  - parseConfigErrors: log collected errors and terminate the process on
 *    fatal failures.
 *  - getDebugConfig: log the full resolved config for debugging.
 *
 * Fatal checks (bot exits if any fail):
 *  - Token presence and length.
 *  - No duplicate channel IDs across features.
 *  - Valid gem rarity.
 *  - Valid animal types.
 *  - Sell/sacrifice conflict.
 *
 * Non-fatal checks (warn and auto-fix where possible):
 *  - Pray/curse mutual exclusion.
 *  - Interval bounds and defaults.
 */

const v = require("valibot");

// Discord user tokens are three dot-separated base64url segments
// (e.g. "<id>.<timestamp>.<secret>").
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

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

// Default min/max intervals (ms) per action type.
const INTERVAL_DEFAULTS = [
    { type: "hunt", min: 12000, max: 16000 },
    { type: "battle", min: 12000, max: 16000 },
    { type: "pray", min: 316000, max: 332000 },
    { type: "animals", min: 610000, max: 661000 },
];

const RARITY_LIST = Object.keys(RARITY_MAP);
const ANIMAL_TYPE_LIST = Object.keys(ANIMAL_TYPE_MAP);

// valibot schemas for the pure-shape leaves that map cleanly to the original
// checks. Custom messages keep the user-facing strings identical.
const tokenSchema = v.pipe(
    v.string(),
    v.minLength(10, "Main token is missing or too short!"),
    v.regex(TOKEN_SHAPE, "Main token is malformed!"),
);

const raritySchema = v.picklist(
    RARITY_LIST,
    "Gem rarity: Invalid value. Valid value is: fabled, legendary, mythical, epic, rare, uncommon, common",
);

const animalTypeSchema = v.picklist(ANIMAL_TYPE_LIST);

const showerr = (ctx, err) => {
    ctx.logger.alert("Bot", "Config", `Config conflict: ${err}`);
};

/**
 * Verify that the main token exists, has a minimum length, and matches the
 * Discord token shape.
 *
 * @returns {boolean} True if token is valid.
 */
const checkToken = (config, ctx) => {
    const token = config.main.token;
    const result = v.safeParse(tokenSchema, token ?? "");
    if (result.success) return true;
    const message = result.issues[0]?.message ?? "Main token is malformed!";
    showerr(
        ctx,
        message === "Main token is malformed!"
            ? "Main token is malformed! Discord tokens look like " +
                  "'<id>.<timestamp>.<secret>' (three dot-separated base64url " +
                  "segments). Set MAIN_TOKEN in your .env file."
            : "Main token is missing or too short! Set MAIN_TOKEN in your .env file.",
    );
    return false;
};

/**
 * Ensure the user did not reuse the same channel ID for multiple features
 * (hunt, battle, quest).
 *
 * @returns {boolean} True if all channel IDs are unique.
 */
const checkDuplicateChannels = (config, ctx) => {
    const vars = [
        config.main.commandschannelid,
        config.main.huntbotchannelid,
        config.main.autoquestchannelid,
    ];
    for (let i = 0; i < vars.length; i++) {
        for (let j = i + 1; j < vars.length; j++) {
            if (vars[i] === vars[j] && vars[i].length > 0) {
                showerr(ctx, "There are some duplicate channel id!");
                ctx.logger.info(
                    "Bot",
                    "Config",
                    "Please use four different channel for one tokentype for best efficiency!",
                );
                ctx.logger.info(
                    "Bot",
                    "Config",
                    "That mean if you use farm, huntbot, quest, you need three channel!",
                );
                return false;
            }
        }
    }
    return true;
};

/**
 * Enforce mutual exclusion between pray and curse. Only pray is kept active
 * if both are enabled.
 *
 * @sideeffect Disables `config.main.commands.curse` and `ctx.basic.curse` when both are enabled.
 */
const checkPrayCurseConflict = (ctx, config) => {
    if (config.main.commands.pray && config.main.commands.curse) {
        config.main.commands.curse = false;
        ctx.basic.curse = false;
        showerr(
            ctx,
            "Curse and pray cannot be turn on at the same time! By default pray will be used.",
        );
    }
};

/**
 * Parse the configured maximum gem rarity string into a numeric level.
 * Falls back to 7 (fabled) on invalid input.
 *
 * @returns {boolean} True if the rarity string was valid.
 */
const parseGemRarity = (ctx) => {
    if (!ctx.basic.maximum_gem_rarity?.length) return true;
    const rarity = ctx.basic.maximum_gem_rarity.toLowerCase();
    const result = v.safeParse(raritySchema, rarity);
    if (result.success) {
        ctx.global.rareLevel = RARITY_MAP[rarity];
        return true;
    }
    ctx.logger.warn(
        `Bot${ctx.chalk.white(" >> ")}${ctx.global.type}`,
        "Config",
        "Gem rarity: Invalid value. Valid value is: \n\tfabled, legendary, mythical, epic, rare, uncommon, common",
    );
    ctx.global.rareLevel = 7;
    return false;
};

/**
 * Build a concatenated string of enabled animal type suffixes from config.
 *
 * @returns {boolean} True if at least one animal type is enabled.
 */
const parseAnimalTypes = (ctx) => {
    if (!ctx.basic.commands.animals) return true;
    const animaltypes = ctx.config.animals.animaltype;
    for (const [type, isEnabled] of Object.entries(animaltypes)) {
        if (!isEnabled) continue;
        const result = v.safeParse(animalTypeSchema, type);
        if (!result.success) {
            ctx.logger.warn(
                `Bot${ctx.chalk.white(" >> ")}${ctx.global.type}`,
                "Config",
                `Animals: unknown animaltype "${type}"!`,
            );
            continue;
        }
        const suffix = ANIMAL_TYPE_MAP[type];
        if (suffix) ctx.global.temp.animaltype += suffix;
    }
    if (ctx.global.temp.animaltype.length > 0) return true;
    ctx.logger.warn(
        `Bot${ctx.chalk.white(" >> ")}${ctx.global.type}`,
        "Config",
        "Animals: no active animaltype found!?",
    );
    return false;
};

/**
 * Ensure sell and sacrifice modes are not both enabled for animals.
 *
 * @returns {boolean} True if the conflict does not exist.
 */
const checkSellSacrificeConflict = (config, ctx) => {
    if (!ctx.basic.commands.animals) return true;
    if (config.animals.type.sell && config.animals.type.sacrifice) {
        showerr(ctx, "Sell and sacrifice cannot be turn on at the same time!");
        return false;
    }
    return true;
};

/**
 * Clamp configured action intervals to safe minimums defined in
 * INTERVAL_DEFAULTS. Warns and resets any out-of-range values.
 *
 * @sideeffect Resets out-of-range `config.interval[type].min`/`max` to the defaults.
 */
const validateIntervals = (config, ctx) => {
    const intervals = ["hunt", "battle", "pray", "animals"];
    const missingValue = intervals.some(
        (type) => !config.interval[type]?.min || !config.interval[type]?.max,
    );

    if (missingValue) {
        showerr(ctx, "Interval cannot be null!");
        return;
    }

    for (const {
        type,
        min: minDefault,
        max: maxDefault,
    } of INTERVAL_DEFAULTS) {
        if (config.interval[type].min < minDefault) {
            ctx.logger.warn(
                "Bot",
                "Config",
                `${type} min interval is too low, resetting to default!`,
            );
            config.interval[type].min = minDefault;
        }
        if (
            config.interval[type].max < minDefault ||
            config.interval[type].max < config.interval[type].min
        ) {
            ctx.logger.warn(
                "Bot",
                "Config",
                `${type} max interval is too low or less than min, resetting to default!`,
            );
            config.interval[type].max = maxDefault;
        }
    }
};

/**
 * Run all fatal and non-fatal config validation checks.
 *
 * Fatal failures are collected into `errors` and surfaced via
 * `parseConfigErrors`, which terminates the process. Non-fatal issues are
 * auto-corrected in place (pray/curse, interval clamping) and logged as
 * warnings.
 *
 * @returns {{ success: boolean, errors: string[] }}
 */
const validateConfig = (ctx, config) => {
    ctx.logger.info("Bot", "Config", "Verifying Config... Please wait...");

    const errors = [];
    const fatalChecks = [
        () => checkToken(config, ctx),
        () => checkDuplicateChannels(config, ctx),
        () => parseGemRarity(ctx),
        () => parseAnimalTypes(ctx),
        () => checkSellSacrificeConflict(config, ctx),
    ];

    let ok = true;
    for (const check of fatalChecks) {
        if (!check()) ok = false;
    }

    checkPrayCurseConflict(ctx, config);
    validateIntervals(config, ctx);

    if (!ok) {
        errors.push(
            "Config is not verified or contains errors, please check the logs and fix the errors!",
        );
    } else {
        ctx.logger.info(
            "Bot",
            "Config",
            "Config verified, things seem to be okey :3",
        );
    }

    return { success: ok, errors };
};

/**
 * Log collected config errors and terminate the process on fatal failures.
 *
 * @param {string[]} errors - Array of error messages to log.
 * @param {BotContext} ctx - The bot context; provides the logger.
 */
const parseConfigErrors = (errors, ctx) => {
    if (!errors || errors.length === 0) return;
    for (const err of errors) {
        ctx.logger.alert("Bot", "Config", err);
    }
    setTimeout(() => {
        ctx.logger.warn("Bot", "Config", "Exiting...");
        process.exit(1);
    }, 1600);
};

/**
 * Log the full resolved configuration for debugging purposes.
 */
const getDebugConfig = (ctx, config) => {
    const packageJson = require("../../package.json");

    ctx.logger.debug(`OwO Farm Bot Stable - Debug log
Basic information
-------------------------
Version: ${packageJson.version}
Platform: ${process.platform} (using process.platform)
-------------------------

Config
-------------------------
Main commands:
  Hunt: ${config.main.commands.hunt} - type: ${typeof config.main.commands.hunt}
  Battle: ${config.main.commands.battle} - type: ${typeof config.main.commands.battle}
  Pray: ${config.main.commands.pray} - type: ${typeof config.main.commands.pray}
  Curse: ${config.main.commands.curse} - type: ${typeof config.main.commands.curse}
  Huntbot: 
    Enable: ${config.main.commands.huntbot.enable} - type: ${typeof config.main.commands.huntbot.enable}
    Max Time: ${config.main.commands.huntbot.maxtime} - type: ${typeof config.main.commands.huntbot.maxtime}
    Upgrade: ${config.main.commands.huntbot.upgrade} - type: ${typeof config.main.commands.huntbot.upgrade}
    Upgrade Type: ${config.main.commands.huntbot.upgradetype} - type: ${typeof config.main.commands.huntbot.upgradetype}
  Animals: ${config.main.commands.animals} - type: ${typeof config.main.commands.animals}
  Inventory: ${config.main.commands.inventory} - type: ${typeof config.main.commands.inventory}
  Checklist: ${config.main.commands.checklist} - type: ${typeof config.main.commands.checklist}
  Autoquest: ${config.main.commands.autoquest} - type: ${typeof config.main.commands.autoquest}
  Gem rarity: ${config.main.maximum_gem_rarity} - type: ${typeof config.main.maximum_gem_rarity}

Elaina: ${config.settings.autophrases} - type: ${typeof config.settings.autophrases}
Join giveaways: ${config.settings.autojoingiveaways} - type: ${typeof config.settings.autojoingiveaways}

Checklist:
  Daily: ${config.settings.checklist.types.daily} - type: ${typeof config.settings.checklist.types.daily}
  Cookie: ${config.settings.checklist.types.cookie} - type: ${typeof config.settings.checklist.types.cookie}
  Vote: ${config.settings.checklist.types.vote} - type: ${typeof config.settings.checklist.types.vote}

Inventory:
  Use:
    Lootbox: ${config.settings.inventory.use.lootbox} - type: ${typeof config.settings.inventory.use.lootbox}
    Fabled Lootbox: ${config.settings.inventory.use.fabledlootbox} - type: ${typeof config.settings.inventory.use.fabledlootbox}
    Crate: ${config.settings.inventory.use.crate} - type: ${typeof config.settings.inventory.use.crate}
    Gems: ${config.settings.inventory.use.gems} - type: ${typeof config.settings.inventory.use.gems}


Safety:
  Auto Pause: ${config.settings.safety.autopause} - type: ${typeof config.settings.safety.autopause}
  Pause After: ${config.settings.safety.pauseafter} - type: ${typeof config.settings.safety.pauseafter}
  Pause For: ${config.settings.safety.pausefor} - type: ${typeof config.settings.safety.pausefor}

Captcha:
  Auto Solve: ${config.settings.captcha.autosolve} - type: ${typeof config.settings.captcha.autosolve}
  Alert Type:
    Webhook: ${config.settings.captcha.alerttype.webhook} - type: ${typeof config.settings.captcha.alerttype.webhook}
    Desktop:
      Force: ${config.settings.captcha.alerttype.desktop.force} - type: ${typeof config.settings.captcha.alerttype.desktop.force}
      Notification: ${config.settings.captcha.alerttype.desktop.notification} - type: ${typeof config.settings.captcha.alerttype.desktop.notification}
      Prompt: ${config.settings.captcha.alerttype.desktop.prompt} - type: ${typeof config.settings.captcha.alerttype.desktop.prompt}

Animals:
  Sell: ${config.animals.type.sell} - type: ${typeof config.animals.type.sell}
  Sacrifice: ${config.animals.type.sacrifice} - type: ${typeof config.animals.type.sacrifice}

Interval:
  Hunt: ${config.interval.hunt.min} - ${config.interval.hunt.max}
  Type: ${typeof config.interval.hunt.min} - ${typeof config.interval.hunt.max}

  Battle: ${config.interval.battle.min} - ${config.interval.battle.max}
  Type: ${typeof config.interval.battle.min} - ${typeof config.interval.battle.max}

  Pray: ${config.interval.pray.min} - ${config.interval.pray.max}
  Type: ${typeof config.interval.pray.min} - ${typeof config.interval.pray.max}



  Animals: ${config.interval.animals.min} - ${config.interval.animals.max}
  Type: ${typeof config.interval.animals.min} - ${typeof config.interval.animals.max}

  Checklist: ${config.interval.checklist} - type: ${typeof config.interval.checklist}
-------------------------
`);
};

module.exports = {
    validateConfig,
    parseConfigErrors,
    getDebugConfig,
    checkToken,
    RARITY_MAP,
    ANIMAL_TYPE_MAP,
    INTERVAL_DEFAULTS,
};
