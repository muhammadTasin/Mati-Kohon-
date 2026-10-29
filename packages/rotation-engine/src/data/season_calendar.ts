/**
 * The place's NASA season calendar (research/explore/season_calendar.py -> season_calendar.json): month by month, the
 * average days of heat (36 C or more), cold (10 C or less), near-frost (4 C or less), heavy rain (44 mm or more),
 * erosive rain (23 mm or more) and dry days, the root-zone wetness and evapotranspiration, seasons 2001-2025, at the
 * Talanda pilot and the 64 district points (NASA POWER with the replay's BMD station correction, GPM IMERG Final);
 * the trend of each yearly total by two methods (recent minus early means, Theil-Sen with a Mann-Kendall p); and the
 * satellite's greenness by month at each upazila centre (NASA MODIS NDVI, 2021-25 and 2001-05).
 */
import fs from 'node:fs';
import type { SeasonCalendarSummary } from '@project-eden/contracts';
import { LOC } from './location.ts';

export interface PlaceCalendar {
  station: { name: string; wmo: number; km: number } | null;
  months: {
    rainMm: number[];
    heavyRainDays: number[];
    erosiveRainDays: number[];
    dryDays: number[];
    hotDays: number[];
    coldNights: number[];
    nearFrostNights: number[];
    et0Mm: number[];
    etMm?: number[];
    rootWet: number[];
  };
  /** Hot days if every day were 1, 2 or 3 C warmer ('+1', '+2', '+3'). */
  warmer: Record<string, number[]>;
  /** Erosive-rain days if every day's rain were 10 or 20 per cent lighter or heavier ('-20', '-10', '+10', '+20'). */
  erosiveRainScaled: Record<string, number[]>;
  trend: Record<string, { early: number; recent: number; change: number; slopePerDecade: number; kendallTau: number; p: number }>;
}

interface CalendarFile {
  generatedOn: string;
  seasons: string;
  source: string;
  method: string;
  thresholds: Record<string, number>;
  trendPeriods: { early: string; recent: string };
  places: Record<string, PlaceCalendar>;
  greenness: { product: string; recentYears: string; earlyYears: string; upazilas: Record<string, { recent: Array<number | null>; early: Array<number | null> }> };
}

let cache: CalendarFile | null = null;
export function calendarFile(): CalendarFile {
  cache ??= JSON.parse(fs.readFileSync(new URL('./season_calendar.json', import.meta.url), 'utf8')) as CalendarFile;
  return cache;
}

/** A trend counts as clear at p below 0.05 (Mann-Kendall); otherwise the calendar says there is no clear trend. */
export const CLEAR_TREND_P = 0.05;

/** The calendar of the place the advice is for: the pilot's own point, else its district's point. */
export function calendarHere(): PlaceCalendar | null {
  const f = calendarFile();
  return f.places[LOC.kind === 'pilot' ? 'talanda_tanore' : LOC.district] ?? null;
}

/** The satellite's greenness by month at the upazila's centre (the pilot is Tanore), or null. */
export function greennessHere(): { recent: Array<number | null>; early: Array<number | null> } | null {
  return calendarFile().greenness.upazilas[LOC.kind === 'pilot' ? 'ADM3_Tanore' : LOC.id] ?? null;
}

type EcostressPilot = NonNullable<SeasonCalendarSummary['ecostress']>;
let ecostressCache: EcostressPilot | null | undefined;
/**
 * NASA ECOSTRESS at 70 m around the Talanda pilot (research/explore/ecostress_pilot.py): per dry-season month, the
 * median evapotranspiration and stress index and the shares of land well watered or strongly stressed. Pilot only.
 */
export function ecostressPilot(): EcostressPilot | null {
  if (ecostressCache !== undefined) return ecostressCache;
  const url = new URL('./ecostress_pilot.json', import.meta.url);
  if (!fs.existsSync(url)) return (ecostressCache = null);
  const f = JSON.parse(fs.readFileSync(url, 'utf8'));
  ecostressCache = { source: f.source, years: f.years, thresholds: f.thresholds, monthly: f.monthly, overpasses: f.overpasses.length };
  return ecostressCache;
}

/** What the dashboard's timeline, trends table and glossary need, for the current place. */
export function calendarSummary(): SeasonCalendarSummary | null {
  const f = calendarFile();
  const c = calendarHere();
  if (!c) return null;
  const order = ['hotDays', 'coldNights', 'heavyRainDays', 'rainMm', 'dryRootWet', 'rootWet', 'et0Mm'];
  return {
    place: LOC.kind === 'pilot' ? 'Talanda (Tanore) pilot point' : `${LOC.district} district point`,
    placeBangla: LOC.kind === 'pilot' ? 'তালন্দ (তানোর) পাইলট বিন্দু' : `${LOC.district} জেলার বিন্দু`,
    station: c.station ? `${c.station.name.replace(/\s+/g, ' ').trim()} (${c.station.km} km)` : null,
    seasons: f.seasons,
    thresholds: f.thresholds,
    months: c.months as unknown as Record<string, number[]>,
    greenness: greennessHere(),
    trends: order.filter(id => c.trend[id]).map(id => {
      const t = c.trend[id];
      return { id, early: t.early, recent: t.recent, change: t.change, slopePerDecade: t.slopePerDecade, p: t.p, clear: t.p < CLEAR_TREND_P };
    }),
    trendPeriods: f.trendPeriods,
    source: f.source,
    ecostress: LOC.kind === 'pilot' ? ecostressPilot() : null,
  };
}
