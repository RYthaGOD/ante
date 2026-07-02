# Live TxODDS (TxLINE) settlement feed

ANTE settles markets against TxODDS-confirmed results. The oracle talks to TxODDS
through one interface — [`TxOddsAdapter`](src/txodds/adapter.ts) — with two
implementations:

- [`MockTxOddsAdapter`](src/txodds/mock.ts) — canned fixtures/scores for local dev.
- [`HttpTxOddsAdapter`](src/txodds/http.ts) — the live TxLINE feed.

[`getTxOddsAdapter()`](src/txodds/factory.ts) picks the live feed automatically
when API credentials are present (env `TXODDS_JWT` + `TXODDS_API_TOKEN`, or a
`.txodds-creds.json` written by onboarding); otherwise it falls back to the mock.
The feeder prints which feed it used (`feed   LIVE TxODDS …` / `mock TxODDS …`).

## Free World Cup tier

TxODDS gates the free World Cup feed behind a one-time **on-chain `subscribe`
transaction on Solana mainnet** (no TxL tokens required, but it spends a little
SOL for fees + the token-account rent). That binds your wallet to the service;
you then mint a long-lived API token by proving you own that wallet.

The on-chain accounts (program, pricing-matrix PDA, the **Token-2022** TxL mint,
and the treasury vault) are verified against mainnet — the CLI derives them for
you and a dry run prints them so you can sanity-check before sending.

The whole flow is one command (run it once):

```bash
cd packages/oracle
# wallet that will subscribe (needs ~0.01 SOL on mainnet for fees/rent)
export ANCHOR_WALLET=~/.config/solana/id.json
# optional: real-time instead of the 60s-delay tier
# export TXODDS_SERVICE_LEVEL=12

# dry run first — prints every derived account, sends nothing:
npm run txodds -- subscribe
# then actually subscribe + activate (writes .txodds-creds.json):
npm run txodds -- subscribe send
```

`subscribe send` does all four steps: on-chain `subscribe(serviceLevelId, weeks)`
→ `POST /auth/guest/start` → sign `txSig:leagues:jwt` → `POST /api/token/activate`,
then saves the JWT + API token to `.txodds-creds.json` (gitignored).

If the on-chain tx lands but activation fails, retry just the REST half:

```bash
npm run txodds -- activate <txSig>
```

> Security: the wallet secret never leaves your machine — only the transaction
> signature, a detached signature, and the guest JWT are sent to TxODDS (that is
> the protocol). Do not paste your keypair anywhere.

## Map ANTE fixtures to TxODDS fixtures

Our markets use ids like `wc26-esp-ger`; TxODDS uses numeric `FixtureId`s. Pull
the live snapshot and fill [`fixtures/txodds-map.json`](fixtures/txodds-map.json):

```bash
npm run txodds -- fixtures            # lists CompetitionId + FixtureId + teams
```

Set each `fixtureId` (and `competitionId` if you want to scope the snapshot). Use
`swap: true` when TxODDS lists our away team as `Participant1`. Test one:

```bash
npm run txodds -- result wc26-esp-ger
```

## Settle for real

Once creds + map are in place, settlement is unchanged:

```bash
ANCHOR_PROVIDER_URL=<devnet-rpc> ANCHOR_WALLET=<oracle-wallet> npm run feeder settle
```

The feeder pulls each finished match's score from `GET /api/scores/historical/{id}`
(`statusSoccerId ∈ {F, FET, FPE}`, goals from `scoreSoccer.Participant{1,2}.Total.Goals`),
derives the SHA-256 digest, and posts it on-chain — the same verifiable digest the
program re-checks.

## Config reference

| Env | Default | Meaning |
|---|---|---|
| `ANCHOR_WALLET` | `~/.config/solana/id.json` | wallet that subscribes / signs |
| `TXODDS_RPC_URL` | `https://api.mainnet-beta.solana.com` | subscribe network (`devnet` in URL → devnet program) |
| `TXODDS_SERVICE_LEVEL` | `1` | `1` = 60s delay, `12` = real-time |
| `TXODDS_WEEKS` | `4` | subscription duration (multiples of 4) |
| `TXODDS_LEAGUES` | _(empty)_ | comma-separated league ids; empty = standard bundle |
| `TXODDS_JWT` / `TXODDS_API_TOKEN` | _(from creds file)_ | override creds explicitly |
| `TXODDS_COMPETITION_ID` | _(none)_ | scope the fixtures snapshot |
| `TXODDS_BASE_URL` | `https://txline.txodds.com` | API base |
