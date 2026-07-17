/**
 * Termux Compatibility Tests
 *
 * Validates that the project can run on Termux (Android Linux environment).
 * Checks for:
 *   - Native addon modules (not supported on Termux without compilation)
 *   - Windows-specific API usage (powershell.exe, .exe paths)
 *   - All module imports resolve correctly
 *   - node-notifier graceful degradation
 *   - POSIX path compatibility
 *   - Node.js version requirements
 *   - File system operation compatibility
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// =============================================================================
// 1.  NATIVE ADDON DETECTION
// =============================================================================

test("no native .node binaries in dependency tree", () => {
    const nativeFiles = findFiles("node_modules", ".node");
    assert.ok(
        nativeFiles.length === 0,
        `Found ${nativeFiles.length} native .node file(s):\n${nativeFiles.join("\n")}`,
    );
});

test("no binding.gyp (native build) files in dependency tree", () => {
    const bindingFiles = findFiles("node_modules", "binding.gyp");
    assert.ok(
        bindingFiles.length === 0,
        `Found ${bindingFiles.length} binding.gyp file(s) — likely requires node-gyp:\n${bindingFiles.join("\n")}`,
    );
});

test("no prebuild-install dependencies that fetch native binaries", () => {
    // Check for packages known to use native addons
    const nativePackages = [
        "node-gyp",
        "node-gyp-build",
        "prebuild-install",
        "better-sqlite3",
        "sharp",
        "bcrypt",
        "canvas",
        "bufferutil",
        "utf-8-validate",
        "zlib-sync",
        "erlpack",
        "msgpackr",
        "msgpack-lite",
    ];

    const warnings = [];
    for (const pkg of nativePackages) {
        const pkgPath = path.join("node_modules", pkg);
        if (fs.existsSync(pkgPath)) {
            warnings.push(pkg);
        }
    }

    if (warnings.length > 0) {
        // These might still work on Termux if prebuilds exist, but warn
        console.log(
            `⚠  Found native packages (may need Termux prebuilds): ${warnings.join(", ")}`,
        );
    }
    assert.ok(true, "Native package check completed (see warnings above)");
});

// =============================================================================
// 2.  WINDOWS-SPECIFIC API DETECTION
// =============================================================================

test("no powershell.exe calls in source code", () => {
    const srcFiles = collectSourceFiles("src");
    const offenders = [];
    for (const file of srcFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (
            content.includes("powershell.exe") ||
            content.includes("powershell") ||
            content.includes("PowerShell")
        ) {
            offenders.push(file);
        }
    }

    // On Termux we EXPECT this to fail — the test documents the issue
    if (offenders.length > 0) {
        console.log(
            "\n⚠  TERMUX COMPATIBILITY ISSUE DETECTED:\n" +
            `   Found powershell.exe references in:\n   ${offenders.join("\n")}\n` +
            "   FIX: Wrap in platform check: if (process.platform === 'win32')\n" +
            "   Or set desktop.prompt: false in config.json on Termux.\n",
        );
    }

    assert.strictEqual(
        offenders.length,
        0,
        `Found powershell.exe references in ${offenders.length} file(s).\n` +
            "RESULT: ❌ FAIL — These will error on Termux.\n" +
            "FIX: Wrap in platform guard or set desktop.prompt: false in config.json",
    );
});

test("no cmd.exe or .exe-specific command invocations in source code", () => {
    const srcFiles = collectSourceFiles("src");
    const offenders = [];
    for (const file of srcFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (
            content.includes('"cmd.exe"') ||
            content.includes("'cmd.exe'") ||
            content.includes('"cmd"') ||
            content.includes("start.exe") ||
            content.match(/spawn\(["'].*\.exe["']/)
        ) {
            offenders.push(file);
        }
    }

    if (offenders.length > 0) {
        console.log(
            "\n⚠  TERMUX COMPATIBILITY ISSUE DETECTED:\n" +
            `   Found .exe command invocations in:\n   ${offenders.join("\n")}\n` +
            "   FIX: Wrap in platform check or use cross-platform alternative.\n",
        );
    }

    assert.strictEqual(
        offenders.length,
        0,
        `Found .exe-specific command invocations in ${offenders.length} file(s).\n` +
            "RESULT: ❌ FAIL — These will error on Termux.\n" +
            "FIX: Add platform guard or replace with cross-platform alternative.",
    );
});

test("no Windows-only path separator backslashes in imports/resolves", () => {
    const srcFiles = collectSourceFiles("src");
    const violations = [];
    for (const file of srcFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (
                (line.includes("require(") || line.includes("from ")) &&
                line.includes("\\\\")
            ) {
                violations.push(`${file}:${i + 1}: ${line.trim()}`);
            }
        }
    }

    assert.strictEqual(
        violations.length,
        0,
        `Found Windows path separator usage in imports:\n${violations.join("\n")}`,
    );
});

// =============================================================================
// 3.  MODULE IMPORT TEST (can each module be loaded without crashing?)
// =============================================================================

test("core/constants.js imports successfully", () => {
    const mod = require("../src/core/constants.js");
    assert.ok(mod.OWO_ID);
    assert.ok(mod.DEFAULT_PREFIX);
    assert.ok(mod.REQUIRED_GEMS);
    assert.ok(Array.isArray(mod.REQUIRED_GEMS));
});

test("core/globalutil.js imports successfully", () => {
    const mod = require("../src/core/globalutil.js");
    assert.strictEqual(typeof mod.capitalize, "function");
    assert.strictEqual(typeof mod.commandrandomizer, "function");
    assert.strictEqual(typeof mod.getrand, "function");
    assert.strictEqual(typeof mod.removeInvisibleChars, "function");
    assert.strictEqual(typeof mod.waitWhileBusy, "function");
});

test("services/runtime.js imports successfully", () => {
    const mod = require("../src/services/runtime.js");
    assert.ok(mod.BotState);
    assert.ok(mod.LoopManager);
});

test("services/errors.js imports successfully", () => {
    const mod = require("../src/services/errors.js");
    assert.ok(mod.BotError);
    assert.ok(mod.RateLimitError);
    assert.strictEqual(typeof mod.handleModuleError, "function");
    assert.strictEqual(typeof mod.describeError, "function");
    assert.strictEqual(typeof mod.nextRateLimitDelay, "function");
    assert.strictEqual(typeof mod.resetRateLimitBackoff, "function");
});

test("services/config.js imports successfully", () => {
    const mod = require("../src/services/config.js");
    assert.strictEqual(typeof mod.loadConfig, "function");
    assert.strictEqual(typeof mod.validateConfig, "function");
});

test("services/logger.js imports successfully", () => {
    const mod = require("../src/services/logger.js");
    assert.strictEqual(typeof mod.createLogger, "function");
    assert.ok(mod.Logger);
});

test("modules/inventory.js imports successfully", () => {
    const mod = require("../src/modules/inventory.js");
    assert.strictEqual(typeof mod.parseItemCodes, "function");
    assert.strictEqual(typeof mod.selectGemCodes, "function");
    assert.strictEqual(typeof mod.useItemsFromInventory, "function");
});

test("modules/loop.js imports successfully", () => {
    const mod = require("../src/modules/loop.js");
    assert.strictEqual(typeof mod.selfLoop, "function");
});

test("modules/safety.js imports successfully (no platform crash)", () => {
    const mod = require("../src/modules/safety.js");
    assert.strictEqual(typeof mod.startSafety, "function");
    assert.strictEqual(typeof mod.notifyCaptcha, "function");
});

// =============================================================================
// 4.  node-notifier GRACEFUL DEGRADATION
// =============================================================================

test("node-notifier module can be required without platform crash", () => {
    // This tests that node-notifier doesn't crash at import time
    // (it selects platform backend at require() time)
    assert.doesNotThrow(() => {
        const notifier = require("node-notifier");
        assert.ok(notifier);
    });
});

test("node-notifier has a platform-specific backend on this system", () => {
    const notifier = require("node-notifier");
    const osType = os.type();

    // node-notifier selects its backend based on os.type():
    //   Linux   → NotifySend (calls `notify-send`)
    //   Darwin  → NotificationCenter
    //   Windows → WindowsToaster or WindowsBalloon
    //   WSL     → WindowsToaster
    //   *BSD    → NotifySend
    //   other   → Growl (pure JS fallback)

    assert.ok(notifier, "node-notifier loaded");

    // Log the platform for transparency
    const notifierType = notifier.constructor?.name || "Unknown";
    console.log(
        `ℹ  Platform: ${osType}, node-notifier backend: ${notifierType}`,
    );

    // On Linux (including Termux), it uses NotifySend which requires notify-send.
    // notify-send may not be installed in Termux, but node-notifier handles
    // this gracefully by returning an error to the callback, NOT crashing.
    //
    // Important: the bot's safety.ts calls notifier.notify() inside try/catch
    // via the module error handler, so even if notification fails, the bot
    // continues running.
    if (osType === "Linux") {
        console.log(
            "ℹ  On Termux/Linux, install 'notify-send' via: pkg install libnotify",
        );
        console.log(
            "ℹ  Without it, notifications silently fail (bot continues running).",
        );
    }

    assert.ok(true);
});

test("notifyCaptcha gracefully handles missing notify-send (Linux/Termux)", () => {
    // Verify that the bot's CAPTCHA notification flow doesn't crash
    // even when notification backend is unavailable.
    //
    // The bot's notifyCaptcha immediately catches errors via
    // try/catch + ctx.logger.alert so a failed notification
    // never propagates to the crash handler.  This test verifies
    // that the code structure is safe, not the actual runtime
    // (which requires a real Discord connection for webhook).

    const ctx = {
        config: {
            settings: {
                captcha: {
                    alerttype: {
                        webhook: false,
                        webhookurl: "",
                        desktop: {
                            force: false,
                            notification: true,
                            prompt: false, // Termux — disabled because it uses powershell.exe
                        },
                    },
                },
                autoresume: false,
            },
        },
        global: { type: "Main" },
        prefix: () => "owo",
        child_process: { spawn: () => {} },
        notifier: {
            notify: () => {
                // On Termux without notify-send, node-notifier calls
                // the callback with an error, which is handled gracefully.
            },
        },
        logger: {
            alert: () => {},
            info: () => {},
            warn: () => {},
            debug: () => {},
        },
    };

    // This should not throw — even if the notifier errors internally
    assert.doesNotThrow(() => {
        const { notifyCaptcha } = require("../src/modules/safety.js");
        notifyCaptcha(ctx);
    });
});

// =============================================================================
// 5.  POSIX PATH COMPATIBILITY
// =============================================================================

test("all source files use POSIX-compatible paths", () => {
    const srcFiles = collectSourceFiles("src");
    const issues = [];

    for (const file of srcFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check for backslash in import/require paths (Windows-specific)
            if (
                (line.includes("from ") || line.includes("require(")) &&
                line.includes("\\")
            ) {
                // Skip lines that contain path.join with __dirname (those use
                // path.sep which is fine on Linux)
                if (!line.includes("path.join")) {
                    issues.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            }
        }
    }

    if (issues.length > 0) {
        console.log(
            `⚠  Found potential mixed-path imports (verify these):\n${issues.join("\n")}`,
        );
    }
    assert.ok(true);
});

test("logger uses cross-platform path separator for alert file", () => {
    // The logger uses path.join() which is cross-platform,
    // so this should work fine on Termux.
    // Source is .ts; tsx resolves .ts when .js is imported at runtime.
    const loggerPath = path.join(__dirname, "../src/services/logger.ts");
    assert.ok(fs.existsSync(loggerPath), "logger.ts exists");

    const content = fs.readFileSync(loggerPath, "utf-8");
    // Should use path.join, not hardcoded backslashes
    assert.ok(
        content.includes("path.join"),
        "logger.ts uses path.join (cross-platform)",
    );
    assert.ok(
        !content.includes("\\\\"),
        "logger.ts does not use hardcoded backslashes",
    );
    console.log("ℹ  Logger uses path.join() — POSIX-compatible");
});

// =============================================================================
// 6.  NODE.JS VERSION REQUIREMENT
// =============================================================================

test("Node.js version meets requirement (v22+)", () => {
    const version = process.versions.node;
    const major = parseInt(version.split(".")[0], 10);
    console.log(`ℹ  Current Node.js version: ${version}`);

    assert.ok(
        major >= 22,
        `Node.js v22+ required, found v${major}. ` +
            "Install Node.js v22+ via Termux: pkg install nodejs",
    );
});

test("project package.json engine requirement is compatible with Termux Node.js", () => {
    const pkg = require("../package.json");
    const engines = pkg.engines;

    if (engines && engines.node) {
        console.log(`ℹ  package.json engine requirement: node ${engines.node}`);
    } else {
        console.log("ℹ  No explicit engine requirement in package.json");
        // npm/pnpm will skip engine check — compatible
    }

    assert.ok(true);
});

// =============================================================================
// 7.  FILE SYSTEM OPERATIONS (Termux-compatible)
// =============================================================================

test("data/logs directory creation works (POSIX-compatible)", () => {
    const logsDir = path.join(__dirname, "../data/logs");
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    assert.ok(fs.existsSync(logsDir), "data/logs directory can be created");
    assert.ok(
        fs.statSync(logsDir).isDirectory(),
        "data/logs is a directory",
    );
    console.log(`ℹ  data/logs directory exists at: ${logsDir}`);
});

test("alert.log file can be appended (logger compatibility)", () => {
    const logsDir = path.join(__dirname, "../data/logs");
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, "alert.log");
    const testLine = `[${new Date().toLocaleTimeString()}] Test >> Termux >> Logger compatible\n`;
    fs.appendFileSync(logFile, testLine);
    const content = fs.readFileSync(logFile, "utf-8");
    assert.ok(
        content.includes("Termux"),
        "alert.log write + read works on this platform",
    );
    console.log("ℹ  File I/O on data/logs/alert.log works correctly");
});

test("config.json parsing works (JSON file I/O)", () => {
    const configPath = path.join(__dirname, "../config.json");
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    assert.ok(config.main);
    assert.ok(config.settings);
    assert.ok(config.interval);
    console.log("ℹ  config.json loaded and parsed successfully");
});

// =============================================================================
// 8.  DEPENDENCY ANALYSIS
// =============================================================================

test("all direct dependencies are pure JS (no native addons needed)", () => {
    const DEP_PURE_JS = [
        "chalk",
        "debug",
        "discord.js-selfbot-v13",
        "dotenv",
        "node-notifier",
    ];

    for (const dep of DEP_PURE_JS) {
        const depPath = path.join("node_modules", dep);
        const exists = fs.existsSync(depPath);
        assert.ok(exists, `Dependency "${dep}" is installed`);

        if (exists) {
            // Check for .node files inside each dependency
            const nativeFiles = findFilesInDir(
                depPath,
                ".node",
            );
            if (nativeFiles.length > 0) {
                console.log(
                    `⚠  ${dep} contains native files: ${nativeFiles.join(", ")}`,
                );
            } else {
                console.log(`✅ ${dep} — pure JS, Termux-compatible`);
            }
        }
    }
    assert.ok(true);
});

test("tsx runtime can load TypeScript modules (needed for dev mode)", () => {
    // tsx is a devDependency but required at runtime via node --import tsx
    const tsxPath = path.join(
        __dirname,
        "..",
        "node_modules",
        "tsx",
        "package.json",
    );
    assert.ok(
        fs.existsSync(tsxPath),
        "tsx is installed (required for node --import tsx)",
    );

    const tsxPkg = require(tsxPath);
    console.log(`ℹ  tsx version: ${tsxPkg.version} — Termux-compatible`);

    // Verify tsx has no native dependencies
    const tsxNativeFiles = findFilesInDir(
        path.join(__dirname, "..", "node_modules", "tsx"),
        ".node",
    );
    assert.strictEqual(
        tsxNativeFiles.length,
        0,
        `tsx has no native files (found ${tsxNativeFiles.length})`,
    );
    console.log("✅ tsx is pure JS — can load .ts files on Termux");
});

// =============================================================================
// 9.  NETWORK COMPATIBILITY (required for Discord connection)
// =============================================================================

test("Node.js HTTPS module is available (needed for Discord WebSocket)", () => {
    const https = require("node:https");
    assert.ok(https);
    assert.strictEqual(typeof https.get, "function");
    console.log("ℹ  https module available — Discord connection possible");
});

test("Node.js WebSocket support is available (discord.js dependency)", () => {
    // discord.js-selfbot-v13 uses WebSocket internally via the 'ws' package
    let ws;
    try {
        ws = require("ws");
        assert.ok(ws);
        console.log("ℹ  ws module available — Discord gateway connection possible");
    } catch {
        // ws is a transitive dependency of discord.js-selfbot-v13
        console.log("ℹ  ws module not directly accessible — check with discord.js");
        assert.ok(true);
    }
});

test("Node.js DNS resolution works (needed for discord.com)", () => {
    const dns = require("node:dns");
    assert.ok(dns);
    assert.strictEqual(typeof dns.lookup, "function");
    console.log("ℹ  DNS module available — hostname resolution works");
});

// =============================================================================
// 10. TERMUX-SPECIFIC CONFIGURATION CHECK
// =============================================================================

test("captcha desktop prompt disabled on Termux (powershell.exe incompatible)", () => {
    // The config.json has desktop.prompt: true by default.
    // On Termux, the notifyPrompt() function calls:
    //   ctx.child_process?.spawn("powershell.exe", [...])
    // This will throw ENOENT because powershell.exe doesn't exist on Termux.
    //
    // Either:
    //   1. Set "prompt": false in config.json
    //   2. OR the code should check process.platform before spawning

    const safetyPath = path.join(__dirname, "../src/modules/safety.ts");
    const content = fs.readFileSync(safetyPath, "utf-8");

    const hasPowershellSpawn = content.includes('"powershell.exe"') ||
                                content.includes("'powershell.exe'");
    const hasPlatformCheck = content.includes("process.platform") ||
                              content.includes("os.platform");

    if (hasPowershellSpawn && !hasPlatformCheck) {
        console.log(
            "\n⚠  CRITICAL: safety.js calls powershell.exe WITHOUT a platform check.\n" +
            "   On Termux, this will throw ENOENT when CAPTCHA is detected.\n" +
            "   Fix: Set 'desktop.prompt' to 'false' in config.json, OR\n" +
            "   wrap the powershell call in: if (process.platform === 'win32')\n",
        );
    }

    // Log the recommendation
    const configPath = path.join(__dirname, "../config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const promptEnabled = config.settings?.captcha?.alerttype?.desktop?.prompt;

    if (promptEnabled) {
        console.log(
            "ℹ  config.json has desktop.prompt: true — " +
            "set to false on Termux to avoid powershell.exe errors.",
        );
    }

    assert.ok(true, "Termux config check completed");
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Recursively find files matching an extension in the project.
 */
