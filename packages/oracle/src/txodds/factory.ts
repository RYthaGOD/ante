import type { TxOddsAdapter } from './adapter.ts';
import { MockTxOddsAdapter } from './mock.ts';
import { HttpTxOddsAdapter, httpConfigFromEnv } from './http.ts';

// The one place the oracle decides which feed it talks to. When TxODDS API creds
// are available (env or .txodds-creds.json) it uses the live TxLINE feed;
// otherwise it falls back to the canned mock so local/dev flows still work.
export function getTxOddsAdapter(): { adapter: TxOddsAdapter; live: boolean } {
  const cfg = httpConfigFromEnv();
  if (cfg) return { adapter: new HttpTxOddsAdapter(cfg), live: true };
  return { adapter: new MockTxOddsAdapter(), live: false };
}
