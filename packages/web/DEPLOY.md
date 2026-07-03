# Deploying the ANTE web app (devnet, public)

The app is a static-friendly Next.js client that reads the on-chain markets
directly from devnet — no backend. The on-chain program is already deployed and
the markets are seeded, so deploying the frontend is all that's left for people
to try it.

## Required environment variables (production)

| Var | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_RPC` | `https://api.devnet.solana.com` | which cluster to read |
| `NEXT_PUBLIC_MARKET_AUTHORITY` | `9XDgRxtYkPCaTV2a69VYCNWoCVjuQw1y8897rWZZJWLB` | the ops keypair that creates markets — the client filters/derives market accounts by this authority |

**Do NOT set `NEXT_PUBLIC_DEMO_WALLET` in production.** With it unset, the
built-in throwaway demo wallet is disabled and visitors connect their **own**
wallet (Phantom/Solflare/Backpack, set to **Devnet**). The local `.env.local`
(demo mode on) is gitignored and only used for the demo recording.

> For a higher-traffic public site, swap `NEXT_PUBLIC_RPC` for a free Helius/
> Triton devnet endpoint to avoid the public RPC's rate limits.

## Railway (chosen host)

**Push-to-deploy is live:** the service builds from GitHub `main` on every push,
using the repo-root `railway.json` (pins NIXPACKS — Railway's newer Railpack
default would otherwise detect the root `Cargo.toml` and try to build the Anchor
program — and builds/starts `packages/web`). A healthcheck on `/` gates the
traffic swap, so a bad build can never replace the running site.

Manual alternative from `packages/web`: `railway up`. After changing
`NEXT_PUBLIC_*` variables, redeploy (they're baked at build time).
Do **not** set `NEXT_PUBLIC_DEMO_WALLET` → visitors use their own wallet.

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
token is configured. The settler also holds the **feed signing key**: every
score it posts carries an ed25519 signature the program verifies on-chain, so
the oracle key alone can't invent a result. Credentials + the full key model:
[`CRON_SETUP.md`](../../CRON_SETUP.md) at the repo root.

Deploy each from its directory with `railway up`.

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
