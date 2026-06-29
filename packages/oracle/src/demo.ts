import { MockTxOddsAdapter } from './txodds/mock.ts';
import { loadMarkets, loadCustomOutcomes, isResolvable } from './market/registry.ts';
import { settleScore, settleCustom } from './market/settle.ts';
import type { Outcome, Resolution } from './txodds/types.ts';

// Parimutuel pool: stakes on each side, winners split the whole pool pro-rata.
interface Bet { bettor: string; outcome: Outcome; amount: number; }

async function main() {
  const txodds = new MockTxOddsAdapter();
  const markets = loadMarkets();
  const customOutcomes = loadCustomOutcomes();

  console.log('ANTE - settlement loop (mock TxODDS feed)\n');

  for (const m of markets) {
    let res: Resolution | null = null;
    if (isResolvable(m)) {
      if (m.kind === 'custom') {
        const outcome = customOutcomes[m.id];
        if (outcome) res = settleCustom(m, outcome);
      } else if (m.fixtureId) {
        const result = await txodds.getResult(m.fixtureId);
        if (result) res = settleScore(m, result);
      }
    }

    console.log(`${m.title}  [${m.kind}]`);
    console.log(`  ${m.blurb}`);
    if (!res) {
      console.log(`  -> OPEN (resolves ${m.resolutionDate})\n`);
      continue;
    }

    const bets: Bet[] = [
      { bettor: 'alice', outcome: 'YES', amount: 100 },
      { bettor: 'bob', outcome: 'NO', amount: 60 },
      { bettor: 'carol', outcome: 'YES', amount: 40 },
    ];
    const pool = bets.reduce((s, b) => s + b.amount, 0);
    const winners = bets.filter((b) => b.outcome === res!.winningOutcome);
    const winStake = winners.reduce((s, b) => s + b.amount, 0);

    console.log(`  -> ${res.winningOutcome} wins  (digest ${res.resultDigest.slice(0, 12)}...)`);
    for (const b of winners) {
      const payout = winStake > 0 ? (b.amount / winStake) * pool : 0;
      console.log(`     ${b.bettor} staked ${b.amount} ${b.outcome} -> pays ${payout.toFixed(2)}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
