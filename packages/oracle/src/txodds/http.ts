import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TxOddsAdapter } from './adapter.ts';
import type { Fixture, MatchResult } from './types.ts';
import { readCreds } from './creds.ts';
import { TXODDS_BASE_URL } from './auth.ts';

// Live TxODDS (TxLINE) feed. Implements the same TxOddsAdapter the mock does, so
// the feeder/settlement mechanism is untouched — selection happens in factory.ts.
//
// Data endpoints (both require Authorization: Bearer <jwt> AND X-Api-Token):
//   GET /api/fixtures/snapshot?competitionId=...   -> recent/upcoming fixtures (JSON)
//   GET /api/scores/historical/{fixtureId}         -> Server-Sent Events stream of
//                                                     match events for one fixture
//
// The scores response is an SSE stream (`data: {...}` lines), not a JSON array.
// Each event carries an `Action` and a cumulative `Score`. The match is final at
// the `game_finalised` event; the scoreline is `Score.Participant{1,2}.Total.Goals`
// (a missing Goals key means zero). Times (`StartTime`, `Ts`) are epoch millis.

const FINAL_ACTION = 'game_finalised';
const mapPath = fileURLToPath(new URL('../../fixtures/txodds-map.json', import.meta.url));

// Maps an ANTE fixture id (e.g. "wc26-esp-sau") to the numeric TxODDS FixtureId.
// `swap` flips home/away when TxODDS Participant1 is our away team.
interface FixtureMapEntry { fixtureId: number; swap?: boolean }
interface FixtureMap { competitionId: number | null; fixtures: Record<string, FixtureMapEntry> }

export interface HttpConfig {
  baseUrl: string;
  jwt: string;
  apiToken: string;
  competitionId?: number;
}

// Builds config from env (TXODDS_JWT / TXODDS_API_TOKEN), falling back to the
// .txodds-creds.json the onboarding CLI writes. Returns null if not configured.
export function httpConfigFromEnv(): HttpConfig | null {
  const creds = readCreds();
  const jwt = process.env.TXODDS_JWT ?? creds?.jwt;
  const apiToken = process.env.TXODDS_API_TOKEN ?? creds?.apiToken;
  if (!jwt || !apiToken) return null;
  const competitionId = process.env.TXODDS_COMPETITION_ID
    ? Number(process.env.TXODDS_COMPETITION_ID)
    : undefined;
  return { baseUrl: process.env.TXODDS_BASE_URL ?? TXODDS_BASE_URL, jwt, apiToken, competitionId };
}

function loadMap(): FixtureMap {
  if (existsSync(mapPath)) {
    try { return JSON.parse(readFileSync(mapPath, 'utf8')) as FixtureMap; } catch { /* fall through */ }
  }
  return { competitionId: null, fixtures: {} };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Parse a Server-Sent Events body into its `data:` JSON payloads.
function parseSse(text: string): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try { out.push(JSON.parse(line.slice(5).trim())); } catch { /* skip non-JSON keepalives */ }
  }
  return out;
}

// The cumulative final scoreline, read from the latest event at/before the final
// that carries a Score (a missing Total.Goals means zero goals).
function finalGoals(events: Array<Record<string, any>>, finalIdx: number): { p1: number; p2: number } | null {
  for (let i = finalIdx; i >= 0; i--) {
    const s = events[i]?.Score;
    if (s && (s.Participant1 || s.Participant2)) {
      return { p1: num(s.Participant1?.Total?.Goals) ?? 0, p2: num(s.Participant2?.Total?.Goals) ?? 0 };
    }
  }
  return null;
}

export class HttpTxOddsAdapter implements TxOddsAdapter {
  private readonly cfg: HttpConfig;
  private readonly map: FixtureMap;

  constructor(cfg: HttpConfig, map?: FixtureMap) {
    this.cfg = cfg;
    this.map = map ?? loadMap();
  }

  private headers() {
    return { Authorization: `Bearer ${this.cfg.jwt}`, 'X-Api-Token': this.cfg.apiToken };
  }

  async listFixtures(): Promise<Fixture[]> {
    const competitionId = this.cfg.competitionId ?? this.map.competitionId ?? undefined;
    const url = new URL(`${this.cfg.baseUrl}/api/fixtures/snapshot`);
    if (competitionId != null) url.searchParams.set('competitionId', String(competitionId));
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`fixtures/snapshot ${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as Array<Record<string, any>>;
    return rows.map((r) => {
      const p1Home = r.Participant1IsHome !== false;
      return {
        id: String(r.FixtureId),
        competition: r.Competition ?? 'FIFA World Cup 2026',
        homeTeam: p1Home ? r.Participant1 : r.Participant2,
        awayTeam: p1Home ? r.Participant2 : r.Participant1,
        kickoff: new Date(r.StartTime ?? 0).toISOString(),
        status: 'scheduled' as const,
      };
    });
  }

  async getResult(ourFixtureId: string): Promise<MatchResult | null> {
    const entry = this.map.fixtures[ourFixtureId];
    if (!entry || !entry.fixtureId) return null; // not yet mapped to a TxODDS fixture
    const res = await fetch(`${this.cfg.baseUrl}/api/scores/historical/${entry.fixtureId}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`scores/historical/${entry.fixtureId} ${res.status}: ${await res.text()}`);
    const events = parseSse(await res.text());
    if (events.length === 0) return null;

    // Find the match-over marker; absent it, the match isn't final yet.
    let finalIdx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]?.Action === FINAL_ACTION) { finalIdx = i; break; }
    }
    if (finalIdx < 0) return null;

    const goals = finalGoals(events, finalIdx);
    if (!goals) return null;

    const final = events[finalIdx];
    return {
      fixtureId: ourFixtureId,
      homeGoals: entry.swap ? goals.p2 : goals.p1,
      awayGoals: entry.swap ? goals.p1 : goals.p2,
      status: 'final',
      source: `txodds:txline:${entry.fixtureId}:${FINAL_ACTION}`,
      settledAt: new Date(num(final?.Ts) ?? Date.now()).toISOString(),
    };
  }
}
