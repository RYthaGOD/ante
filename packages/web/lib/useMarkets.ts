"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getReadonlyProgram, MARKET_AUTHORITY } from "./anchor";
import { isDisplayableMarket } from "./teams";

// Retry transient RPC failures (public devnet rate-limits getProgramAccounts).
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { publicKey: PublicKey; account: any };

// Open (still taking bets) first, then settled; within each, soonest cutoff first.
const byOpenThenCutoff = (a: Row, b: Row) => {
  const ao = "open" in a.account.status ? 0 : 1;
  const bo = "open" in b.account.status ? 0 : 1;
  return ao - bo || a.account.settleAfter.toNumber() - b.account.settleAfter.toNumber();
};

const authorityFilter = () =>
  MARKET_AUTHORITY ? [{ memcmp: { offset: 8, bytes: MARKET_AUTHORITY.toBase58() } }] : [];

// Discovers every market the oracle has created on-chain — so markets the crons
// seed from the live feed appear automatically, with no redeploy. Filtered
// server-side by authority (memcmp), decoded per-account so a Bet account or a
// legacy-layout market can never break the listing, then filtered to the
// displayable wc26-<home>-<away>:<kind> ids (drops throwaway/e2e markets).
export function useMarkets() {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const program = getReadonlyProgram(connection);
      const raw = await retry(() =>
        connection.getProgramAccounts(program.programId, {
          commitment: "confirmed",
          filters: authorityFilter(),
        }),
      );
      const known = raw.flatMap(({ pubkey, account }) => {
        try {
          const decoded = program.coder.accounts.decode("market", account.data);
          return isDisplayableMarket(decoded.marketId) ? [{ publicKey: pubkey, account: decoded }] : [];
        } catch {
          return []; // not a current-layout Market — skip, never crash the grid
        }
      });
      known.sort(byOpenThenCutoff);
      setMarkets(known);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Live updates: the RPC websocket pushes every market account change (new
  // bets, cron-seeded markets, settlements) straight into the grid.
  useEffect(() => {
    const program = getReadonlyProgram(connection);
    let subId: number | null = null;
    try {
      subId = connection.onProgramAccountChange(
        program.programId,
        ({ accountId, accountInfo }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let decoded: any;
          try {
            decoded = program.coder.accounts.decode("market", accountInfo.data);
          } catch {
            return; // a Bet account or foreign layout — not ours to render
          }
          if (!isDisplayableMarket(decoded.marketId)) return;
          setMarkets((prev) => {
            const next = prev.filter((m) => !m.publicKey.equals(accountId));
            next.push({ publicKey: accountId, account: decoded });
            next.sort(byOpenThenCutoff);
            return next;
          });
        },
        "confirmed",
        authorityFilter(),
      );
    } catch (e) {
      console.warn("live market subscription unavailable; refresh still works", e);
    }
    return () => {
      if (subId !== null) connection.removeProgramAccountChangeListener(subId).catch(() => {});
    };
  }, [connection]);

  const now = Math.floor(Date.now() / 1000);
  // "Open" = still taking bets (status Open AND cutoff in the future).
  const open = markets.filter(
    (m) => "open" in m.account.status && m.account.settleAfter.toNumber() > now,
  ).length;
  const settled = markets.filter((m) => "resolved" in m.account.status).length;
  const pooled = markets.reduce(
    (s, m) => s + (m.account.poolYes.toNumber() + m.account.poolNo.toNumber()) / LAMPORTS_PER_SOL,
    0,
  );

  return { markets, loading, reload, open, settled, pooled };
}
