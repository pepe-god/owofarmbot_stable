/**
 * Autovoter for top.gg
 *
 * Automates Discord authentication and periodic voting on a bot's top.gg page
 * using Puppeteer with a real browser and cached ad-blocking. Designed to run
 * from CLI with token and target bot id.
 */

const path = require("node:path");
const fse = require("fs-extra");
const { connect } = require("puppeteer-real-browser");
const yargs = require("yargs");

/**
 * CLI contract:
 *  -t / --token : Discord user token for auth
 *  -b / --botid : The bot id to vote for on top.gg
 */
const argv = yargs.options({
    token: {
        alias: "t",
        describe: "User token",
        type: "string",
        demandOption: true,
    },
    botid: {
        alias: "bid",
        describe: "Id of the bot to vote for",
        type: "string",
        demandOption: true,
    },
}).argv;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Directory containing Puppeteer adblocker cache/profile data.
const adblockcachedir = path.resolve(__dirname, "./adblockcache");

if (!fse.existsSync(adblockcachedir)) {
    fse.mkdirSync(adblockcachedir, { recursive: true });
}

(async () => {
    const topcici = "https://top.gg";
    const { token, botid } = argv;

    /**
     * Spawn a real Chromium instance with:
     *  - headless disabled for visibility
     *  - turnstile / captcha handling
     *  - extra adblocker plugin with cache dir
     */
    const { browser, page } = await connect({
        headless: false,
        turnstile: true,
        plugins: [
            require("puppeteer-extra-plugin-adblocker")({
                blockTrackers: true,
                useCache: true,
                cacheDir: adblockcachedir,
            }),
        ],
    });

    await page.setViewport({
        width: 1920,
        height: 1080,
    });

    /**
     * Pre-seed localStorage with the Discord token so the Discord OAuth page
     * can detect an existing session without manual input.
     */
    await page.evaluateOnNewDocument((token) => {
        window.localStorage.setItem("token", `"${token}"`);
    }, token);

    /**
     * Step 1: Open top.gg home and confirm the main CTA
     */
    await page.goto(topcici, { waitUntil: "load" });
    await page.waitForSelector(".chakra-button.css-7rul47", { visible: true });
    await page.locator(".chakra-button.css-7rul47").setTimeout(6000).click();

    // Discord auth
    await page.waitForNavigation({ waitUntil: "load" });
    await page.waitForSelector("div.action__3d3b0 button", { visible: true });
    await page.locator("div.action__3d3b0 button").setTimeout(6000).click();

    await page.waitForNavigation({ waitUntil: "load" });

    await delay(5000);
    const isLoggedIn = await page.evaluate(() => {
        return !document.body.innerText.includes("Login");
    });

    if (isLoggedIn) {
        /**
         * Step 2: Navigate directly to the target bot's vote page.
         */
        const topgglink = `https://top.gg/bot/${botid}/vote`;
        await page.goto(topgglink, { waitUntil: "load" });

        /**
         * Wait until the page tells us we can vote, or that we already voted.
         * If neither, keep polling every 4s until the cooldown expires.
         */
        while (true) {
            const isAlreadyVoted = await page.evaluate(() => {
                return document.body.innerText.includes(
                    "You have already voted",
                );
            });

            const isvoteable = await page.evaluate(() => {
                return document.body.innerText.includes("You can vote now!");
            });

            if (isAlreadyVoted) {
                console.log("You have already voted. Exiting...");
                await browser.close();
                process.exit(0);
            }
            if (isvoteable) {
                break;
            } else {
                await delay(4000);
            }
        }

        /**
         * Step 3: Click the top.gg vote button.
         * Guard against missing or disabled buttons.
         */
        await page.evaluate(() => {
            const button = document.querySelector(
                "div.css-1yn6pjb button.chakra-button.css-7rul47",
            );

            if (!button || button.disabled) {
                return;
            }

            button.click();
        });

        await delay(5000);
    } else {
        console.log("Authorization failed.");
    }

    await browser.close();
})();
