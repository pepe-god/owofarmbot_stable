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
 * delays to avoid command floods). It also normalizes an empty `owoprefix`.
 *
 * @param {Client} ctx - The Discord ctx instance; carries config and global state.
 * @param {Message} message - The command message that triggered start/resume (passed to modules that need it).
 * @returns {Promise<void>} Resolves once every enabled subsystem has been kicked off.
 * @sideeffect Launches all enabled subsystem loops and may set `config.settings.owoprefix` to `"owo"`.
 */
module.exports = async (ctx, message) => {
    await ctx.globalutil.waitWhileBusy(ctx);
    const channel = ctx.client.channels.cache.get(ctx.basic.commandschannelid);
    if (!ctx.config.settings.owoprefix.length)
        ctx.config.settings.owoprefix = "owo";

    await initFarming(ctx, channel, message);
    await ctx.delay(2000);

    await initAnimals(ctx, channel);
    await initPrayer(ctx, message);
    initSafety(ctx);
};

/**
 * Start the farm subsystem (hunt/battle).
 *
 * @param {Client} ctx - The Discord ctx instance.
 * @param {TextChannel} channel - The commands channel.
 * @param {Message} message - The originating command message.
 * @returns {Promise<void>} Resolves once the farm module has been started.
 * @sideeffect Starts the farm module directly.
 */
async function initFarming(ctx, channel, message) {
    await ctx.globalutil.waitWhileBusy(ctx);
    await ctx.delay(2000);
    require("../modules/farm.js")(ctx, message);
}

/**
 * Start the animal sell/sacrifice loop.
 *
 * Selects "sell" vs "sacrifice" from config and passes the resolved, concatenated
 * animal-type suffix string (`global.temp.animaltype`) to the module.
 *
 * @param {Client} ctx - The Discord ctx instance; reads `basic.commands.animals`, `config.animals.type.sell`, and `global.temp.animaltype`.
 * @param {TextChannel} channel - The commands channel.
 * @returns {Promise<void>} Resolves once the animal loop is launched.
 * @sideeffect Starts the animals module loop when enabled.
 */
async function initAnimals(ctx, channel) {
    if (ctx.basic.commands.animals) {
        await ctx.globalutil.waitWhileBusy(ctx);
        await require("../modules/animals.js")(
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
 * @param {Client} ctx - The Discord ctx instance; reads `basic.commands.pray`/`curse`.
 * @param {Message} message - The originating command message.
 * @returns {Promise<void>} Resolves after the luck loop is launched (after a 32s spacing delay).
 * @sideeffect Starts the luck module loop when pray or curse is enabled.
 */
async function initPrayer(ctx, message) {
    if (ctx.basic.commands.pray || ctx.basic.commands.curse) {
        await ctx.globalutil.waitWhileBusy(ctx);
        // Initial wait to space out luck buffs from farming actions.
        await ctx.delay(32000);
        require("../modules/luck.js")(ctx, message);
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
        require("../modules/safety.js")(ctx);
    }
}
