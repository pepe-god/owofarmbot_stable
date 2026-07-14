/**
 * Standalone hCaptcha worker for the OwO farm bot.
 *
 * Automates the Discord OAuth flow for the OwO bot, then obtains the
 * `/captcha` page and waits for the bundled hCaptcha solver extension
 * to clear the challenge. Designed for manual or supervised execution
 * from CLI.
 *
 * Invocation example:
 *   node src/core/captcha.js --token <DISCORD_TOKEN> --userid <DISCORD_USER_ID>
 *
 * Notes:
 * - `userid` is accepted by CLI but currently unused by the script itself;
 *   it is retained for compatibility / future verification endpoints.
 * - Success exits with code 0; failure exits with code 1.
 */

const { connect } = require("puppeteer-real-browser");
const yargs = require("yargs");
const path = require("node:path");
const fse = require("fs-extra");
const { HCAPTCHA_EXTENSION_ID } = require("./constants.js");

/**
 * Discord OAuth2 authorize endpoint for the OwO bot.
 * The `redirect_uri` points to owobot's auth callback.
 */
const AUTH_URL =
    "https://discord.com/api/v9/oauth2/authorize?client_id=408785106942164992&response_type=code&redirect_uri=https%3A%2F%2Fowobot.com%2Fapi%2Fauth%2Fdiscord%2Fredirect&scope=identify%20guilds%20email%20guilds.members.read";

/**
 * Entry page of the bundled hCaptcha solver extension.
 * Navigating here first forces Chromium to register the unpacked extension.
 */
const EXTENSION_POPUP = `chrome-extension://${HCAPTCHA_EXTENSION_ID}/popup/popup.html`;

/**
 * OwO captcha challenge page. After a successful Discord OAuth, the worker
 * redirects here and waits for the solver extension to finish.
 */
const CAPTCHA_URL = "https://owobot.com/captcha";

/**
 * Small helper to pause execution for a fixed duration.
 *
 * @param {number} ms - Milliseconds to delay.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * CLI contract
 *  --token / -t  Discord user token, injected into localStorage for the session.
 *  --userid/-uid Discord user ID (currently reserved; not consumed by this script).
 */
const argv = yargs.options({
    token: {
        alias: "t",
        describe: "User token",
        type: "string",
        demandOption: true,
    },
    userid: {
        alias: "uid",
        describe: "User ID",
        type: "string",
        demandOption: true,
    },
}).argv;

/**
 * Absolute path to the unpacked hCaptcha solver extension shipped under vendor/.
 */
const extensionPath = path.resolve(__dirname, "../vendor/hcaptchasolver");

/**
 * Absolute path to the Puppeteer adblocker cache directory under vendor/.
 */
const adblockcachedir = path.resolve(__dirname, "../vendor/adblockcache");

if (!fse.existsSync(adblockcachedir)) {
    fse.mkdirSync(adblockcachedir, { recursive: true });
}

/**
 * Inspect the current post-auth page to determine whether Discord is rate
 * limiting token requests or whether the OwO redirect registered us as logged in.
 *
 * @param {import('puppeteer').Page} page - Active browser page after OAuth navigation.
 * @returns {{ isRateLimit: boolean, isLoggedIn: boolean }}
 */
async function checkAuthStatus(page) {
    return await page.evaluate(() => ({
        isRateLimit: document.body.innerText.includes(
            "You are being rate limited for requesting too many tokens",
        ),
        isLoggedIn:
            !document.body.innerText.includes("Unauthorized") &&
            !document.body.innerText.includes('Invalid "code" in request.'),
    }));
}

/**
 * Polls the `/captcha` page until the solver extension finishes, the captcha
 * fails, or the page presents a challenge type that should be refreshed.
 *
 * @param {import('puppeteer').Page} page - Active browser page on the captcha URL.
 * @returns {Promise<boolean>} `true` if the captcha was solved successfully.
 */
