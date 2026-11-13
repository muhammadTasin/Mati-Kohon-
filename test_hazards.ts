// NASA EONET summary (services/api/src/hazards.ts): distance to Bangladesh, the watch rule, and no network in OFFLINE mode.
import assert from 'node:assert/strict';
import { getHazards, kmFromBangladesh, summarizeEonet } from './services/api/src/hazards.ts';

assert.equal(kmFromBangladesh(90.4, 23.8), 0, 'Dhaka is inside');
const bay = kmFromBangladesh(90.0, 19.0);
assert.ok(bay > 250 && bay < 350, `a storm at 19N 90E is about 300 km off the coast (${bay})`);

const raw = { events: [
  { id: 'A', title: 'Tropical Cyclone Murasu', closed: '2026-11-08T00:00:00Z', categories: [{ id: 'severeStorms' }], geometry: [{ type: 'Point', date: '2026-11-03T06:00:00Z', coordinates: [80.2, 15.8] }] },
  { id: 'B', title: 'Tropical Cyclone Test', closed: null, categories: [{ id: 'severeStorms' }], geometry: [{ type: 'Point', date: '2026-11-12T00:00:00Z', coordinates: [88.0, 16.0] }, { type: 'Point', date: '2026-11-13T00:00:00Z', coordinates: [89.5, 18.5] }] },
  { id: 'C', title: 'Flood in Myanmar', closed: '2026-11-11T00:00:00Z', categories: [{ id: 'floods' }], geometry: [{ type: 'Polygon', date: '2026-11-09T20:00:00Z', coordinates: [[[94, 20], [95, 20], [95, 21], [94, 21], [94, 20]]] }] },
  { id: 'D', title: 'no geometry', categories: [{ id: 'floods' }], geometry: [] },
] };
const { events, watch } = summarizeEonet(raw);
assert.equal(events.length, 3, 'events without a position are dropped');
assert.equal(events[0].id, 'B', 'open events come first');
assert.equal(events[0].lastSeen, '2026-11-13', 'the newest position is used');
assert.equal(events[0].kind, 'cyclone');
assert.equal(watch?.id, 'B', 'an open cyclone within 800 km is the watch');
assert.equal(events.find(e => e.id === 'A')!.level, 'region');
assert.equal(events.find(e => e.id === 'C')!.kind, 'flood');
assert.equal(summarizeEonet({ events: [{ ...raw.events[2], title: 'Flood in Bhutan 1104265' }] }).events[0].title, 'Flood in Bhutan', 'the source id is trimmed');
assert.equal(summarizeEonet({ events: [raw.events[0]] }).watch, null, 'a closed far cyclone is not a watch');
assert.deepEqual(summarizeEonet(null), { events: [], watch: null });

process.env.OFFLINE = '1';
let asked = 0;
const off = await getHazards((async () => { asked++; throw new Error('no'); }) as any);
assert.equal(asked, 0, 'OFFLINE makes no request');
assert.equal(off.unavailable, 'offline_mode');
delete process.env.OFFLINE;
const down = await getHazards((async () => { throw new Error('down'); }) as any);
assert.equal(down.unavailable, 'network_error');
assert.deepEqual(down.events, []);
const up = await getHazards((async () => ({ ok: true, json: async () => raw })) as any);
assert.equal(up.watch?.id, 'B');
console.log('✓ NASA EONET: distance to Bangladesh, open-first order, the watch rule, offline and network failure handled.');
