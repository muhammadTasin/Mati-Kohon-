/**
 * One row per upazila for the dashboard's map of Bangladesh, read from the same files the advice uses:
 * MODIS crops a year and winter greenness (research/explore/national_greenness.py), the district's 25-season NASA
 * replay and GLDAS groundwater (national_replay.py), NASA SEDAC PEST-CHEMGRIDS pesticide on rice and on pulses and
 * oilseeds (pesticide_load.py), SRDI soil fertility classes (soil_atlas_export.py), the district's season risks
 * (season_calendar.py: spring heat, winter cold nights, soil-moving rain in the bare pre-monsoon months, the dry season's
 * root zone and the 25-year trend of hot days), and today's NASA conditions
 * (research/live/daily_update.py). District-level values repeat for every upazila of the district, and say so.
 * This week's field alerts use the engine's rules (field_alerts.ts) with the usual crop calendar: every Aman variety
 * the advice knows (the most serious result counts), BRRI dhan28 for Boro and BARI Gom 33 for wheat, where the
 * upazila grows them (BRRI's 2014-15 cropping patterns; Aman not on low land).
 */
import fs from 'node:fs';
import { cropLossFor, floodFor, liveFields, liveStatus, liveUpazilas } from './live.ts';
import { LOC } from '../../../packages/rotation-engine/src/data/location.ts';
import { AMAN_CATALOG } from '../../../packages/rotation-engine/src/data/crop_catalog.ts';
import { fieldAlerts, worstLevel, type FieldAlert, type FieldCrops } from '../../../packages/rotation-engine/src/field_alerts.ts';

const DATA = new URL('../../../packages/rotation-engine/src/data/', import.meta.url);
const read = (name: string) => JSON.parse(fs.readFileSync(new URL(name, DATA), 'utf8'));

interface StaticRow {
  name: string;
  district: string;
  cropsNow: number | null;
  cropsThen: number | null;
  winterNdvi: number | null;
  boroIrrigationMm: number | null;
  groundwaterMmPerYear: number | null;
  boroToMovePct: number | null;
  pesticideRice: [number, number] | null;
  pesticideOther: [number, number] | null;
  organicMatter: string | null;
  ph: string | null;
  /** Days of 36 C or more in March-May, nights of 10 C or less in December-February (a year, 2001-2025). */
  springHotDays: number | null;
  winterColdNights: number | null;
  /** Days of 23 mm or more of rain in April-June, when fields stand bare between the winter crop and Aman. */
  preMonsoonErosiveDays: number | null;
  /** NASA POWER root-zone wetness (0-1) in January-April, when Rabi crops and Boro draw on the soil. */
  dryRootWet: number | null;
  /** The yearly hot days' Theil-Sen slope per decade, only where the Mann-Kendall p is below 0.05; else null. */
  hotTrendPerDecade: number | null;
}

let fixed: { rows: Record<string, StaticRow>; sources: Record<string, string> } | null = null;

