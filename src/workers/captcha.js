/* eslint-disable no-undef */
const { connect } = require("puppeteer-real-browser");
const yargs = require("yargs");
const path = require("node:path");
const fse = require("fs-extra");

const AUTH_URL =
    "https://discord.com/api/v9/oauth2/authorize?client_id=408785106942164992&response_type=code&redirect_uri=https%3A%2F%2Fowobot.com%2Fapi%2Fauth%2Fdiscord%2Fredirect&scope=identify%20guilds%20email%20guilds.members.read";
const EXTENSION_POPUP =
    "chrome-extension://pnfknmgliopmihbgmclhbalafndgmjkl/popup/popup.html";
const CAPTCHA_URL = "https://owobot.com/captcha";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const extensionPath = path.resolve(__dirname, "../vendor/hcaptchasolver");
const adblockcachedir = path.resolve(__dirname, "../vendor/adblockcache");

if (!fse.existsSync(adblockcachedir)) {
    fse.mkdirSync(adblockcachedir, { recursive: true });
}

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

async function waitForCaptchaResult(page) {
    let refreshcount = 0;
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
                const iframecontent = await iframe.evaluate(
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
                    "click, hold, and drag",
                    "click on the shape that breaks the pattern",
                ];
                needsRefresh = captchaTexts.some((text) =>
                    iframecontent.includes(text),
                );
            }
        } else {
            console.log("Iframe with hcaptcha and frame=challenge not found.");
        }

        if (status.isOk) {
            console.log("Successfully solved captcha.");
            return true;
        } else if (status.isFail) {
            refreshcount = 0;
            needsRefresh = false;
            await page.reload({ waitUntil: "load" });
        } else if (needsRefresh) {
            console.log("Refreshing captcha...");
            if (refreshcount < 1) {
                await page.reload({ waitUntil: "load" });
                refreshcount++;
            }
        } else {
            console.log("Captcha not solved yet");
            await delay(1000);
        }
    }
}

(async () => {
    while (true) {
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

        await page.setViewport({ width: 1200, height: 1080 });
        await page.goto(EXTENSION_POPUP);
        await delay(3000);
        await page.evaluateOnNewDocument((token) => {
            window.localStorage.setItem("token", `"${token}"`);
        }, argv.token);
        await page.goto(AUTH_URL, { waitUntil: "load" });
        await page.waitForSelector("div.action__3d3b0 button", {
            visible: true,
        });
        await page.locator("div.action__3d3b0 button").setTimeout(3000).click();
        await page.waitForNavigation({ waitUntil: "load" });

        const redirectedUrl = page.url();
        console.log(`Redirected URL: ${redirectedUrl}`);

        const { isRateLimit, isLoggedIn } = await checkAuthStatus(page);
        if (isRateLimit) {
            console.log("Rate limit detected. Waiting for 5 minutes...");
            await browser.close();
            await delay(300000);
        } else if (isLoggedIn) {
            console.log("Authorization successful! The user has logged in.");
            console.log(`Captcha URL: ${CAPTCHA_URL}`);
            await page.goto(CAPTCHA_URL, { waitUntil: "load" });
            console.log("Waiting for the captcha to be solved...");
            const solved = await waitForCaptchaResult(page);
            if (solved) {
                await browser.close();
                process.exit(1);
            }
        } else {
            console.log("Authorization failed.");
            await browser.close();
            break;
        }
    }
})();
