import teamsData from "../data/teams.json";
import marketsData from "../data/markets.json";
import type { MarketKind, MarketMeta } from "./markets";

// Curated market ids (hand-written metadata). Imported from the raw JSON rather
// than from ./markets to avoid a markets <-> teams import cycle.
const CURATED_IDS = new Set((marketsData as { id: string }[]).map((m) => m.id));

interface TeamRow { code: string; name: string; art: string; aliases: string[] }

// code -> { name, art } for rendering any market created from a fixture slug.
const TEAM: Record<string, { name: string; art: string }> = {};
for (const t of (teamsData as { teams: TeamRow[] }).teams) TEAM[t.code] = { name: t.name, art: t.art };

const teamName = (code: string) => TEAM[code]?.name ?? code.toUpperCase();
const overArt = ["goals", "fireworks", "goal-frenzy", "goal-fireworks"];

// Build display metadata for a market id of the form wc26-<home>-<away>:<kind>.
// Returns null for ids that don't match (e.g. throwaway e2e markets), so they
// can be filtered out of the grid.
export function metaFromId(marketId: string): MarketMeta | null {
  const m = marketId.match(/^wc26-([a-z]{3})-([a-z]{3}):(home_win|over_2_5)$/);
  if (!m) return null;
  const [, hc, ac, kind] = m;
  const home = teamName(hc);
  const away = teamName(ac);
  const isOver = kind === "over_2_5";
  return {
    id: marketId,
    kind: kind as MarketKind,
    title: isOver ? `Goal Rush: ${home} v ${away}` : `${home} to Beat ${away}`,
    blurb: isOver ? `Over 2.5 goals in ${home} vs ${away}.` : `${home} beat ${away}.`,
    art: isOver
      ? overArt[(hc.charCodeAt(0) + ac.charCodeAt(2)) % overArt.length]
      : TEAM[hc]?.art ?? "default",
  };
}

// True for any market id the app should display (excludes e2e/throwaway ids).
// Fixture-shaped ids render from generated metadata; curated ids from
// data/markets.json are always displayable — that's what lets a hand-written
// `custom` market (player prop / tournament special) show up if one is created.
export const isDisplayableMarket = (marketId: string): boolean =>
  /^wc26-[a-z]{3}-[a-z]{3}:(home_win|over_2_5)$/.test(marketId) || CURATED_IDS.has(marketId);