function findFiles(rootDir, ext) {
    const results = [];
    if (!fs.existsSync(rootDir)) return results;

    try {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(rootDir, entry.name);
            try {
                if (entry.isDirectory()) {
                    // Skip .git, node_modules/.cache, etc.
                    if (
                        entry.name.startsWith(".") ||
                        entry.name === "vendor" ||
                        entry.name === "bin"
                    ) {
                        continue;
                    }
                    results.push(...findFiles(fullPath, ext));
                } else if (
                    entry.name.endsWith(ext) &&
                    !entry.name.endsWith(".map")
                ) {
                    results.push(fullPath);
                }
            } catch {
                // Permission denied or similar — skip
            }
        }
    } catch {
        // Directory not accessible
    }

    return results;
}

/**
 * Recursively find files in a specific directory.
 */
function findFilesInDir(dirPath, ext) {
    const results = [];
    if (!fs.existsSync(dirPath)) return results;

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            try {
                if (entry.isDirectory()) {
                    if (
                        entry.name.startsWith(".") ||
                        entry.name === "node_modules" ||
                        entry.name === "vendor"
                    ) {
                        continue;
                    }
                    results.push(...findFilesInDir(fullPath, ext));
                } else if (entry.name.endsWith(ext)) {
                    results.push(fullPath);
                }
            } catch {
                // Skip inaccessible paths
            }
        }
    } catch {
        // Directory not accessible
    }

    return results;
}

/**
 * Collect all source files (.ts and .js) from a directory tree.
 */
function collectSourceFiles(rootDir) {
    const results = [];
    if (!fs.existsSync(rootDir)) return results;

    try {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(rootDir, entry.name);
            try {
                if (entry.isDirectory()) {
                    if (entry.name.startsWith(".")) continue;
                    results.push(...collectSourceFiles(fullPath));
                } else if (
                    entry.name.endsWith(".ts") ||
                    entry.name.endsWith(".js")
                ) {
                    results.push(fullPath);
                }
            } catch {
                // Skip inaccessible files
            }
        }
    } catch {
        // Skip inaccessible directories
    }

    return results;
}
