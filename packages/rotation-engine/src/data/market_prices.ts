/**
 * How each crop's market price has moved since the year its value in the income score is priced in
 * (research/explore/market_prices.py -> market_prices.json): DAM's market prices as WFP republishes them, retail, to a
 * few months ago. A crop valued at BBS 2024-25 harvest prices is compared with July 2024-June 2025; one valued from the
 * Agriculture Census 2019 with 2019. The income score uses each crop's move against the median food's move (costs
 * rise with prices in general), and only half of it: the next harvest's price is unknown.
 */
import fs from 'node:fs';

type Base = 'bbs2025' | 'census2019';

interface Move {
  commodity?: string;
  markets: number;
  matched: boolean;
  refTk: number;
  nowTk: number;
  unit: string;
  ratio: number;
  relative: number;
  from: string;
  to: string;
}

interface MarketFile {
  generatedOn: string;
  source: string;
  fileUpdated: string | null;
  general: Record<Base, { label: string; from: string; to: string; ratio: number; foods: number }>;
  crops: Record<string, { commodity: string; standsFor: string } & Partial<Record<Base, Move>>>;
}

/** Fewest markets behind a move the score uses: district markets for 2024-25, division series for 2019. */
const MIN_MARKETS: Record<Base, number> = { bbs2025: 10, census2019: 5 };
/** Share of the relative move the score takes. */
export const MARKET_WEIGHT = 0.5;

let cache: MarketFile | null | undefined;
export function marketFile(): MarketFile | null {
  if (cache !== undefined) return cache;
  const url = new URL('./market_prices.json', import.meta.url);
  cache = fs.existsSync(url) ? (JSON.parse(fs.readFileSync(url, 'utf8')) as MarketFile) : null;
  return cache;
}

export interface MarketMove extends Move {
  cropId: string;
  commodity: string;
  standsFor: string;
  base: Base;
  baseLabel: string;
  /** The score uses it: enough markets behind it. */
  applied: boolean;
  /** 1 + half the relative move: the crop value is multiplied by this. */
  factor: number;
}

/** The crop's price move from the year its value is priced in (`valueSource` names it), or null. */
export function marketMove(cropId: string, valueSource: string | null | undefined): MarketMove | null {
  const f = marketFile();
  const c = f?.crops[cropId];
  if (!f || !c) return null;
  const base: Base = /2019/.test(valueSource ?? '') ? 'census2019' : 'bbs2025';
  const m = c[base];
  if (!m) return null;
  const applied = m.markets >= MIN_MARKETS[base];
  return {
    ...m, cropId, commodity: c.commodity, standsFor: c.standsFor, base, baseLabel: f.general[base].label, applied,
    factor: applied ? 1 + MARKET_WEIGHT * (m.relative - 1) : 1,
  };
}

/** The latest 2024-25 move whatever the base, for a warning when a price has swung hard (potato after its 2024 spike). */
export function recentSwing(cropId: string): Move | null {
  return marketFile()?.crops[cropId]?.bbs2025 ?? null;
}
