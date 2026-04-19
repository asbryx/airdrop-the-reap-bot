# The Reap Farming Bot

Standalone Node.js bot for farming on <https://play.thereap.xyz/reap>.

Zero runtime dependencies. Just Node.js.

## What it does

- auto token refresh to keep sessions alive
- drip claim attempts on a timed loop
- daily login bonus claim on startup
- spectate bonus claims up to the configured daily limit
- optional auto-join rounds when balance and strategy allow
- single-account and multi-account support

## Safer setup

You can run this bot with either `.env` or `config.json`.

Preferred option: `.env`

1. Copy `.env.example` -> `.env`
2. Log in to The Reap in your browser
3. Open DevTools -> Application -> Cookies
4. Find the `sb-nqwlrfckisarepakwaat-auth-token` cookies
5. URL-decode and parse the JSON payload
6. Copy `access_token`, `refresh_token`, and `user.id` into `.env`

Alternative option: `config.json`

1. Copy `config.example.json` -> `config.json`
2. Paste the same auth values into `config.json`
3. Never commit `config.json` - it contains live auth tokens and is ignored by git in this repo

## Run

```bash
node reap-bot.js
```

## State and local files

The bot creates local runtime files that are ignored by git:

- `state_<account>.json` - per-account state, counters, and refreshed tokens
- `activity.log` - appended activity log
- `.env` - optional local secrets file
- `config.json` - optional local JSON config with secrets

You can delete `state_<account>.json` files to reset local counters for that account.

## Configuration

Settings can come from either `config.json` or environment variables in `.env`.
Environment values override file values.

Common settings:

- `REAP_AUTO_JOIN_ROUNDS`
- `REAP_JOIN_BALANCE_THRESHOLD`
- `REAP_ROUND_JOIN_STRATEGY`
- `REAP_ROUND_JOIN_CHANCE`
- `REAP_ROUND_JOIN_MAX_PER_DAY`
- `REAP_JITTER_PERCENT`
- `REAP_ENABLE_RANDOM_IDLE`
- `REAP_ROTATE_USER_AGENT`
- `REAP_MAX_SPECTATE_BONUS_PER_DAY`
- `REAP_SHOW_DASHBOARD_EVERY`
- `REAP_ACCOUNT_DELAY_MS`

See `.env.example` and `config.example.json` for the supported structure.

## Notes

- if both `.env` auth and `config.json` auth are present, env auth wins
- if `REAP_ACCOUNTS_JSON` is provided, it overrides single-account env auth
- menu changes still save back to `config.json` when that file exists
- if you run env-only without `config.json`, interactive menu setting changes are runtime-only

## Caution

Use this at your own risk. It automates authenticated actions against a live service using your session tokens.

Do not upload live tokens, `.env`, `config.json`, `state_<account>.json`, or `activity.log` to GitHub.
