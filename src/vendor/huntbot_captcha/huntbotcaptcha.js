/**
 * @module huntbotcaptcha
 * @description Resolves huntbot captcha images by template matching
 *              over the bundled `letters/` glyph set. Returns `null`
 *              on any failure so callers can fall back gracefully.
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const sharp = require("sharp");

const lettersDir = path.join(__dirname, "letters");

/**
 * Attempts to solve a huntbot captcha.
 *
 * @param {string|null|undefined} captchaUrl - Direct image URL of the captcha.
 * @returns {Promise<string|null>} The decoded solution string or `null` on error.
 */
module.exports = async (captchaUrl) => {
    try {
        if (!captchaUrl) return null;

        let checkImages;
        try {
            checkImages = getAllImagePaths(lettersDir);
            if (checkImages.length === 0) return null;
        } catch {
            return null;
        }

        const checks = [];
        for (const checkImage of checkImages) {
            const img = sharp(checkImage);
            const { width, height } = await img.metadata();
            const letter = path.basename(checkImage, path.extname(checkImage));
            checks.push({ img, width, height, letter });
        }

        const response = await axios.get(captchaUrl, {
            responseType: "arraybuffer",
        });

        if (response.status < 200 || response.status >= 300) return null;

        const largeImage = sharp(response.data);
        const { width, height } = await largeImage.metadata();

        const solution = await matchLetters(
            await largeImage.raw().toBuffer(),
            width,
            height,
            checks,
        );

        if (!solution || solution.length === 0) return null;
        return solution;
    } catch (_) {
        return null;
    }
};

/**
 * Recursively enumerates all `.png` files under a directory.
 *
 * @param {string} dir - The directory to walk.
 * @returns {string[]} Full file paths.
 */
function getAllImagePaths(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat?.isDirectory()) {
            results = results.concat(getAllImagePaths(fullPath));
        } else if (file.endsWith(".png")) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Scans the captcha canvas for all sneaking in a left-to-right, deduplicated order.
 *
 * @param {Buffer} largeData - Raw RGBA data of the captcha image.
 * @param {number} largeW - Width of the captcha image in pixels.
 * @param {number} largeH - Height of the captcha image in pixels.
 * @param {Array<{img: sharp.Shape, width: number, height: number, letter: string}>} checks - Loaded letter templates.
 * @returns {Promise<string>} Concatenated letter solution.
 */
async function matchLetters(largeData, largeW, largeH, checks) {
    const matches = [];
    const sorted = [...checks].sort(
        (a, b) => a.width - b.width || a.height - b.height,
    );

    for (const { img, width: smallW, height: smallH, letter } of sorted) {
        const smallData = await img.raw().toBuffer();

        if (smallData.length !== smallW * smallH * 4) continue;

        await scanForLetterMatches(
            { data: largeData, w: largeW, h: largeH },
            { data: smallData, w: smallW, h: smallH },
            letter,
            matches,
        );
    }

    matches.sort((a, b) => a.x - b.x);
    return matches.map((m) => m.letter).join("");
}

/**
 * Searches every position in the captcha for one letter template.
 *
 * @param {{data: Buffer, w: number, h: number}} large - Captcha image payload.
 * @param {{data: Buffer, w: number, h: number}} small - Letter template payload.
 * @param {string} letter - Letter identifier to record on a match.
 * @param {{x: number, y: number, letter: string}[]} matches - Accumulated hits.
 */
async function scanForLetterMatches(large, small, letter, matches) {
    const { data: largeData, w: largeW, h: largeH } = large;
    const { data: smallData, w: smallW, h: smallH } = small;

    for (let y = 0; y <= largeH - smallH; y++) {
        for (let x = 0; x <= largeW - smallW; x++) {
            if (
                pixelDiff({
                    largeData,
                    largeW,
                    smallData,
                    smallW,
                    smallH,
                    startX: x,
                    startY: y,
                }) < 0.05
            ) {
                addUniqueMatch(
                    matches,
                    { x, y },
                    { w: smallW, h: smallH },
                    letter,
                );
            }
        }
    }
}

/**
 * Records a match only when it does not overlap an existing detection.
 *
 * @param {{x: number, y: number, letter: string}[]} matches - Current match list.
 * @param {{x: number, y: number}} candidate - Candidate position.
 * @param {{w: number, h: number}} size - Box size for overlap comparison.
 * @param {string} letter - Letter to record.
 */
function addUniqueMatch(matches, candidate, size, letter) {
    const { x, y } = candidate;
    const { w, h } = size;
    if (!matches.some((m) => Math.abs(m.x - x) < w && Math.abs(m.y - y) < h)) {
        matches.push({ x, y, letter });
    }
}

/**
 * Measures per-pixel normalized RGB difference between a region and a template.
 * Ignores fully transparent template pixels. Short-circuits when a row exceeds tolerance.
 *
 * @param {object} opts - Matching parameters.
 * @param {Buffer} opts.largeData - Full captcha raw RGBA buffer.
 * @param {number} opts.largeW - Captcha width in pixels.
 * @param {Buffer} opts.smallData - Template raw RGBA buffer.
 * @param {number} opts.smallW - Template width in pixels.
 * @param {number} opts.smallH - Template height in pixels.
 * @param {number} opts.startX - X offset of the candidate region.
 * @param {number} opts.startY - Y offset of the candidate region.
 * @returns {number} Average per-channel diff in `[0, 3]`.
 */
function pixelDiff({
    largeData,
    largeW,
    smallData,
    smallW,
    smallH,
    startX,
    startY,
}) {
    let totalDiff = 0;
    let count = 0;
    const threshold = 0.05;
    for (let y = 0; y < smallH; y++) {
        for (let x = 0; x < smallW; x++) {
            const largeIdx = ((startY + y) * largeW + (startX + x)) * 4;
            const smallIdx = (y * smallW + x) * 4;

            if (smallData[smallIdx + 3] > 0) {
                totalDiff +=
                    Math.abs(smallData[smallIdx] - largeData[largeIdx]) / 255 +
                    Math.abs(
                        smallData[smallIdx + 1] - largeData[largeIdx + 1],
                    ) /
                        255 +
                    Math.abs(
                        smallData[smallIdx + 2] - largeData[largeIdx + 2],
                    ) /
                        255;
                count += 3;
            }
        }
        if (count > 0 && totalDiff / count > threshold)
            return totalDiff / count;
    }
    if (count === 0) return 1;
    return totalDiff / count;
}
