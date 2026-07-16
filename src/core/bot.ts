/**
 * Bot runtime bootstrap: load config, build global state, validate, register
 * handlers/commands, then log in.
 */

import cp from "node:child_process";
import fs from "node:fs";
import { Collection, Client as DiscordClient } from "discord.js-selfbot-v13";
import notifier from "node-notifier";
import { loadConfig, validateConfig } from "../services/config.js";
import { BotState, LoopManager } from "../services/runtime.js";
import { DEFAULT_PREFIX } from "./constants.js";
import * as globalutil from "./globalutil.js";
import type { Channel, Ctx, CtxGlobal, Message } from "./types.js";

const { config } = loadConfig();
const packageJson = require("../../package.json");

/** Minimal client shape used by CtxClient. */
type ClientLike = {
    user: { id: string; username: string };
    channels: {
        cache: {
            get: (id: string) => Channel | undefined;
            values: () => Iterable<{
                messages?: { cache: Map<string, unknown> };
            }>;
        };
    };
    destroy: () => Promise<void>;
    commands: Map<
        string,
        { run: (ctx: Ctx, msg: Message, args: string[]) => void }
    >;
    aliases: Map<string, string>;
    on: (event: string, listener: (...args: unknown[]) => void) => unknown;
    off: (event: string, listener: (...args: unknown[]) => void) => unknown;
    login: (token: string) => Promise<string>;
};

const client = new DiscordClient() as unknown as ClientLike;
client.commands = new Collection() as ClientLike["commands"];
client.aliases = new Collection() as ClientLike["aliases"];

/**
 * Create the shared global state object (runtime flags + counters).
 */
function createGlobalState(name: string, type: string): CtxGlobal {
    return {
        name,
        type,
        captchadetected: false,
        paused: true,
        use: false,
        inventory: false,
        hunt: false,
        battle: false,
        total: {
            hunt: 0,
            battle: 0,
            pray: 0,
            curse: 0,
            captcha: 0,
            solvedcaptcha: 0,
        },
        gems: {
            need: [],
            use: "",
            isevent: true,
            rareLevel: 7,
            huntssinceinv: 0,
            missingHandled: false,
        },
        temp: {
            usedevent: false,
            animaltype: "",
            isready: false,
            started: false,
        },
    };
}

const owofarmbot_stable = createGlobalState("owofarmbot_stable", "Main");

// Bind the state helper to the shared global flags (plain booleans).
const botState = new BotState(owofarmbot_stable);

const delay = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

const prefix = () =>
    globalutil.commandrandomizer([DEFAULT_PREFIX, config.settings.owoprefix]);

// Build the universal context object that every module reads off.
const ctx: Ctx = {
    client,
    config: config as unknown as Ctx["config"],
    global: owofarmbot_stable,
    state: botState,
    loops: new LoopManager(),
    globalutil,
    delay,
    prefix,
    notifier,
    child_process: cp,
    fs: fs as Ctx["fs"],
    // Logger is wired in below after construction.
    logger: undefined as unknown as Ctx["logger"],
};

// The logger needs the context itself, so wire it in after creation.
const { createLogger } = require("../services/logger.js");
ctx.logger = createLogger(ctx);

// Suppress non-DeprecationWarning noise from Node internals.
process.emitWarning = (warning, type) => {
    if (type === "DeprecationWarning") return;
    console.warn(warning);
};
/**
 * Gracefully shut down the bot: stop all loops, flush logs, destroy the
 * Discord client, then exit.
 *
 * Called on SIGINT (Ctrl+C), unhandled errors, or manual restart.
 */
function gracefulShutdown(exitCode = 0): void {
    const stopped = ctx.loops.stopAll();
    ctx.logger.info("Bot", "Shutdown", `Stopped ${stopped} loop(s).`);
    ctx.logger?.dumpExitLog?.();
    ctx.client.destroy().catch(() => {});
    process.exit(exitCode);
}

// On SIGINT (Ctrl+C), shut down safely instead of abrupt termination.
process.on("SIGINT", () => gracefulShutdown(0));

// Show the bot version in process listings (e.g. `ps aux`).
process.title = `OwO Farm Bot Stable v${packageJson.version}`;

/**
 * Install global process-level error listeners (unhandledRejection, uncaughtException).
 */