function staticRows() {
  if (fixed) return fixed;
  const national = read('national_replay.json');
  const green = read('greenness_upazila.json');
  const atlas = read('soil_atlas.json');
  const pest = read('pesticide_load.json');
  const budget = read('groundwater_budget.json');
  const calendar = read('season_calendar.json');
  const sum = (arr: number[] | undefined, months: number[]) => (arr ? Math.round(months.reduce((a, m) => a + arr[m], 0) * 10) / 10 : null);
  const mean = (arr: number[] | undefined, months: number[]) => (arr ? Math.round(months.reduce((a, m) => a + arr[m], 0) / months.length * 100) / 100 : null);
  const rows: Record<string, StaticRow> = {};
  for (const u of national.upazilas as Array<{ id: string; name: string; district: string }>) {
    const d = national.districts[u.district];
    const g = green.upazilas[u.id];
    const s = atlas.classes[u.id];
    const p = pest.upazilas[u.id] ?? {};
    const c = calendar.places[u.district];
    const hotTrend = c?.trend?.hotDays;
    rows[u.id] = {
      name: u.name,
      district: u.district,
      cropsNow: g?.recent?.cyclesPerYear ?? null,
      cropsThen: g?.early?.cyclesPerYear ?? null,
      winterNdvi: g?.recent?.peakNdvi ?? null,
      boroIrrigationMm: d?.rabi?.['BRRI dhan28']?.netIrrigationMm ?? null,
      groundwaterMmPerYear: d?.conditions?.groundwater?.trendMmPerYear ?? null,
      boroToMovePct: budget.districts[u.district]?.applies && budget.districts[u.district].moveShareToLentil != null
        ? Math.round(budget.districts[u.district].moveShareToLentil * 1000) / 10 : null,
      pesticideRice: p.rice ?? null,
      pesticideOther: p.other ?? null,
      organicMatter: s?.organicMatter ?? null,
      ph: s?.ph ?? null,
      springHotDays: sum(c?.months?.hotDays, [2, 3, 4]),
      winterColdNights: sum(c?.months?.coldNights, [11, 0, 1]),
      preMonsoonErosiveDays: sum(c?.months?.erosiveRainDays, [3, 4, 5]),
      dryRootWet: mean(c?.months?.rootWet, [0, 1, 2, 3]),
      hotTrendPerDecade: hotTrend && hotTrend.p < 0.05 ? hotTrend.slopePerDecade : null,
    };
  }
  fixed = {
    rows,
    sources: {
      crops: `${green.source}; ${green.upazilas[national.upazilas[0].id]?.early?.years ?? ''} against ${green.upazilas[national.upazilas[0].id]?.recent?.years ?? ''}`,
      water: 'NASA POWER + GPM IMERG 25-season replay at the district point (FAO-56); GLDAS-2.2 GRACE-assimilated groundwater, 2003-2025',
      pesticide: `${pest.source.name}, ${pest.source.year}: ${pest.source.units}. ${pest.source.caution}`,
      cropLoss: "NASA HLS (Landsat and Sentinel-2): the share of last year's Aman land not green this year in the same weeks",
      flood: 'NASA OPERA DSWx-HLS (Landsat and Sentinel-2) or NASA-ISRO NISAR radar, whichever is newer: water now on land normally dry in winter (not water in both December 2025 and February 2026), of the land seen',
      field: "Paddy water from NASA GPM IMERG rain and POWER evapotranspiration (the replay's water balance); heat and cold from NASA POWER and Open-Meteo's 7-day forecast (a weather model, not NASA)",
      soil: atlas.source,
      risk: `${calendar.source}; seasons ${calendar.seasons} (research/explore/season_calendar.py)`,
    },
  };
  return fixed;
}

let grows: Record<string, { aman: boolean; boro: boolean; wheat: boolean }> | null = null;
/** Which of the alert crops each upazila grows, from BRRI's cropping patterns (all three where the survey has none). */
function cropsGrown() {
  if (grows) return grows;
  const profile = read('upazila_profile.json');
  grows = {};
  for (const [id, u] of Object.entries<any>(profile.upazilas)) {
    const pats: string[] = (u.patterns ?? []).map((p: [string, number]) => p[0]);
    const any = (re: RegExp) => !pats.length || pats.some(p => re.test(p));
    grows[id] = { aman: u.land?.type !== 'low' && any(/Aman/), boro: any(/Boro/), wheat: pats.some(p => /Wheat/.test(p)) };
  }
  return grows;
}

