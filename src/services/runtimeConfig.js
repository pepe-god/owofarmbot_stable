/**
 * Runtime config loader.
 *
 * Responsibilities:
 *  - Load config.json (production or developer override).
 *  - Apply .env overrides for token, user ID, and webhook URL.
 *  - Detect developer mode from env or current username.
 *  - Ensure owoprefix has a sensible default.
 */
