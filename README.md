# ANTE — Verifiable Settlement for World Cup Prediction Markets

A Solana prediction market where the differentiator is **trustless, verifiable
settlement**: every market resolves against TxODDS-confirmed results, and the
winning outcome plus its SHA-256 proof are committed on-chain. Built for the
TxODDS **World Cup Hackathon — Prediction Markets & Settlement** track.

> Inspired by Upshot's card-style markets, but where Upshot says *"redeem for
> cash — trust us"*, ANTE shows the on-chain settlement proof.

**Live (Solana devnet):** https://ante-bet.xyz — connect a wallet set to Devnet,
place a YES/NO bet, and claim on a settled market. Markets settle from the
**live TxODDS (TxLINE) feed** on a cron; every settled card shows its on-chain
proof, recomputable in the browser with one click.
Deployment + "how to try it" guide: [`packages/web/DEPLOY.md`](packages/web/DEPLOY.md).

## How it works

```
TxLINE feed ──► settler cron ──► ante-market program (Solana)
 (live scores)   posts score + sha256     verifies the feed's ed25519 signature
                 + feed ed25519 sig       over the exact score, recomputes the
                        │                 digest, computes the winner, settles
                        │                        │  MarketResolved event
                 rotation cron seeds             │
                 upcoming fixtures        Next.js card UI reads it (websocket live)
```

- **Markets** are binary YES/NO, identified by a `market_id`.
  - *Score markets* (`home_win`, `over_2_5`): the feeder posts the verified score;
    the **program computes the winner**, checks `sha256(market_id:home:away)`,
    and — for feed-bound markets — **verifies the feed's ed25519 signature over
    `fixture:final:home:away` via instruction introspection**. The oracle alone
    cannot settle a score the feed never produced.
  - *Custom markets* (Golden Boot, player props, progression…): the feeder posts
    the YES/NO outcome directly, bound by `sha256(market_id:YES|NO)`. Same
    trustless guards (authorized feeder, settle window, on-chain digest).
- **Bettors** stake SOL into a parimutuel pool; winners claim pro-rata (the Bet
  account closes on claim, so rent comes back too).
- Abandoned fixture? After a grace window the market can be **voided** and every
  stake is reclaimable in full — funds can never strand.
- The TS settlement logic (`packages/oracle`) is the exact twin of the on-chain
  rule, so the feeder and chain agree by construction.

## Verify a settlement yourself

Open any settled card on [ante-bet.xyz](https://ante-bet.xyz) and hit
**"Recompute proof in browser"**: it brute-forces the scoreline out of the
on-chain digest (`sha256("wc26-bra-jpn:home_win:2:1")`), shows the preimage, and
links the settle transaction on Solana Explorer — where the ed25519 feed
signature is visible in the same transaction.

## Layout

| Path | What |
|---|---|
| `programs/ante-market` | Anchor program — `initialize_market` / `place_bet` / `post_result` (ed25519 feed verify) / `post_custom_result` / `claim` / `void_market` / `close_market` / `set_oracle` / `set_feed` / `set_settle_after` |
| `tests/ante-market.ts` | 10 integration tests: score + custom settlement, feed-signature guards (missing/wrong signer/wrong score), void + refunds, fee math, oracle rotation, deadline sweep |
| `packages/oracle` | **Live TxLINE adapter** (+ mock fallback behind the same `TxOddsAdapter` interface), market registry, settlement logic, feeder + one-time TxODDS onboarding CLI |
| `packages/web` | Next.js card UI: live markets (websocket), payout preview, place bet, claim, in-browser proof recompute |
| `settler/` `rotation/` | Railway crons: settle finished matches from the live feed (feed-signed), keep the board seeded with upcoming fixtures |

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

## Live data & trust model

The devnet deployment runs on the **real TxODDS (TxLINE) feed** — REST fixtures
snapshot + SSE score streams, gated by the on-chain `subscribe` transaction and
an ed25519-activated API token (see [`packages/oracle/TXODDS.md`](packages/oracle/TXODDS.md)).
The mock adapter remains only as a local-dev fallback behind the same
`TxOddsAdapter` interface.

Three keys, three privileges:

| Key | Where | Can do |
|---|---|---|
| treasury | offline | program upgrades, funding |
| ops (authority/oracle) | Railway crons | create/settle/void/close markets |
| feed signer | Railway settler | sign results — the program **rejects any score it didn't sign** |

Today the feed key is ours, attesting at ingestion what TxLINE served; when
TxODDS publishes their own signing key, `set_feed` points every market at it
with **no redeploy** — the on-chain verification is already in place. Next on
the roadmap: M-of-N feeders and a dispute window, per the ANTE mechanism design.
