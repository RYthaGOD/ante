# Turning on the settlement crons

Two Railway services are deployed and idle until they have credentials:

- **ante-settler** — settles catalogue markets from the live TxODDS feed (every 15 min)
- **ante-rotate** — settles + seeds the rotation pool from the live feed (every 30 min)

Each needs two variables. I can't set these for you — they include your wallet
secret key, and shipping a private key to a third-party service is blocked (it's
also the keypair that holds your mainnet TxODDS subscription, so you want it
entered by hand, not piped through a command). It's a 2-minute step.

## The two values

| Variable | Where to get it |
|---|---|
| `SETTLER_SECRET` / `ROTATE_SECRET` | the full JSON array in `~/.config/solana/id.json` — run `wsl cat ~/.config/solana/id.json` and copy the whole `[...]` |
| `TXODDS_API_TOKEN` | the `apiToken` field in `.txodds-creds.json` (repo root) |

`ANCHOR_PROVIDER_URL` is **not** needed — the code defaults to Solana devnet.

## Option A — Railway dashboard (recommended)

1. Open the **ante-worldcup** project → **ante-settler** → **Variables**.
2. Add `SETTLER_SECRET` = the `[...]` array, and `TXODDS_API_TOKEN` = the token.
3. Repeat on **ante-rotate**, but name the key `ROTATE_SECRET` (same array value).
4. Railway redeploys each service automatically; the cron then runs on schedule.

## Option B — Railway CLI (PowerShell, run by you)

PowerShell has no `\` line-continuation — keep each command on one line. Capture
the two values into variables first, then set them from each service's linked
folder (`settler/` is linked to ante-settler, `rotation/` to ante-rotate):

```powershell
# from the repo root: grab the values
$secret = (wsl bash -c "cat ~/.config/solana/id.json").Trim()
$token  = (Get-Content .txodds-creds.json | ConvertFrom-Json).apiToken

# settler
cd "D:\BOUNTY worldcup\settler"
railway variables --set "SETTLER_SECRET=$secret" --set "TXODDS_API_TOKEN=$token"

# rotation
cd "D:\BOUNTY worldcup\rotation"
railway variables --set "ROTATE_SECRET=$secret" --set "TXODDS_API_TOKEN=$token"
```

## Verify it's working

- Railway → service → **Deployments / Logs**. A run prints e.g.
  `settler done · settled=… pending=… skipped=…` or `rotation done · …`.
- Once a match goes final, the next run settles it on-chain (within ~15 min for
  ante-settler). Brazil v Japan resolves ~20:00 UTC, so it's the first to watch.

## Optional hardening (more secure, more work)

Right now the cron uses your authority/treasury keypair because that key is the
markets' oracle. To keep that key off the cloud, we'd add a `set_oracle`
instruction, reassign each market's oracle to a throwaway feeder keypair funded
with a little devnet SOL, and put only that low-privilege key on Railway. Happy
to set this up if you want the cloud key to have zero access to your funds.