async function waitForCaptchaResult(page) {
    let refreshCount = 0;
    while (true) {
        const status = await page.evaluate(() => ({
            isOk: [
                "I have verified that you're a human",
                "You're free to go! c:",
            ].some((t) => document.body.innerText.includes(t)),
            isFail: [
                "Captcha failed",
                "Please reload the page and try again",
                "reload the page",
                "failed.",
                "the page and try again.",
            ].some((t) => document.body.innerText.includes(t)),
        }));

        let needsRefresh = false;
        const iframeHandle = await page.$(
            'iframe[src*="hcaptcha"][src*="frame=challenge"]',
        );
        if (iframeHandle) {
            const iframe = await iframeHandle.contentFrame();
            if (iframe) {
                const iframeContent = await iframe.evaluate(
                    () => document.body.innerText,
                );
                const captchaTexts = [
                    "Please click on the character that represents a quantity or can be used for counting",
                    "Please click, hold, and drag the shape to complete the pattern",
                    "Please click, hold, and drag one of the elements on the right to complete the pairs",
                    "Please click on the shape that breaks the pattern",
                    "Please click on the object that is not shiny",
                    "Fill the boxes with the required number of objects indicated.",
                    "drag each missing peach",
                    "click, hold and drag",
                    "click, hold and drag",
                    "click on the shape that breaks the pattern",
                ];
                needsRefresh = captchaTexts.some((text) =>
                    iframeContent.includes(text),
                );
            }
        } else {
            console.log("Iframe with hcaptcha and frame=challenge not found.");
        }

        if (status.isOk) {
            console.log("Successfully solved captcha.");
            return true;
        } else if (status.isFail) {
            refreshCount = 0;
            needsRefresh = false;
            await page.reload({ waitUntil: "load" });
        } else if (needsRefresh) {
            console.log("Refreshing captcha...");
            if (refreshCount < 1) {
                await page.reload({ waitUntil: "load" });
                refreshCount++;
            }
        } else {
            console.log("Captcha not solved yet");
            await delay(1000);
        }
    }
}

(async () => {
    try {
        while (true) {
            /**
             * Spin up a real Chromium instance with:
             *  - headless off so the extension UI / challenge is visible (for debugging)
             *  - built-in turnstile / challenge solver disabled because we rely on the local extension
             *  - adblocker plugin with local cache to speed up loads
             */
            const { browser, page } = await connect({
                headless: false,
                turnstile: false,
                args: [
                    `--disable-extensions-except=${extensionPath}`,
                    `--load-extension=${extensionPath}`,
                ],
                plugins: [
                    require("puppeteer-extra-plugin-adblocker")({
                        blockTrackers: true,
                        useCache: true,
                        cacheDir: adblockcachedir,
                    }),
                ],
            });

            try {
                await page.setViewport({ width: 1200, height: 1080 });

                /**
                 * Visit the extension popup first so Chromium registers the
                 * unpacked extension in this browsing context.
                 */
                await page.goto(EXTENSION_POPUP);
                await delay(3000);

                /**
                 * Pre-seed the OwO API token into localStorage so the extension
                 * or OwO capture page can detect the existing session.
                 */
                await page.evaluateOnNewDocument((token) => {
                    window.localStorage.setItem("token", `"${token}"`);
                }, argv.token);

                /**
                 * Step 1: Send the user through Discord OAuth for the OwO bot.
                 */
                await page.goto(AUTH_URL, { waitUntil: "load" });
                await page.waitForSelector("div.action__3d3b0 button", {
                    visible: true,
                });

                // Click the Discord authorization button inside the OAuth modal.
                await page
                    .locator("div.action__3d3b0 button")
                    .setTimeout(3000)
                    .click();
                await page.waitForNavigation({ waitUntil: "load" });

                const redirectedUrl = page.url();
                console.log(`Redirected URL: ${redirectedUrl}`);

                /**
                 * Step 2: Decide what to do based on the OwO auth callback content.
                 */
                const { isRateLimit, isLoggedIn } = await checkAuthStatus(page);
                if (isRateLimit) {
                    console.log(
                        "Rate limit detected. Waiting for 5 minutes...",
                    );
                } else if (isLoggedIn) {
                    console.log(
                        "Authorization successful! The user has logged in.",
                    );
                    console.log(`Captcha URL: ${CAPTCHA_URL}`);
                    await page.goto(CAPTCHA_URL, { waitUntil: "load" });
                    console.log("Waiting for the captcha to be solved...");
                    const solved = await waitForCaptchaResult(page);
                    if (solved) {
                        console.log(
                            "Captcha flow complete. Exiting successfully.",
                        );
                        await browser.close();
                        /**
                         * Exit 0 signals success to the parent process.
                         * Any non-zero code here would incorrectly indicate failure.
                         */
                        process.exit(0);
                    }
                } else {
                    console.log("Authorization failed.");
                    break;
                }
            } catch (loopError) {
                console.error("Error during captcha worker loop:", loopError);
                await browser.close().catch(() => {});
            }

            /**
             * If we are here, either:
             * - Rate limit was hit: wait 5 minutes and retry with a fresh browser.
             * - A recoverable error occurred: restart the loop after cleanup.
             */
            await browser.close().catch(() => {});
            await delay(300000);
        }
    } catch (outerError) {
        console.error("Fatal error in captcha worker:", outerError);
        process.exit(1);
    }
})();
