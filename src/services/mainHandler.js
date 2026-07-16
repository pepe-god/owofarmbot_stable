/**
 * Main orchestration entry point for the `start`/`resume` command.
 *
 * Coordinates the initialization of every bot subsystem in sequence:
 *  - farming (hunt/battle)
 *  - animal sell/sacrifice
 *  - pray/curse luck buffs
 *  - safety auto-pause
 *
 * Each subsystem is a self-looping module that manages its own timers.
 * This function only triggers their initial launch (with small inter-subsystem
 * delays to avoid command floods). The `owoprefix` default is already applied
 * at startup by `runtimeConfig.js`, so no normalization is needed here.
 *
 * @param {Client} ctx - The Discord ctx instance; carries config and global state.
 * @param {Message} message - The command message that triggered start/resume (passed to modules that need it).
 * @returns {Promise<void>} Resolves once every enabled subsystem has been kicked off.
 * @sideeffect Launches all enabled subsystem loops.
 */

const { startFarm } = require("../modules/farm.js");
const { startAnimals } = require("../modules/animals.js");
const { startLuck } = require("../modules/luck.js");
const { startSafety } = require("../modules/safety.js");

/** Delay between subsystem starts to avoid command floods (ms). */
const FARM_START_DELAY = 2000;
/** Delay before starting luck module to space out from farming (ms). */
const PRAYER_START_DELAY = 32000;

module.exports = async (ctx) => {
    await ctx.globalutil.waitWhileBusy(ctx);

    await initFarming(ctx);
    await ctx.delay(FARM_START_DELAY);

    await initAnimals(ctx);
    await initPrayer(ctx);
    initSafety(ctx);
};

/**
 * Start the farm subsystem (hunt/battle).
 *
 * The farm module resolves its own commands channel from ctx, so the channel
 * is refreshed each iteration and does not need to be passed from here.
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @returns {Promise<void>} Resolves once the farm module has been started.
 * @sideeffect Starts the farm module directly.
 */
async function initFarming(ctx) {
    await ctx.globalutil.waitWhileBusy(ctx);
    await ctx.delay(FARM_START_DELAY);
    await startFarm(ctx);
}

/**
 * Start the animal sell/sacrifice loop.
 *
 * Resolves the current commands channel from ctx so that the reference is
 * refreshed each call. Selects "sell" vs "sacrifice" from config and passes
 * the concatenated animal-type suffix to the module.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `config.main.commands.animals`, `config.animals.type.sell`, and `global.temp.animaltype`.
 * @returns {Promise<void>} Resolves once the animal loop is launched.
 * @sideeffect Starts the animals module loop when enabled.
 */
async function initAnimals(ctx) {
    if (ctx.config.main.commands.animals) {
        await ctx.globalutil.waitWhileBusy(ctx);
        const channel = ctx.client.channels.cache.get(
            ctx.config.main.commandschannelid,
        );
        await startAnimals(
            ctx,
            channel,
            ctx.config.animals.type.sell ? "sell" : "sacrifice",
            ctx.global.temp.animaltype,
        );
    }
}

/**
 * Start the pray/curse luck buff loop.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `config.main.commands.pray`/`curse`.
 * @returns {Promise<void>} Resolves after the luck loop is launched (after a 32s spacing delay).
 * @sideeffect Starts the luck module loop when pray or curse is enabled.
 */
async function initPrayer(ctx) {
    if (ctx.config.main.commands.pray || ctx.config.main.commands.curse) {
        await ctx.globalutil.waitWhileBusy(ctx);
        // Initial wait to space out luck buffs from farming actions.
        await ctx.delay(PRAYER_START_DELAY);
        await startLuck(ctx);
    }
}

/**
 * Start the safety auto-pause module.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `config.settings.safety.autopause`.
 * @returns {void} Kicks off the safety module; does not return a value.
 * @sideeffect Starts the safety auto-pause loop when enabled.
 */
function initSafety(ctx) {
    if (ctx.config.settings.safety.autopause) {
        startSafety(ctx);
    }
}
