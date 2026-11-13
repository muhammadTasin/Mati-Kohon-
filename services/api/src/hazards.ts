/**
 * NASA EONET, the Earth Observatory Natural Event Tracker (one of the APIs listed on api.nasa.gov): the cyclones,
 * floods and fires NASA is tracking around Bangladesh. The officer sees them above the day's call list, so a cyclone
 * in the Bay during the aman harvest is not missed.
 *
 * Read-only and advisory: it never adds or changes a call by itself. The Bangladesh Meteorological Department gives
 * the official warnings; this only says what NASA's tracker shows and how far it is from the country.
 * No key is needed. OFFLINE=1 makes no request.
 */
import { nasaConfig } from './config.ts';

export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';
/** west, north, east, south: Bangladesh, the Bay of Bengal and the river basins upstream */
const BBOX = '80,30,100,5';
const WINDOW_DAYS = 21;
const TTL_MS = 60 * 60 * 1000;
/** an open event this close (km) is shown as a watch */
const NEAR_KM = 400;
const CYCLONE_WATCH_KM = 800;

/** Bangladesh's outline as a rough ring (lon, lat): enough to say "about 300 km from the coast", not a border. */
const BD_RING: Array<[number, number]> = [
  [89.0, 21.7], [89.6, 21.8], [90.2, 21.8], [90.7, 22.0], [91.1, 22.5], [91.8, 22.3], [92.0, 21.4], [92.3, 20.75],
  [92.6, 21.6], [92.6, 22.9], [92.0, 23.6], [91.4, 23.9], [91.9, 24.4], [92.5, 24.9], [91.2, 25.2], [90.4, 25.2],
  [89.8, 25.9], [88.5, 26.6], [88.1, 25.6], [88.2, 24.6], [88.8, 23.2],
];

export type HazardKind = 'cyclone' | 'flood' | 'fire' | 'other';
export interface HazardEvent {
  id: string;
  title: string;
  kind: HazardKind;
  open: boolean;
  /** the date of the newest position or footprint (YYYY-MM-DD) */
  lastSeen: string;
  /** EONET's close date when the event is over */
  closed: string | null;
  lat: number;
  lon: number;
  /** 0 when the newest position is inside Bangladesh */
  kmFromBangladesh: number;
  level: 'inside' | 'near' | 'region';
  link: string;
}
export interface HazardsResponse {
  source: 'NASA EONET';
  sourceUrl: string;
  windowDays: number;
  fetchedAt: string | null;
  /** the open event the officer should look at first, if any */
  watch: HazardEvent | null;
  events: HazardEvent[];
  /** set when EONET could not be reached; events then come from the last good answer, if there is one */
  unavailable?: 'offline_mode' | 'network_error' | 'http_error';
}

const KIND: Record<string, HazardKind> = { severeStorms: 'cyclone', floods: 'flood', wildfires: 'fire' };

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
function insideBangladesh(lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = BD_RING.length - 1; i < BD_RING.length; j = i++) {
    const [xi, yi] = BD_RING[i], [xj, yj] = BD_RING[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Distance from a point to the outline, sampling each edge ten times. */
export function kmFromBangladesh(lon: number, lat: number): number {
  if (insideBangladesh(lon, lat)) return 0;
  let best = Infinity;
  for (let i = 0; i < BD_RING.length; i++) {
    const [x1, y1] = BD_RING[i], [x2, y2] = BD_RING[(i + 1) % BD_RING.length];
    for (let s = 0; s <= 10; s++) best = Math.min(best, haversineKm(lon, lat, x1 + ((x2 - x1) * s) / 10, y1 + ((y2 - y1) * s) / 10));
  }
  return Math.round(best);
}

/** EONET's raw answer -> the events the officer sees, nearest open ones first. Pure, so it is tested without network. */
export function summarizeEonet(raw: any): { events: HazardEvent[]; watch: HazardEvent | null } {
  const events: HazardEvent[] = [];
  for (const e of Array.isArray(raw?.events) ? raw.events : []) {
    const geo = Array.isArray(e.geometry) ? e.geometry[e.geometry.length - 1] : null;
    if (!geo) continue;
    // a point (a storm's position) or a polygon (a flood's footprint): use the point, or the footprint's nearest corner
    let pts: Array<[number, number]> = [];
    if (geo.type === 'Point') pts = [geo.coordinates];
    else if (geo.type === 'Polygon') pts = geo.coordinates?.[0] ?? [];
    pts = pts.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length) continue;
    let km = Infinity, at = pts[0];
    for (const p of pts) { const d = kmFromBangladesh(p[0], p[1]); if (d < km) { km = d; at = p; } }
    const open = !e.closed;
    events.push({
      id: String(e.id),
      title: String(e.title).replace(/\s+\d{5,}$/, ''), // floods carry a source id: "Flood in Bhutan 1104265"
      kind: KIND[e.categories?.[0]?.id] ?? 'other',
      open,
      lastSeen: String(geo.date ?? '').slice(0, 10),
      closed: e.closed ? String(e.closed).slice(0, 10) : null,
      lat: Math.round(at[1] * 100) / 100,
      lon: Math.round(at[0] * 100) / 100,
      kmFromBangladesh: km,
      level: km === 0 ? 'inside' : km <= NEAR_KM ? 'near' : 'region',
      link: typeof e.link === 'string' ? e.link : `${EONET_URL}/${e.id}`,
    });
  }
  events.sort((a, b) => Number(b.open) - Number(a.open) || a.kmFromBangladesh - b.kmFromBangladesh || b.lastSeen.localeCompare(a.lastSeen));
  const watch = events.find(e => e.open && (e.level !== 'region' || (e.kind === 'cyclone' && e.kmFromBangladesh <= CYCLONE_WATCH_KM))) ?? null;
  return { events: events.slice(0, 8), watch };
}

let last: { at: number; value: HazardsResponse } | null = null;

export async function getHazards(fetchImpl: typeof fetch = fetch): Promise<HazardsResponse> {
  if (last && Date.now() - last.at < TTL_MS) return last.value;
  const base = { source: 'NASA EONET' as const, sourceUrl: 'https://eonet.gsfc.nasa.gov/', windowDays: WINDOW_DAYS };
  const fallback = (why: HazardsResponse['unavailable']): HazardsResponse =>
    last ? { ...last.value, unavailable: why } : { ...base, fetchedAt: null, watch: null, events: [], unavailable: why };
  if (nasaConfig().offline) return fallback('offline_mode');

  const url = `${EONET_URL}?bbox=${BBOX}&days=${WINDOW_DAYS}&status=all&category=severeStorms,floods,wildfires`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return fallback('http_error');
    const value: HazardsResponse = { ...base, fetchedAt: new Date().toISOString(), ...summarizeEonet(await res.json()) };
    last = { at: Date.now(), value };
    return value;
  } catch {
    return fallback('network_error');
  } finally {
    clearTimeout(timeout);
  }
}