/** This week's field alerts for one upazila on the usual calendar. */
function fieldNow(id: string, field: any, today: string): FieldAlert[] {
  const g = cropsGrown()[id] ?? { aman: true, boro: true, wheat: false };
  const boro = LOC.rabi['BRRI dhan28'];
  const wheat = LOC.rabi['BARI Gom 33 (Early)'];
  const base: FieldCrops = {
    boro: g.boro && boro ? { variety: 'BRRI dhan28', varietyBangla: 'ব্রি ধান২৮', transplant: boro.sowing, harvest: boro.harvest } : null,
    wheat: g.wheat && wheat ? { sowing: wheat.sowing, harvest: wheat.harvest } : null,
    boroSeedbed: g.boro,
  };
  const out = fieldAlerts(today, base, field);
  if (g.aman) {
    for (const [variety, a] of Object.entries(LOC.aman)) {
      out.push(...fieldAlerts(today, { aman: { variety, varietyBangla: AMAN_CATALOG[variety]?.varietyBangla ?? variety, flowering: a.flowering } }, field));
    }
  }
  return out;
}

/**
 * Where to check first for flood and crop damage: upazilas where last year's Aman land is not green this year (NASA
 * HLS, research/live/crop_loss.py), or with water now on land normally dry in winter (NASA OPERA DSWx-HLS). The most
 * Aman land not green comes first, then the most water above the same weeks of 2025. Each row carries the share of
 * the land that grew Aman, the same weeks of 2025 by OPERA radar and when 80% of the 2025 monsoon water had drained.
 * A list for officers to send field checks: greenness is not yield.
 */
export function floodCheckList(minShare = 0.10, minLoss = 0.10) {
  const { rows } = staticRows();
  const profile = read('upazila_profile.json');
  const out = [];
  for (const [id, r] of Object.entries(rows)) {
    const fl = floodFor(id);
    const loss = cropLossFor(id);
    const flooded = fl && typeof fl.floodShare === 'number' && fl.floodShare >= minShare;
    const lost = loss && typeof loss.notGreenShare === 'number' && loss.notGreenShare >= minLoss;
    if (!flooded && !lost) continue;
    const p = profile.upazilas[id] ?? {};
    const hls = p.hls ? p.hls[Object.keys(p.hls).sort().reverse()[0]] : null;
    out.push({
      id, name: r.name, district: r.district, date: fl?.date ?? null, sensor: fl?.sensor ?? null,
      floodSharePct: fl && typeof fl.floodShare === 'number' ? Math.round(fl.floodShare * 100) : null,
      drainPerWeekPct: typeof fl?.drain?.perWeek === 'number' ? Math.round(fl.drain.perWeek * 100) : null,
      freeBy: fl?.drain?.freeBy ?? null,
      seenSharePct: fl ? Math.round(fl.seenShare * 100) : null,
      lastYearRadarPct: typeof fl?.lastYearRadar === 'number' ? Math.round(fl.lastYearRadar * 100) : null,
      amanNotGreenPct: typeof loss?.notGreenShare === 'number' ? Math.round(loss.notGreenShare * 100) : null,
      amanUnderWaterPct: typeof loss?.waterShare === 'number' ? Math.round(loss.waterShare * 100) : null,
      amanWeakerPct: typeof loss?.weakerShare === 'number' ? Math.round(loss.weakerShare * 100) : null,
      amanLandSharePct: typeof hls?.amanLandShare === 'number' ? Math.round(hls.amanLandShare * 100) : null,
      drained80In2025: p.opera?.drained80 ?? null,
    });
  }
  // Aman land not green first, then unusual water: above last year's radar figure (which reads higher than optical)
  const excess = (u: { floodSharePct: number | null; lastYearRadarPct: number | null }) => (u.floodSharePct ?? 0) - (u.lastYearRadarPct ?? 0);
  return out.sort((a, b) => (b.amanNotGreenPct ?? 0) - (a.amanNotGreenPct ?? 0) || excess(b) - excess(a));
}

let yearly: ReturnType<typeof buildYears> | null = null;

