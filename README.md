# The Reap — Farming Bot

Standalone Node.js bot for farming on [play.thereap.xyz](https://play.thereap.xyz/reap).

Zero dependencies. Just Node.js.

## What it does

- **Auto token refresh** — keeps your session alive forever (refreshes every 50 min)
- **Drip claim** — claims 600 cents every cooldown cycle
- **Login bonus** — claims daily login bonus on start
- **Spectate bonus** — claims 100 cents up to 10x/day
- **Auto-join rounds** — (optional) joins rounds when balance allows

## Setup

1. Copy `config.example.json` -> `config.json`
2. Log in to The Reap in your browser
3. Open DevTools -> Application -> Cookies
4. Find the `sb-nqwlrfckisarepakwaat-auth-token` cookies
5. URL-decode and parse the JSON - it contains `access_token`, `refresh_token`, and `user`
6. Paste those values into `config.json`
7. Never commit `config.json` - it contains live auth tokens and is ignored by git in this repo

## Run

```bash
node reap-bot.js
```

## State

The bot saves its state to `state.json` (auto-created). This tracks:
- Current tokens (auto-refreshed)
- Total claims/bonuses collected
- Daily spectate counter

You can safely delete `state.json` to reset counters.

## Settings

In `config.json` → `settings`:

| Key | Default | Description |
|-----|---------|-------------|
| autoJoinRounds | false | Auto-join rounds when balance allows |
| joinBalanceThreshold | 5000 | Min balance (cents) to auto-join |
| dripClaimIntervalMs | 300000 | Try drip claim every 5 min |
| spectateIntervalMs | 600000 | Try spectate bonus every 10 min |
| tokenRefreshIntervalMs | 3000000 | Refresh token every 50 min |
| maxSpectateBonusPerDay | 10 | Max spectate bonuses per day |
