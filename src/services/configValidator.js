/* eslint-disable no-control-regex */

/**
 * Configuration validation and debug-dump utilities.
 *
 * Responsibilities:
 *  - verifyconfig: run fatal and non-fatal checks on startup.
 *  - getconfig: log the full resolved config for debugging.
 *
 * Fatal checks (bot exits if any fail):
 *  - Token presence and length.
 *  - No duplicate channel IDs across features.
 *  - Gamble default amount > 0 for every enabled game.
 *  - Valid gem rarity.
 *  - Valid animal types.
 *  - Sell/sacrifice conflict.
 *
 * Non-fatal checks (warn and auto-fix where possible):
 *  - Pray/curse mutual exclusion.
 *  - Interval bounds and defaults.
 */

const _path = require("node:path");
const _fse = require("fs-extra");

// --- Constants ---

/**
 * Maps rarity names to numeric levels used for gem selection.
 * Higher numbers mean rarer gems. Consumed by `parseGemRarity`.
 * @type {Object.<string, number>}
 */
const RARITY_MAP = {
    fabled: 7,
    legendary: 6,
    mythical: 5,
    epic: 4,
    rare: 3,
    uncommon: 2,
    common: 1,
};

/**
 * Maps animal type names to the suffix character OwO uses in commands.
 * Built by `parseAnimalTypes` into `client.global.temp.animaltype`.
 * @type {Object.<string, string>}
 */
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

/**
 * Default min/max intervals (ms) per action type.
 * Used to clamp user-configured values that are too aggressive.
 * @type {Array<{ type: string, min: number, max: number }>}
 */
const INTERVAL_DEFAULTS = [
    { type: "hunt", min: 12000, max: 16000 },
    { type: "battle", min: 12000, max: 16000 },
    { type: "pray", min: 316000, max: 332000 },
    { type: "coinflip", min: 12000, max: 16000 },
    { type: "slot", min: 12000, max: 16000 },
    { type: "animals", min: 610000, max: 661000 },
];

// --- Helper functions (module-internal) ---

/**
 * Log a config-related alert message.
 *
 * @param {Client} client - The Discord client instance; used for logging.
 * @param {string} err - The human-readable conflict description.
 * @returns {void}
 */
const showerr = (client, err) => {
    client.logger.alert("Bot", "Config", `Config conflict: ${err}`);
};

/**
 * Verify that the main token exists and has a minimum length.
 *
 * @returns {boolean} True if token is valid.
 */
const checkToken = (config, client) => {
    if (config.main.token && config.main.token.length >= 10) return true;
    showerr(client, "Main token is missing or invalid! Set MAIN_TOKEN in .env");
    return false;
};

/**
 * Ensure the user did not reuse the same channel ID for multiple features
 * (hunt, battle, quest, gamble), which would cause command collisions.
 *
 * @returns {boolean} True if all channel IDs are unique.
 */