function buildYears() {
  const calendar = read('season_calendar.json');
  const districts: Record<string, Record<string, Array<number | null>>> = {};
  for (const [name, place] of Object.entries<any>(calendar.places)) {
    if (name !== 'talanda_tanore') districts[name] = place.years;
  }
  const upazilas: Record<string, number[] | null> = {};
  for (const [id, g] of Object.entries<any>(calendar.greenness.upazilas)) upazilas[id] = g.cropsByYear ?? null;
  return {
    years: calendar.years as number[],
    districts,
    upazilaCropsByYear: upazilas,
    sources: {
      climate: `${calendar.source}; one value a year at each district point`,
      groundwater: calendar.groundwaterSource,
      crops: `${calendar.greenness.product}; growth peaks of the smoothed NDVI per agricultural year (November-October), as research/explore/national_greenness.py`,
    },
  };
}

/**
 * Year by year for the map's time slider (research/explore/season_calendar.py): at each district point the days of
 * 36 C or more, the days of 44 mm or more of rain, the dry season's root-zone wetness and NASA GLDAS-2.2
 * (GRACE-assimilated) groundwater against 2003-2007; at each upazila centre the crops a year MODIS counts.
 */
export function mapYears() {
  yearly ??= buildYears();
  return yearly;
}

/** Every upazila with its map values; `live` is today's NASA update (null before the first run). */
export function mapLayers() {
  const { rows, sources } = staticRows();
  const live = liveUpazilas() ?? [];
  const fields = liveFields();
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(live.map(r => [r.id, r]));
  const status = liveStatus();
  return {
    generatedAt: new Date().toISOString(),
    liveDate: status?.sources?.find((s: any) => s.id === 'power')?.latestDate ?? null,
    sources: { ...sources, live: status ? `NASA POWER daily, ${status.normalYears} normal; GPM IMERG ${status.sources?.find((s: any) => s.id === 'imerg')?.latestDate ?? 'not available'}` : 'not run yet' },
    upazilas: Object.fromEntries(Object.entries(rows).map(([id, r]) => {
      const l = byId.get(id);
      return [id, {
        ...r,
        rainPctOfNormal: l?.rain30PctOfNormal ?? null,
        rainStatus: l?.rainStatus ?? null,
        soilStatus: l?.soilStatus ?? null,
        hotDays7: l?.hotDays7 ?? null,
        rain7: l?.rain7 ?? null,
        blastDays7: l?.blastDays7 ?? null,
        blastStatus: l?.blastStatus ?? null,
        lateBlightDays7: l?.lateBlightDays7 ?? null,
        lateBlightStatus: l?.lateBlightStatus ?? null,
        ...fieldRow(id, fields.get(id), today),
      }];
    })),
  };
}

/** The field-alert values the map colours by: the most serious level of each rule, and the paddy's water. */
function fieldRow(id: string, field: any, today: string) {
  const fl = floodFor(id);
  const floodSharePct = fl && typeof fl.floodShare === 'number' ? Math.round(fl.floodShare * 100) : null;
  const loss = cropLossFor(id);
  const amanNotGreenPct = typeof loss?.notGreenShare === 'number' ? Math.round(loss.notGreenShare * 100) : null;
  if (!field) return { amanDryStatus: null, riceHeatStatus: null, coldStatus: null, wheatHeatStatus: null, paddyWaterMm: null, floodSharePct, amanNotGreenPct };
  const alerts = fieldNow(id, field, today);
  return {
    amanDryStatus: worstLevel(alerts, 'aman_dry_spell') ?? 'none',
    riceHeatStatus: worstLevel(alerts, 'rice_heat') ?? 'none',
    coldStatus: worstLevel(alerts, 'cold_seedbed') ?? 'none',
    wheatHeatStatus: worstLevel(alerts, 'wheat_heat') ?? 'none',
    paddyWaterMm: field.paddyWaterMm ?? null,
    forecastRain7: field.forecast ? Math.round(field.forecast.rain.reduce((a: number, b: number | null) => a + (b ?? 0), 0)) : null,
    floodSharePct,
    amanNotGreenPct,
  };
}
