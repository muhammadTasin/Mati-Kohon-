/** Internal, deterministic input interventions. Never accept these controls from an HTTP body. */
import { LOC, type Place } from './data/location.ts';
import type { RabiRecord } from './data/release_types.ts';

export interface ModelExperiment {
  amanDelayDays?: number;
  winterDurationDays?: number;
  initialSoilWaterMm?: number;
  extraIrrigationCostBdtM3?: number;
  extraCropCostBdtHa?: number;
  salinityMultiplier?: number;
  without?: 'gldas' | 'smap' | 'imerg_flood' | 'opera' | 'srdi_salinity';
  calendarOnly?: boolean;
  skipAnalysis?: boolean;
}
export const shiftDate = (md: string, days: number) => {
  const [m, d] = md.split('-').map(Number);
  return new Date(Date.UTC(2001, m - 1, d + days)).toISOString().slice(5, 10);
};
export function experimentalPlace(place: Place, experiment: ModelExperiment): Place {
  const p = structuredClone(place);
  p.conditions.experiment = experiment;
  const delay = experiment.amanDelayDays ?? 0;
  if (delay) for (const a of Object.values(p.aman)) {
    for (const k of ['flowering', 'maturity', 'fieldFree']) a[k] = shiftDate(a[k], delay);
    a.durationDays = a.durationDays.map((n: number) => n + delay);
    a.fieldDays += delay;
  }
  if (experiment.without === 'gldas' || experiment.calendarOnly) p.conditions.groundwater = null;
  if (experiment.without === 'opera' || experiment.calendarOnly) {
    p.local.opera = null;
    if (p.conditions.current) p.conditions.current.flood = null;
  }
  if (experiment.without === 'smap' || experiment.calendarOnly) {
    if (p.conditions.current) p.conditions.current = { ...p.conditions.current, dryStart: false, soilStatus: 'unknown', soilPercentile: null, soilRank: null };
  }
  if (experiment.without === 'srdi_salinity' || experiment.calendarOnly) p.local.salinity = null;
  return p;
}
export function stressRecord(record: RabiRecord | undefined, rice: boolean, winter = true): RabiRecord | undefined {
  if (!record) return record;
  if (!winter) return record;
  const e: ModelExperiment = LOC.conditions.experiment ?? {};
  const duration = e.winterDurationDays ?? 0;
  const soil = !rice && e.initialSoilWaterMm !== undefined ? 50 - e.initialSoilWaterMm : 0;
  if (!duration && !soil) return record;
  // First-order stress calculation, not a new daily weather replay. Soil storage changes the water balance in mm.
  const extraUse = duration * record.cropWaterUseMm / record.fieldDays;
  const extra = extraUse + soil + (rice ? 2 * duration : 0);
  const mm = Math.max(0, Math.round(record.netIrrigationMm + extra));
  return { ...record, harvest: shiftDate(record.harvest, duration), fieldDays: record.fieldDays + duration,
    cropWaterUseMm: Math.max(0, Math.round(record.cropWaterUseMm + extraUse)), netIrrigationMm: mm,
    pumpedM3PerHa: mm * 10, netIrrigationRangeMm: record.netIrrigationRangeMm.map(v => Math.max(0, Math.round(v + extra))) as [number, number] };
}
