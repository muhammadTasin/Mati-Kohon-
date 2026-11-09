import type { AdviceJSON } from '@project-eden/contracts';
import type { PlanOptionsRequest } from './engine.ts';
type Conditions = NonNullable<PlanOptionsRequest['currentConditions']>;

/** Operational cutoffs, not sensor accuracy estimates. Historical replay is unaffected. */
export const MAX_INPUT_AGE_DAYS = { soil: 7, disease: 7, field: 2, flood: 21 } as const;
const dayValue = (date: unknown): number | null => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : null;
};
export function ageDays(date: unknown, today = new Date().toISOString().slice(0, 10)): number | null {
  const at = dayValue(date), now = dayValue(today);
  return at === null || now === null ? null : Math.floor((now - at) / 86_400_000);
}
export function recentInput(date: unknown, maxDays: number, today?: string): boolean {
  const age = ageDays(date, today);
  return age !== null && age >= 0 && age <= maxDays;
}

/** Shared by the engine and the public map so old field snapshots cannot issue current actions. */
export function screenFieldWeather(input: Conditions['field'], today = new Date().toISOString().slice(0, 10)) {
  const excluded: AdviceJSON['stale_or_missing_inputs'] = [];
  let field = input ? { ...input } : null;
  if (field && !recentInput(field.through, MAX_INPUT_AGE_DAYS.field, today)) {
    excluded.push({ dataset: 'Field weather', issue: 'Field conditions dated ' + field.through + ' excluded: require a valid date within 2 days, not in the future, as of ' + today + '.', affectedDimension: 'all' });
    field = null;
  }
  if (field?.forecast) {
    const ahead = ageDays(field.forecast.from, today);
    if (ahead !== 0 && ahead !== -1) {
      excluded.push({ dataset: 'Field forecast', issue: 'Forecast does not start today or tomorrow; forecast instructions excluded.', affectedDimension: 'all' });
      field.forecast = null;
    }
  }
  if (field && !field.forecast) field.paddyDryNext7 = null;
  return { field, excluded };
}

/** Validate each source separately: fresh SMAP cannot make old rain, weather or flood data fresh. */
export function screenConditions(input: Conditions | undefined, today: string) {
  const excluded: AdviceJSON['stale_or_missing_inputs'] = [];
  if (!input) return { conditions: undefined, excluded };
  const check = (date: unknown, days: number, dataset: string, affectedDimension: string) => {
    const ok = recentInput(date, days, today);
    if (!ok) excluded.push({ dataset, issue: 'Observation ' + String(date ?? 'undated') + ' excluded from current advice: must be dated, not future, and at most ' + days + ' days old as of ' + today + '.', affectedDimension });
    return ok;
  };
  const soilFresh = check(input.date, MAX_INPUT_AGE_DAYS.soil, (input.sensor ?? 'POWER') + ' soil conditions', 'water');
  const rainFresh = check(input.rainDate ?? input.date, MAX_INPUT_AGE_DAYS.soil, 'Recent rain', 'water');
  const disease = input.disease && check(input.disease.date, MAX_INPUT_AGE_DAYS.disease, 'Disease weather', 'pest') ? input.disease : null;
  const { field, excluded: fieldExcluded } = screenFieldWeather(input.field, today);
  excluded.push(...fieldExcluded);
  let flood = input.flood && check(input.flood.date, MAX_INPUT_AGE_DAYS.flood, 'Flood extent', 'flood') ? { ...input.flood } : null;
  if (flood?.drain && !check(flood.drain.to?.date, MAX_INPUT_AGE_DAYS.flood, 'Flood recession', 'flood')) flood.drain = null;
  if (flood?.drain && flood.drain.from?.sensor !== flood.drain.to?.sensor) {
    flood.drain = null;
    excluded.push({ dataset: 'Flood recession', issue: 'Mixed-sensor recession slope excluded; require observations from the same sensor.', affectedDimension: 'flood' });
  }
  if (flood?.drain?.dateRange) {
    const range = flood.drain.dateRange;
    const start = Array.isArray(range) && range.length === 2 ? ageDays(range[0], today) : null;
    const end = Array.isArray(range) && range.length === 2 ? ageDays(range[1], today) : null;
    if (start === null || end === null || start < end || start > 0 || end < -45) {
      flood.drain = { ...flood.drain, dateRange: null };
      excluded.push({ dataset: 'Flood recession range', issue: 'Invalid or expired range excluded: require ordered valid dates between today and 45 days ahead.', affectedDimension: 'flood' });
    }
  }
  const conditions: Conditions | undefined = soilFresh || disease || field || flood ? {
    ...input, soilStatus: soilFresh ? input.soilStatus : 'unknown',
    soilRank: soilFresh ? input.soilRank : undefined, soilYears: soilFresh ? input.soilYears : undefined,
    soilPercentile: soilFresh ? input.soilPercentile : undefined,
    rain30PctOfNormal: rainFresh ? input.rain30PctOfNormal : null,
    disease, field, flood,
  } : undefined;
  return { conditions, excluded };
}
