# Turning on the settlement crons

Two Railway services are deployed and idle until they have credentials:

- **ante-settler** — settles markets from the live TxODDS feed, attaching the
  feed's ed25519 signature the program verifies on-chain (every 15 min)
- **ante-rotate** — seeds upcoming fixtures from the live feed so the board
  stays full (every 30 min)

Since the program upgrade, the cloud never sees your treasury key. Markets now
live under a dedicated low-privilege **ops keypair** (`.ops-keypair.json`,
authority + oracle), and results are signed by a separate **feed keypair**
(`.feed-signer-keypair.json`). Your `~/.config/solana/id.json` (funds + TxODDS
subscription) stays offline. I can't set these for you — they're still secret
keys and should be entered by hand. It's a 2-minute step.

## The values

| Variable | Service | Where to get it |
|---|---|---|
| `SETTLER_SECRET` | ante-settler | the JSON array in `.ops-keypair.json` (repo root) |
| `FEED_SECRET` | ante-settler | the JSON array in `.feed-signer-keypair.json` (repo root) |
| `TXODDS_API_TOKEN` | both | the `apiToken` field in `.txodds-creds.json` (repo root) |
| `ROTATE_SECRET` | ante-rotate | same array as `SETTLER_SECRET` (the ops keypair) |
| `FEED_PUBKEY` | ante-rotate | `4EErADfaWezsc9hRHP1snNZQqXyZKaNPq6zDJTaE3dLJ` (public — new markets bind to it) |

`ANCHOR_PROVIDER_URL` is **not** needed — the code defaults to Solana devnet.

## Option A — Railway dashboard (recommended)

1. Open the **ante-worldcup** project → **ante-settler** → **Variables**.
2. Add `SETTLER_SECRET`, `FEED_SECRET`, and `TXODDS_API_TOKEN`.
3. On **ante-rotate**, add `ROTATE_SECRET`, `FEED_PUBKEY`, and `TXODDS_API_TOKEN`.
4. Railway redeploys each service automatically; the cron then runs on schedule.

## Option B — Railway CLI (PowerShell, run by you)

PowerShell has no `\` line-continuation — keep each command on one line:

```powershell
# from the repo root: grab the values
$ops   = (Get-Content .ops-keypair.json -Raw).Trim()
$feed  = (Get-Content .feed-signer-keypair.json -Raw).Trim()
$token = (Get-Content .txodds-creds.json | ConvertFrom-Json).apiToken

# settler
cd "D:\BOUNTY worldcup\settler"
railway variables --set "SETTLER_SECRET=$ops" --set "FEED_SECRET=$feed" --set "TXODDS_API_TOKEN=$token"

# rotation
cd "D:\BOUNTY worldcup\rotation"
railway variables --set "ROTATE_SECRET=$ops" --set "FEED_PUBKEY=4EErADfaWezsc9hRHP1snNZQqXyZKaNPq6zDJTaE3dLJ" --set "TXODDS_API_TOKEN=$token"
```

## Verify it's working

- Railway → service → **Deployments / Logs**. A run prints e.g.
  `settler done · settled=… pending=… skipped=…` or `keeper done · …`.
- Settled markets log `[feed-verified]` — the ed25519 feed signature the
  program checked on-chain.
- Once a match goes final, the next settler run settles it (within ~15 min).

## Key model

| Key | Lives | Can do |
|---|---|---|
| `~/.config/solana/id.json` (treasury) | your machine only | program upgrades, funding — never on the cloud |
| `.ops-keypair.json` (authority/oracle) | repo root + Railway | create/settle/void/close markets |
| `.feed-signer-keypair.json` (feed) | repo root + Railway settler | sign results; the program rejects any score it didn't sign |

Rotating either hot key later is one transaction per market (`set_oracle` /
`set_feed`) — no redeploy. Pointing markets at TxODDS's own signing key, when
they publish one, is the same `set_feed` call.
