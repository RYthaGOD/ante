# Deploying the ANTE web app (devnet, public)

The app is a static-friendly Next.js client that reads the on-chain markets
directly from devnet — no backend. The on-chain program is already deployed and
the markets are seeded, so deploying the frontend is all that's left for people
to try it.

## Required environment variables (production)

| Var | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_RPC` | `https://api.devnet.solana.com` | which cluster to read |
| `NEXT_PUBLIC_MARKET_AUTHORITY` | `AFuSARP1KVUPL9AW22kq86QcgFiBgaDtrFyvPWSAk6wc` | lets the client derive market PDAs (one batched fetch, avoids rate-limited getProgramAccounts) |

**Do NOT set `NEXT_PUBLIC_DEMO_WALLET` in production.** With it unset, the
built-in throwaway demo wallet is disabled and visitors connect their **own**
wallet (Phantom/Solflare/Backpack, set to **Devnet**). The local `.env.local`
(demo mode on) is gitignored and only used for the demo recording.

> For a higher-traffic public site, swap `NEXT_PUBLIC_RPC` for a free Helius/
> Triton devnet endpoint to avoid the public RPC's rate limits.

## Railway (chosen host)

Prepped for Railway already: `railway.json` (Nixpacks + `$PORT` start command),
a `$PORT`-aware `start` script, and Node pinned to 20. Railway builds in the
cloud (Nixpacks runs `npm ci` + `next build`), so deploy from `packages/web`.

From `packages/web`:
```
railway login                 # interactive (browser) — only you can do this
railway init                  # create a new project (name it e.g. ante)
railway up                    # upload + build + deploy this dir
railway variables \
  --set "NEXT_PUBLIC_RPC=https://api.devnet.solana.com" \
  --set "NEXT_PUBLIC_MARKET_AUTHORITY=AFuSARP1KVUPL9AW22kq86QcgFiBgaDtrFyvPWSAk6wc"
railway domain                # generate the public https URL
```
Do **not** set `NEXT_PUBLIC_DEMO_WALLET` → visitors use their own wallet.
After changing variables, redeploy with `railway up`.

### Vercel (alternative)
Import the repo on vercel.com, set **Root Directory** = `packages/web`, add the
two env vars, deploy. Or `npx vercel --prod` from `packages/web`.

## Automated settlement (cron services)

Two Railway cron services keep the markets live against the **real TxODDS feed**
(no manual `feeder settle`, no mock):

- **`settler/`** (`ante-settler`, every 15 min) — settles each catalogue market
  whose match is final, reading the live TxODDS scores.
- **`rotation/`** (`ante-rotate`, every 30 min) — settles its rotating pool from
  the live feed and seeds replacements from real upcoming fixtures.

Both auto-refresh the short-lived guest JWT each run, so only the long-lived API
token is configured. Set these variables on each service (in the Railway
dashboard — secrets must not be piped in):

| Var | Value |
|---|---|
| `SETTLER_SECRET` / `ROTATE_SECRET` | the oracle/authority wallet secret-key JSON array (the `AFuSARP…` devnet keypair) |
| `TXODDS_API_TOKEN` | the long-lived token from `.txodds-creds.json` |
| `ANCHOR_PROVIDER_URL` | `https://api.devnet.solana.com` |

Deploy each from its directory with `railway up --service <name>`.

## How a visitor tries it (devnet)

1. Install **Phantom** (or any Solana wallet) and switch the network to **Devnet**.
2. Get free devnet SOL — the in-app "Devnet · get test SOL ↗" link, or
   <https://faucet.solana.com>.
3. Connect, pick an **open** market, enter an amount, **Bet YES / NO** — it's a
   real devnet transaction.
4. On **settled** markets, see the on-chain SHA-256 proof + "View on Solana
   Explorer ↗", and **Claim** if you backed the winning side.

## Verify the deployed program end-to-end (anytime)

```
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
node packages/oracle/src/e2e-check.ts
```
Runs initialize → bet → settle → claim → double-claim-guard against the live
devnet program with a fresh wallet and asserts every step.
