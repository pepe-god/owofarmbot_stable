/* eslint-disable no-unused-vars */

process.emitWarning = (warning, type) => {
    if (type === "DeprecationWarning") {
        return;
    }
    console.warn(warning);
};

const cp = require("node:child_process");

const packageJson = require("../package.json");

// auto install dependencies
for (const dep of Object.keys(packageJson.dependencies)) {
    try {
        require.resolve(dep);
    } catch (_err) {
        console.log(`Installing dependencies...`);
        try {
            cp.execSync(`npm install ${dep}`, { stdio: "inherit" });
        } catch (installErr) {
            console.error(`Failed to install ${dep}:`, installErr.message);
        }
    }
}

const cluster = require("node:cluster");

if (cluster.isPrimary) {
    cluster.on("exit", () => {
        console.log("The bot is down, restarting...");
        cluster.fork();
    });

    cluster.fork();
} else {
    require("./bot.js");
}
