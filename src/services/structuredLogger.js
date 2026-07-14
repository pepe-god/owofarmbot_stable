/**
 * Structured (JSON) log formatting helpers.
 *
 * The default {@link module:services/logger Logger} prints colorized,
 * human-friendly console lines. In production/aggregated environments a
 * machine-readable format is preferable, so setting the `LOG_FORMAT=json`
 * environment variable switches every non-debug log line to a single-line JSON
 * object with a stable field set:
 *
 *   { timestamp, level, type, module, message, state }
 *
 * This module owns only the format decision and serialization; `logger.js`
 * calls into it so the buffering/IPC/exit-dump behaviour stays in one place.
 */

/**
 * Whether structured JSON logging is enabled via `LOG_FORMAT=json`.
 * Read at call-time so tests (and runtime toggles) take effect immediately.
 *
 * @returns {boolean}
 */
function isJsonFormat() {
    return String(process.env.LOG_FORMAT || "").toLowerCase() === "json";
}

/**
 * Serialize a single log record to a one-line JSON string.
 *
 * @param {Object} entry
 * @param {string} entry.level - "info" | "warn" | "alert" | "debug".
 * @param {string} entry.type - High-level category (e.g. "Farm").
 * @param {string} entry.module - Sub-system / module name.
 * @param {string|Error} [entry.message] - Message body (coerced to string).
 * @param {string} [entry.state] - Current bot state label (from `BotState`).
 * @returns {string} JSON-encoded log line.
 */
function formatStructured({ level, type, module, message, state }) {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        type,
        module,
        message:
            message instanceof Error
                ? (message.stack ?? message.message)
                : String(message ?? ""),
        state: state ?? null,
    });
}

module.exports = { isJsonFormat, formatStructured };