function setupAntiCrash(): void {
    const { RateLimitError, describeError } = require("../services/errors.js");

    const logError = (type: string, err: unknown, origin: unknown = null) => {
        // EPIPE means the stdout/stderr reader closed — never log it (would
        // itself throw EPIPE again, spiraling into an alert storm).
        const errObj = err as NodeJS.ErrnoException | null;
        if (errObj && errObj.code === "EPIPE") return;

        // Redact anything that looks like a Discord token to prevent secrets in logs.
        const sanitize = (text: string) =>
            typeof text === "string"
                ? text.replace(
                      /[a-zA-Z0-9_-]{24,30}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,40}/g,
                      "[REDACTED_TOKEN]",
                  )
                : text;
        const errMessage = `--------------------------------------
Error: ${sanitize((errObj?.message as string) ?? String(err))}
Stack: ${sanitize((errObj?.stack as string) ?? "No stack trace available")}
Origin: ${String(origin ?? "N/A")}
Classification: ${describeError(err)}
--------------------------------------`;

        const classified =
            err instanceof RateLimitError
                ? "Rate limited"
                : "An crash happened!";
        ctx.logger.alert(
            "Bot",
            "Anticrash",
            `${classified} (${type})\n${errMessage}`,
        );
    };

    process.on("unhandledRejection", (reason) => {
        logError("Unhandled Rejection", reason);
    });
    process.on("uncaughtException", (err, origin) => {
        logError("Uncaught Exception", err, origin);
    });
}

interface CommandModule {
    config?: {
        name?: string;
        aliases?: string[];
    };
    run?: (ctx: Ctx, msg: Message, args: string[]) => void;
}

/**
 * Register a single command file (supports single or array exports).
 */
function registerCommand(pull: CommandModule | CommandModule[]): void {
    const list = Array.isArray(pull) ? pull : [pull];
    for (const cmd of list) {
        if (!cmd.config?.name) continue;
        ctx.client.commands.set(cmd.config.name, cmd);
        if (cmd.config.aliases)
            for (const a of cmd.config.aliases)
                ctx.client.aliases.set(a, cmd.config.name);
    }
}

/**
 * Discover and register all commands/events from src/core/.
 */
async function registerHandlers(): Promise<void> {
    const EXCLUDE = new Set([
        "bot.js",
        "bot.ts",
        "globalutil.js",
        "globalutil.ts",
        "constants.js",
        "constants.ts",
        "types.ts",
        "messageCreate.js",
        "admin.js",
        "ready.js",
    ]);
    let files: string[];
    try {
        files = (await fs.promises.readdir(__dirname)).filter(
            (d) => (d.endsWith(".js") || d.endsWith(".ts")) && !EXCLUDE.has(d),
        );
    } catch (err) {
        ctx.logger.alert(
            "Handler",
            "Discovery",
            `Failed to read core directory: ${(err as Error).message}`,
        );
        return;
    }
    for (const file of files) {
        try {
            // tsx resolves require("./foo.js") to foo.ts when only foo.ts exists.
            const modPath = `./${file.replace(/\.ts$/, ".js")}`;
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pull = require(modPath) as
                | CommandModule
                | CommandModule[]
                | ((ctx: Ctx, ...args: unknown[]) => void);
            if (typeof pull === "function") {
                // Event handler: event name = filename (without extension).
                const eName = file.split(".")[0];
                ctx.client.on(eName, pull.bind(null, ctx));
            } else {
                registerCommand(pull as CommandModule | CommandModule[]);
            }
        } catch (err) {
            ctx.logger.alert(
                "Handler",
                "Discovery",
                `Failed to load ${file}: ${(err as Error).message}`,
            );
        }
    }

    // Manually register merged events from events.ts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const events = require("./events.js") as {
        default: (ctx: Ctx, msg: unknown) => void;
        handleReady: (ctx: Ctx) => void;
        commands: CommandModule | CommandModule[];
    };
    ctx.client.on("messageCreate", events.default.bind(null, ctx));
    ctx.client.on("ready", events.handleReady.bind(null, ctx));
    registerCommand(events.commands);
}

/**
 * Top-level async bootstrap: validate config, register handlers, then log in.
 */
(async () => {
    validateConfig(config);
    setupAntiCrash();

    await registerHandlers();

    ctx.logger.info("Bot", "Startup", "Logging in...");
    await ctx.client.login(config.main.token);

    ctx.logger.warn(
        "Bot",
        "Help",
        `Use "${ctx.prefix()}start" to start the bot, "${ctx.prefix()}resume" to resume, and "${ctx.prefix()}pause" to pause.`,
    );
})();
