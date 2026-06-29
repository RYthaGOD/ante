# ANTE — Verifiable Settlement for World Cup Prediction Markets

A Solana prediction market where the differentiator is **trustless, verifiable
settlement**: every market resolves against TxODDS-confirmed results, and the
winning outcome plus its SHA-256 proof are committed on-chain. Built for the
TxODDS **World Cup Hackathon — Prediction Markets & Settlement** track.

> Inspired by Upshot's card-style markets, but where Upshot says *"redeem for
> cash — trust us"*, ANTE shows the on-chain settlement proof.

**Live MVP (Solana devnet):** https://ante-web-production-5d56.up.railway.app —
connect a wallet set to Devnet, place a YES/NO bet, and claim on a settled market.
Deployment + "how to try it" guide: [`packages/web/DEPLOY.md`](packages/web/DEPLOY.md).

## How it works

```
TxODDS feed ──► Oracle/Feeder (packages/oracle) ──► ante-market program (Solana)
 (verified)      reads results, posts (outcome,        create / bet / settle / claim
                  sha256 digest) on-chain               + MarketResolved event
                                                              │
                                          Next.js card UI (packages/web) reads it
```

- **Markets** are binary YES/NO, identified by a `market_id`.
  - *Score markets* (`home_win`, `over_2_5`): the feeder posts the verified score
    and the **program computes the winner** and checks `sha256(market_id:home:away)`.
  - *Custom markets* (Golden Boot, player props, progression…): the feeder posts
    the YES/NO outcome directly, bound by `sha256(market_id:YES|NO)`. Same
    trustless guards (authorized feeder, settle window, on-chain digest).
- **Bettors** stake SOL into a parimutuel pool; winners claim pro-rata.
- The TS settlement logic (`packages/oracle`) is the exact twin of the on-chain
  rule, so the feeder and chain agree by construction.

## Layout

| Path | What |
|---|---|
| `programs/ante-market` | Anchor program — `initialize_market` / `place_bet` / `post_result` / `post_custom_result` / `claim` |
| `tests/ante-market.ts` | Integration tests (score + custom settlement, guard rejections) |
| `packages/oracle` | TxODDS adapter (mock), market registry, settlement logic, **feeder** service + off-chain demo |
| `packages/web` | Next.js card UI: live markets, place bet, claim, settlement-proof view |

## Prerequisites (WSL Ubuntu)

Solana CLI + Anchor (`solana 3.x`, `anchor 0.32`) and Node (via `nvm`). All
commands run from the repo root inside WSL.

## Run it

```bash
# 1. Build + start a local validator
anchor build
solana-test-validator --reset --quiet --ledger /tmp/ante-ledger &   # in another shell
solana config set --url http://127.0.0.1:8899

# 2. Deploy the program
anchor deploy --provider.cluster localnet

# 3. Seed + settle markets on-chain
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json
node packages/oracle/src/feeder.ts init     # create all catalogue markets
node packages/oracle/src/feeder.ts settle   # settle the resolvable ones
node packages/oracle/src/feeder.ts list     # inspect on-chain state

# 4. Run the web app
cd packages/web && npm install && npm run dev   # http://localhost:3000
```

Connect a wallet (Phantom set to the localhost cluster), place a YES/NO bet on an
open market, and claim on a settled one. The off-chain demo (no chain needed):
`node packages/oracle/src/demo.ts`.

## Tests

```bash
anchor deploy --provider.cluster localnet
npx ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'
```

## Production note

The mock TxODDS adapter (`packages/oracle/src/txodds/mock.ts`) is the only thing
between this and live data — everything depends on the `TxOddsAdapter` interface,
so swapping in the real TxODDS feed is a one-file change. Settlement hardening
(M-of-N feeders, dispute window) follows the ANTE mechanism design.