const checkDuplicateChannels = (config, client) => {
    const vars = [
        config.main.commandschannelid,
        config.main.huntbotchannelid,
        config.main.gamblechannelid,
        config.main.autoquestchannelid,
    ];
    for (let i = 0; i < vars.length; i++) {
        for (let j = i + 1; j < vars.length; j++) {
            if (vars[i] === vars[j] && vars[i].length > 0) {
                showerr(client, "There are some duplicate channel id!");
                console.log(
                    "Please use four different channel for one tokentype for best efficiency!",
                );
                console.log(
                    "That mean if you use farm, huntbot, quest and gamble, you need four channel!",
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
 * @param {Client} client - The Discord client instance; may disable `basic.curse`.
 * @param {Object} config - The resolved config; `main.commands.curse` may be turned off.
 * @returns {void}
 * @sideeffect Disables `config.main.commands.curse` and `client.basic.curse` when both are enabled, and logs a conflict.
 */
const checkPrayCurseConflict = (client, config) => {
    if (config.main.commands.pray && config.main.commands.curse) {
        config.main.commands.curse = false;
        client.basic.curse = false;
        showerr(
            client,
            "Curse and pray cannot be turn on at the same time! By default pray will be used.",
        );
    }
};

/**
 * Validate gamble default amounts are positive numbers for every enabled game.
 *
 * @returns {boolean} True if all enabled game amounts are valid.
 */
const checkGambleAmount = (config, client) => {
    const { coinflip, slot } = config.main.commands.gamble;
    const amounts = config.settings.gamble;
    if (
        (coinflip && amounts.coinflip.default_amount <= 0) ||
        (slot && amounts.slot.default_amount <= 0)
    ) {
        showerr(client, "Invalid gamble amount!");
        return false;
    }
    return true;
};

/**
 * Parse the configured maximum gem rarity string into a numeric level.
 * Falls back to 7 (fabled) on invalid input.
 *
 * @returns {boolean} True if the rarity string was valid.
 */
const parseGemRarity = (client) => {
    if (!client.basic.maximum_gem_rarity?.length) return true;
    const rarity = client.basic.maximum_gem_rarity.toLowerCase();
    const level = RARITY_MAP[rarity];
    if (level !== undefined) {
        client.global.rareLevel = level;
        return true;
    }
    client.logger.warn(
        `Bot${client.chalk.white(" >> ")}${client.global.type}`,
        "Config",
        "Gem rarity: Invalid value. Valid value is: \n\tfabled, legendary, mythical, epic, rare, uncommon, common",
    );
    client.global.rareLevel = 7;
    return false;
};

/**
 * Build a concatenated string of enabled animal type suffixes from config.
 * The resulting string is stored in `client.global.temp.animaltype` and
 * appended to animal sell/sacrifice commands.
 *
 * @returns {boolean} True if at least one animal type is enabled.
 */
const parseAnimalTypes = (client) => {
    if (!client.basic.commands.animals) return true;
    const animaltypes = client.config.animals.animaltype;
    for (const [type, isEnabled] of Object.entries(animaltypes)) {
        if (!isEnabled) continue;
        const suffix = ANIMAL_TYPE_MAP[type];
        if (suffix) client.global.temp.animaltype += suffix;
    }
    if (client.global.temp.animaltype.length > 0) return true;
    client.logger.warn(
        `Bot${client.chalk.white(" >> ")}${client.global.type}`,
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
const checkSellSacrificeConflict = (config, client) => {
    if (!client.basic.commands.animals) return true;
    if (config.animals.type.sell && config.animals.type.sacrifice) {
        showerr(
            client,
            "Sell and sacrifice cannot be turn on at the same time!",
        );
        return false;
    }
    return true;
};

/**
 * Clamp configured action intervals to safe minimums defined in
 * INTERVAL_DEFAULTS. Warns and resets any out-of-range values.
 *
 * @param {Object} config - The resolved config; `config.interval[type]` values may be mutated.
 * @param {Client} client - The Discord client instance; used for warnings.
 * @returns {void}
 * @sideeffect Resets out-of-range `config.interval[type].min`/`max` to the defaults and logs each correction.
 */
const validateIntervals = (config, client) => {
    const intervals = ["hunt", "battle", "pray", "coinflip", "slot", "animals"];
    const missingValue = intervals.some(
        (type) => !config.interval[type]?.min || !config.interval[type]?.max,
    );

    if (missingValue) {
        showerr(client, "Interval cannot be null!");
        return;
    }

    for (const {
        type,
        min: minDefault,
        max: maxDefault,
    } of INTERVAL_DEFAULTS) {
        if (config.interval[type].min < minDefault) {
            client.logger.warn(
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
            client.logger.warn(
                "Bot",
                "Config",
                `${type} max interval is too low or less than min, resetting to default!`,
            );
            config.interval[type].max = maxDefault;
        }
    }
};

// --- Exports ---

/**
 * Run all fatal and non-fatal config validation checks.
 *
 * Fatal failures log an alert and terminate the process after a short delay.
 * Non-fatal issues are logged as warnings and auto-corrected where possible.
 */
exports.verifyconfig = async (client, config) => {
    client.logger.info("Bot", "Config", "Verifying Config... Please wait...");

    const fatalChecks = [
        () => checkToken(config, client),
        () => checkDuplicateChannels(config, client),
        () => checkGambleAmount(config, client),
        () => parseGemRarity(client),
        () => parseAnimalTypes(client),
        () => checkSellSacrificeConflict(config, client),
    ];

    let ok = true;
    for (const check of fatalChecks) {
        if (!check()) ok = false;
    }

    checkPrayCurseConflict(client, config);
    validateIntervals(config, client);

    if (ok) {
        client.logger.info(
            "Bot",
            "Config",
            "Config verified, things seem to be okey :3",
        );
    } else {
        client.logger.alert(
            "Bot",
            "Config",
            "Config is not verified or contains errors, please check the logs and fix the errors!",
        );
        setTimeout(() => {
            client.logger.warn("Bot", "Config", "Exiting...");
            process.exit(1);
        }, 1600);
    }
};

/**
 * Log the full resolved configuration for debugging purposes.
 * Output is sent at debug level so it does not clutter normal startup.
 */
exports.getconfig = (config, client) => {
    const packageJson = require("../../package.json");

    client.logger.debug(`OwO Farm Bot Stable - Debug log
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
  Gamble: 
    Coinflip: ${config.main.commands.gamble.coinflip} - type: ${typeof config.main.commands.gamble.coinflip}
    Slot: ${config.main.commands.gamble.slot} - type: ${typeof config.main.commands.gamble.slot}
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

Gamble:
  Coinflip:
    Default Amount: ${config.settings.gamble.coinflip.default_amount} - type: ${typeof config.settings.gamble.coinflip.default_amount}
    Max Amount: ${config.settings.gamble.coinflip.max_amount} - type: ${typeof config.settings.gamble.coinflip.max_amount}
    Multiplier: ${config.settings.gamble.coinflip.multiplier} - type: ${typeof config.settings.gamble.coinflip.multiplier}
  Slot:
    Default Amount: ${config.settings.gamble.slot.default_amount} - type: ${typeof config.settings.gamble.slot.default_amount}
    Max Amount: ${config.settings.gamble.slot.max_amount} - type: ${typeof config.settings.gamble.slot.max_amount}
    Multiplier: ${config.settings.gamble.slot.multiplier} - type: ${typeof config.settings.gamble.slot.multiplier}

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

  Coinflip: ${config.interval.coinflip.min} - ${config.interval.coinflip.max}
  Type: ${typeof config.interval.coinflip.min} - ${typeof config.interval.coinflip.max}

  Slot: ${config.interval.slot.min} - ${config.interval.slot.max}
  Type: ${typeof config.interval.slot.min} - ${typeof config.interval.slot.max}

  Animals: ${config.interval.animals.min} - ${config.interval.animals.max}
  Type: ${typeof config.interval.animals.min} - ${typeof config.interval.animals.max}

  Checklist: ${config.interval.checklist} - type: ${typeof config.interval.checklist}
-------------------------
`);
};
