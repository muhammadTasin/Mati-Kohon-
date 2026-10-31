import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.env.TEST_PORT || '4317';
const BASE = `http://localhost:${PORT}`;
// The officer desk writes to a throwaway store so tests never touch the demo data
const STORE = path.join(os.tmpdir(), `eden-officer-test-${process.pid}.json`);
const CALL_STORE = path.join(os.tmpdir(), `eden-calls-test-${process.pid}.json`);
const CATTLE_STORE = path.join(os.tmpdir(), `eden-cattle-test-${process.pid}.json`);
// A NISAR radar flood reading three days old, written fresh each run (readings older than 21 days are not used)
const NISAR = path.join(os.tmpdir(), `eden-nisar-test-${process.pid}.json`);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
fs.writeFileSync(NISAR, JSON.stringify({ source: 'test', made: new Date().toISOString(), window: [daysAgo(12), daysAgo(0)], passes: { found: 2, read: 2 },
  thresholds: { hhWaterDb: -10 }, summary: { upazilas: 1, withFloodShare: 1, floodAtLeast10pct: 1, floodAtLeast25pct: 1, draining: 1 },
  upazilas: { ADM3_Barhatta: { date: daysAgo(3), seenShare: 0.9, floodShare: 0.3, waterNow: 0.45, waterDry: 0.2, lastYearRadar: 0.01, sensor: 'nisar',
    drain: { from: { date: daysAgo(20), floodShare: 0.45, sensor: 'opera' }, to: { date: daysAgo(3), floodShare: 0.3, sensor: 'nisar' }, perWeek: 0.062, freeBy: daysAgo(-30) } } } }));
// The demo officer login exists only with DEMO_MODE=true and a code; the tests make up a fresh code every run
const OFFICER_CODE = crypto.randomBytes(12).toString('hex');
// A stand-in for the Supabase Auth server (GET /auth/v1/user), so the manager routes can be tested over HTTP without a project:
// 'mgr-token' is a manager, 'viewer-token' a signed-in user whose app_metadata.role is not manager, anything else is invalid.
const FAKE_USERS = {
  'mgr-token': { id: 'u-manager', email: 'sentry@example.test', app_metadata: { role: 'manager', site: 'talanda' }, user_metadata: {} },
  // JWT-shaped tokens (three parts) for the site-scoped routes: a manager of talanda, a manager of another site, a manager with no site
  'h.talanda.s': { id: 'u-talanda', email: 'sentry@example.test', app_metadata: { role: 'manager', site: 'talanda' }, user_metadata: {} },
  'h.other.s': { id: 'u-other', email: 'other@example.test', app_metadata: { role: 'manager', site: 'sun_dharmapasha' }, user_metadata: { site: 'talanda' } },
  'h.upper.s': { id: 'u-upper', email: 'upper@example.test', app_metadata: { role: 'manager', site: 'Talanda' }, user_metadata: {} },
  'h.alias.s': { id: 'u-alias', email: 'alias@example.test', app_metadata: { role: 'manager', site: ' tanore ' }, user_metadata: {} },
  'h.viewer.s': { id: 'u-viewer2', email: 'viewer2@example.test', app_metadata: { role: 'viewer', site: 'talanda' }, user_metadata: { role: 'manager' } },
  'h.nosite.s': { id: 'u-nosite', email: 'nosite@example.test', app_metadata: { role: 'manager' }, user_metadata: { site: 'talanda' } },
  'viewer-token': { id: 'u-viewer', email: 'viewer@example.test', app_metadata: { role: 'viewer' }, user_metadata: { role: 'manager' } },
};
const fakeSupabase = http.createServer((req, res) => {
  const user = FAKE_USERS[(req.headers.authorization || '').replace(/^Bearer\s+/i, '')];
  res.writeHead(user ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(user ?? { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }));
});
await new Promise((resolve) => fakeSupabase.listen(0, '127.0.0.1', resolve));
const FAKE_SUPABASE_URL = `http://127.0.0.1:${fakeSupabase.address().port}`;
// Made-up credentials for the data-sources test: none of these strings may ever appear in an API response
const FAKE_SECRETS = {
  EARTHDATA_USERNAME: 'fake-edl-user-7q1', EARTHDATA_PASSWORD: 'fake-edl-pass-7q2', EARTHDATA_TOKEN: 'fake-edl-token-7q3',
  NASA_API_KEY: 'fake-nasa-key-7q4', ADS_API_TOKEN: 'fake-ads-token-7q5', FIRMS_MAP_KEY: 'fake-firms-key-7q6',
};
const serverProc = spawn('node', ['--experimental-strip-types', 'services/api/src/server.ts'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  // tests never place a real call, never reach an LLM or TTS service, and read a fixed day of NASA conditions
  // (the daily update rewrites the live file)
  env: { ...process.env, PORT, DEMO_MODE: 'true', EDEN_OFFICER_CODE: OFFICER_CODE, SUPABASE_URL: FAKE_SUPABASE_URL, SUPABASE_ANON_KEY: 'fake-anon-key', ...FAKE_SECRETS, OFFLINE: '1',
    EDEN_OFFICER_STORE: STORE, CATTLE_STORE_PATH: CATTLE_STORE, SEED_DEMO_DATA: 'false', LLM_BASE_URL: '', TTS_BASE_URL: '', GOOGLE_TTS_CREDENTIALS: '', SMS_LIVE: '0', SMS_API_KEY: '', AWAJ_VOICE_SOURCE: '',
    API_WRITE_TOKEN: '', AWAJ_LIVE: '0', CALL_PROVIDER: '', VOICEBLAST_LIVE: '0', BROADCAST_LIVE: '0', EDEN_LIVE_FILE: path.resolve('tests/fixtures/live_conditions_2026-10-01.json'), EDEN_FLOOD_FILE: path.resolve('tests/fixtures/no_flood_file.json'), EDEN_CROP_LOSS_FILE: path.resolve('tests/fixtures/crop_loss_fixture.json'),
    EDEN_NISAR_FILE: NISAR, EDEN_CALL_STORE: CALL_STORE, MISSED_CALL_KEY: 'test-missed-key', SMS_SECRET_KEY: '' },
});

serverProc.stdout.on('data', (d) => process.stdout.write(d));
serverProc.stderr.on('data', (d) => process.stderr.write(d));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/api/v1/overview`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start within 5 seconds');
}

async function run() {
  await waitForServer();
  console.log('\n--- TESTING HTTP ENDPOINTS ---');

  // 1. GET /api/v1/overview
  console.log('Testing GET /api/v1/overview ...');
  const resOverview = await fetch(`${BASE}/api/v1/overview`);
  const dataOverview = await resOverview.json();
  check(resOverview.status === 200, 'overview status');
  check(dataOverview.local_satellite_conditions.smap?.date, 'overview has a dated SMAP value');
  const warnings = dataOverview.early_warnings;
  check(warnings?.haor?.skill?.length && warnings.cattleHeat?.months?.length === 12 && warnings.warmNights?.dhan71, 'overview carries the early warnings');
  const haor = await (await fetch(`${BASE}/api/v1/haor/flash-flood`)).json();
  check(haor.seasons.length === 25 && haor.status?.state, 'the haor endpoint serves the 25-season hindcast and the current status');
  check(haor.live?.upstream?.length === 4 && haor.live.upstream[0].calibrated && haor.live.date, 'the haor endpoint carries the live upstream reading');
  console.log('✓ Overview status:', resOverview.status, 'Union:', dataOverview.scope.union, 'SMAP', dataOverview.local_satellite_conditions.smap.rootZoneM3M3, 'on', dataOverview.local_satellite_conditions.smap.date);

  // Daily NASA update: every upazila, with dated sources
  const live = await (await fetch(`${BASE}/api/v1/live/status`)).json();
  check(live.upazilas === 544 && live.districts === 64 && live.sources.find(s => s.id === 'power')?.latestDate, 'the daily NASA update covers all 544 upazilas');
  const tanoreLive = await (await fetch(`${BASE}/api/v1/live/upazila?name=Tanore`)).json();
  check(tanoreLive.district === 'Rajshahi' && typeof tanoreLive.power.soilRoot === 'number', 'an upazila carries its NASA POWER conditions');
  const nearLive = await (await fetch(`${BASE}/api/v1/live/upazila?lat=24.62&lon=88.56`)).json();
  check(nearLive.name === 'Tanore', `the nearest upazila to the Tanore pilot point is Tanore (got ${nearLive.name})`);
  check(['high', 'watch', 'low', 'off'].includes(tanoreLive.disease?.riceBlast?.status) && typeof tanoreLive.disease?.lateBlight?.days7 === 'number',
    'an upazila carries this week\'s rice-blast and late-blight weather');
  console.log('✓ Daily NASA update:', live.upazilas, 'upazilas; POWER', live.sources[0].latestDate, '; IMERG', live.sources[1].latestDate || 'not set');

  // Any upazila: the places list, advice from its district's replay, and the overview for it
  const places = await (await fetch(`${BASE}/api/v1/places`)).json();
  check(places.upazilas.length === 544, `every upazila is listed (got ${places.upazilas.length})`);
  const godagari = await (await fetch(`${BASE}/api/v1/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unionId: 'ADM3_Godagari' }) })).json();
  check(godagari.options?.length >= 5 && godagari.scope.union_id === 'ADM3_Godagari', 'an upazila outside the pilot gets ranked rotations');
  check(godagari.local_context?.landTypeAssumed === true && godagari.scope.land_type === godagari.local_context.landType
    && (godagari.options.some(o => o.currentPractice) || !godagari.local_context.patterns.some(p => p.pctOfCroppedLand >= 20)),
    'upazila advice carries its land type, its evidence and what farmers there grow now');
  // no SRDI soil card outside the pilot: the calendar stays, but no fertilizer amount and the plain message instead
  const NO_CARD_BN = 'এই এলাকার মাটির কার্ড (SRDI) যোগ করা হয়নি, সার-পরামর্শ দেওয়া যাচ্ছে না';
  check(godagari.farmer_card.season2.fertilizerBangla === NO_CARD_BN, 'the farmer card carries the no-soil-card message instead of doses');
  check(godagari.options.every(o => o.ledger.ureaKgHa === null && o.dimensionDetails.soil.metrics.rotationUreaKgHa === null && o.timeline.length > 0), 'no urea numbers outside the pilot, calendar kept');
  check(!/ureaKgHa":\s*[0-9]|tspKgHa":\s*[0-9]|mopKgHa":\s*[0-9]/.test(JSON.stringify(godagari)), 'no fertilizer dose number anywhere in the advice JSON');
  const talandaAdvice = await (await fetch(`${BASE}/api/v1/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unionId: 'talanda_tanore' }) })).json();
  check(talandaAdvice.options.every(o => typeof o.ledger.ureaKgHa === 'number') && !talandaAdvice.farmer_card.season2.fertilizerBangla.includes(NO_CARD_BN), 'the pilot still has its fertilizer numbers');
  const sylhetId = places.upazilas.find(u => u.district === 'Sylhet').id;
  const sylhet = await (await fetch(`${BASE}/api/v1/overview?place=${sylhetId}`)).json();
  check(sylhet.scope.district === 'Sylhet' && sylhet.aman_replay.length >= 5, 'the overview follows the chosen place');
  console.log('✓ Any upazila:', places.upazilas.length, 'places; Godagari top:', godagari.options[0].nameEnglish, '; Sylhet overview district:', sylhet.scope.district);

  // The farmer's own crops: the menu for a place, a spoken request answered, and the phone call (dry run)
  const menu = await (await fetch(`${BASE}/api/v1/crops?place=ADM3_Godagari`)).json();
  const sunflowerItem = menu.crops?.find(c => c.id === 'sunflower');
  check(menu.crops?.length >= 14 && sunflowerItem?.afterAman?.length && menu.keypad?.options?.length === 8, 'the crop menu lists the crops, where they fit, and the keypad menu');
  const voice = await (await fetch(`${BASE}/api/v1/voice/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unionId: 'ADM3_Godagari', text: 'আমি সূর্যমুখী আর মসুর করতে চাই' }) })).json();
  check(voice.understood.crops.join() === 'sunflower,lentil' && voice.advice.crop_choice?.fits.length === 2, 'a spoken request becomes a plan for those crops');
  check(voice.reply.speechBangla.includes('মাটি কহন') && !/[0-9~]/.test(voice.reply.speechBangla), 'the call script is speakable Bangla with Bangla digits');
  const callRes = await fetch(`${BASE}/api/v1/calls/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+8801700000000', unionId: 'ADM3_Godagari', preferredCrops: 'potato' }) });
  const call = await callRes.json();
  check(callRes.status === 200 && call.call.dryRun === true && call.call.request.language_code === 'bn-BD' && call.call.request.phone_numbers[0] === '01700000000', 'the Awaj call is a dry run with the bn-BD script');
  const sysRes = await fetch(`${BASE}/api/v1/calls/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '01700000000', unionId: 'ADM3_Godagari', via: 'voiceblast' }) });
  const sys = await sysRes.json();
  const blastRes = await (await fetch(`${BASE}/api/v1/calls/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '01700000000', unionId: 'ADM3_Godagari', via: 'broadcast' }) })).json();
  const callStatus = await (await fetch(`${BASE}/api/v1/calls/status`)).json();
  check(sysRes.status === 200 && sys.call.dryRun === true && sys.call.route === 'voiceblast' && sys.call.request.endpoint.endsWith('/customer/campaigns/demo-call') && sys.call.request.phone === '01700000000'
    && blastRes.call.dryRun === true && blastRes.call.request.arr_dst[0] === '8801700000000' && callStatus.adviceCallsVia === 'awaj' && callStatus.systech.voiceblast.live === false,
    'SysTech calls (VoiceBlast portal, Voice Broadcast API) are dry runs unless switched on, and Awaj stays the default');
  const hook = await (await fetch(`${BASE}/api/v1/calls/survey-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ survey_id: 1, metadata: { unionId: 'talanda_tanore' }, results: [{ phone_number: '01700000000', status: 'answered', response: '6', responses: ['6', '1'] }, { phone_number: '01800000000', status: 'not_answered' }] }) })).json();
  check(hook.handled.length === 1 && hook.handled[0].crops.join() === 'sunflower,lentil' && hook.handled[0].callBack.dryRun === true, 'keypad answers (6 = sunflower, 1 = lentil) trigger a planned call-back');
  const landHook = await (await fetch(`${BASE}/api/v1/calls/survey-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ survey_id: 2, metadata: { unionId: 'ADM3_Khaliajuri', landQuestion: true }, results: [{ phone_number: '01700000000', status: 'answered', responses: ['8', '4'] }] }) })).json();
  check(landHook.handled[0].crops.join() === 'boro' && landHook.handled[0].landType === 'low', 'with the land question the last key is the land (4 = water over a head = low land)');
  console.log('✓ Crop choice:', menu.crops.length, 'crops at Godagari; voice top:', voice.advice.options[0].nameEnglish, '; call dry run', call.reply.durationSecondsEstimate, 's');

  // Any main crop, and no rice when the farmer says so; soil-and-water tips; keypad calls; MODIS greenness everywhere
  const wheat = await (await fetch(`${BASE}/api/v1/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unionId: 'ADM3_Godagari', heroCrop: 'wheat', avoidCrops: ['rice'] }) })).json();
  const hasRice = (o) => o.cropSequence.some(p => p.seasonType === 'Aman' || p.seasonType === 'Aus' || p.crop === 'Boro rice');
  check(wheat.options.length && wheat.options.every(o => o.cropSequence.some(p => p.crop === 'Wheat') && !hasRice(o)), 'a wheat plan without rice holds wheat and no rice');
  check(wheat.options.every(o => (o.stewardship || []).some(t => t.kind === 'metals') && o.stewardship.some(t => t.kind === 'water')), 'every option carries soil-and-water tips');
  const spoken = await (await fetch(`${BASE}/api/v1/voice/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unionId: 'ADM3_Godagari', text: 'আমি ধান করতে চাই না, শুধু গম করব' }) })).json();
  check(spoken.understood.hero === 'wheat' && spoken.understood.excluded.includes('rice') && spoken.advice.crop_choice?.heroCrop === 'wheat' && !hasRice(spoken.advice.options[0]), 'a spoken "only wheat, no rice" plans wheat without rice');
  const keypad = await (await fetch(`${BASE}/api/v1/calls/keypad`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '01700000000', unionId: 'ADM3_Godagari' }) })).json();
  check(keypad.call.dryRun === true && keypad.menu.includes('চাপুন') && keypad.call.request.dtmf_options.length === 8, 'the keypad menu call is a dry run with eight crop keys');
  const gpl = await (await fetch(`${BASE}/api/v1/overview?place=ADM3_Godagari`)).json();
  check(gpl.context.winterGreenness?.recent?.cyclesPerYear !== undefined, 'every upazila has its MODIS winter greenness and crops a year');
  console.log('✓ Main crop without rice:', wheat.options[0].nameEnglish, '; Godagari crops a year', gpl.context.winterGreenness.early.cyclesPerYear, '->', gpl.context.winterGreenness.recent.cyclesPerYear);

  // The overview's map of Bangladesh: outlines for all 544 upazilas (sent gzipped) and one row of NASA values each
  const mapRows = await (await fetch(`${BASE}/api/v1/map/upazilas`)).json();
  const god = mapRows.upazilas.ADM3_Godagari;
  check(Object.keys(mapRows.upazilas).length === 544 && god.cropsNow !== undefined && god.boroIrrigationMm > 0 && god.pesticideRice?.length === 2 && god.organicMatter,
    'the map has 544 upazilas with MODIS, NASA replay, PEST-CHEMGRIDS and SRDI values');
  check(Object.values(mapRows.upazilas).filter(r => r.rainStatus).length > 500, "the map carries the daily NASA update's rain and soil status");
  check(god.springHotDays > 0 && god.winterColdNights >= 0 && god.preMonsoonErosiveDays > 0 && god.dryRootWet > 0 && god.dryRootWet < 1 && mapRows.sources.risk,
    'the map carries the season risks: spring heat, winter cold, soil-moving rain on bare fields and the dry-season root zone');

  // The 1 km cropland grid (research/grid/build.py): greenness against the trend, the summer gap, Boro thirst, the soil
  const levels = ['wellBelow', 'below', 'normal', 'above', 'wellAbove', 'unclear', 'noCrop'];
  const gridRows = Object.values(mapRows.upazilas).filter(r => levels.includes(r.condLevel));
  check(gridRows.length > 450 && mapRows.sources.fieldGrid?.includes('WorldCover'), 'most upazilas carry a cropland greenness level from the 1 km grid, with its sources');
  check(gridRows.every(r => r.condPct === null || (r.condPct >= 0 && r.condPct <= 100)) && Object.values(mapRows.upazilas).some(r => r.emptyDays > 0 && r.emptyFrom)
    && Object.values(mapRows.upazilas).some(r => r.boroThirstPct !== null) && god.soilAwcMm > 20 && god.soilTexture, 'the map carries the summer gap, Boro thirst and the soil');
  const dacope = await (await fetch(`${BASE}/api/v1/overview?place=ADM3_Dacope`)).json();
  const fc = dacope.field_conditions;
  check(fc?.row?.condition && fc.curve?.dates.length === fc.curve.ndvi.length && fc.curve.low.length === fc.curve.dates.length && fc.now?.composite,
    "an upazila's overview carries its fields from space with the chart's data");
  check(fc.notes.every(n => n.bn && n.en && ['alert', 'watch', 'good', 'info'].includes(n.tone)) && fc.notes.some(n => n.id === 'emptyField' && /mungbean|sesame/.test(n.en)),
    'the plain notes come in Bangla and English, and a coastal gap is filled with a summer crop that fits');
  check((await (await fetch(`${BASE}/api/v1/overview`)).json()).field_conditions?.id === 'ADM3_Tanore', "the Tanore pilot reads its upazila's cropland");
  const lessGreen = await (await fetch(`${BASE}/api/v1/conditions/check`)).json();
  check(lessGreen.upazilas.every(u => ['below', 'wellBelow'].includes(u.level) && u.croplandKm2 >= 20) && lessGreen.upazilas.every((u, i, a) => i === 0 || a[i - 1].percentile <= u.percentile),
    'the less-green check list holds only confident, below-expected upazilas with real cropland, least green first');
  const gridYears = await (await fetch(`${BASE}/api/v1/map/years`)).json();
  check(gridYears.upazilaCropsByYear.ADM3_Godagari?.length === gridYears.years.length && gridYears.sources.crops.includes('cropland'), "the time slider's crops a year come from the cropland");
  // 25 years of the same fields: the check's record on seasons with a known cause, and the haor's Boro against the flash floods
  check(/Koyra in 2009–2011/.test(lessGreen.record?.en) && /misses Birganj in 2017/.test(lessGreen.record?.en) && lessGreen.record.bn,
    'the check list says what the same check caught in past seasons (Cyclone Aila at Koyra) and what it missed');
  const koyra = await (await fetch(`${BASE}/api/v1/overview?place=ADM3_Koyra`)).json();
  check(koyra.field_conditions.row.amanRecord.weak[0][0] === 2009 && koyra.field_conditions.notes.some(n => n.id === 'amanRecord' && /2009/.test(n.en)),
    "an upazila's weakest Aman seasons are named, Koyra's worst after Cyclone Aila");
  const haorFc = (await (await fetch(`${BASE}/api/v1/overview?place=ADM3_Dharampasha`)).json()).field_conditions;
  const boroNote = haorFc.notes.find(n => n.id === 'boroFlood');
  check(/^04-/.test(haorFc.row.boroHarvest?.half) && boroNote && /In \d+ of 25 springs/.test(boroNote.en) && /2017/.test(boroNote.en) && boroNote.bn,
    "in the haor, when the Boro is usually cut, how often the upstream rain came first, and the spring the flood took it");
  check(!dacope.field_conditions.row.boroHarvest && !haorFc.row.amanRecord, 'the Boro timing stays in the haor, and the Aman record where Aman grows');
  console.log('✓ Field conditions: cropland greenness against the trend for', gridRows.length, 'upazilas;', lessGreen.total, 'to check; Dacope:', fc.row.condition.level, fc.row.emptyField?.days, 'empty days;',
    'Dharampasha Boro half cut', haorFc.row.boroHarvest.half);

  // Field Shift's statement: the farmer's rotation now, constraints and a what-if year go through the advice API
  const fsAdvice = await (await fetch(`${BASE}/api/v1/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    unionId: 'talanda_tanore', currentAmanCrop: 'BRRI dhan49', farmerPriorities: { water: 0.5, income: 0.3, soil: 0.2 },
    currentRotation: { monsoon: 'aman', winter: 'boro' }, constraints: { machinery: 'hand', market: 'nowhere' }, scenario: { rainPct: -90, warmingC: 9 },
  }) })).json();
  const fsMine = fsAdvice.options.filter(o => o.farmerCurrent);
  check(fsAdvice.options.length >= 3 && fsMine.length === 1 && fsAdvice.reference_option_id === fsMine[0].id && fsAdvice.options.every(o => o.review?.why?.length && o.review?.checks?.length),
    "the farmer's rotation is one marked option, the reference for every option's review");
  check(fsAdvice.what_if?.rainPct === -20 && fsAdvice.what_if?.warmingC === 3, 'a what-if outside -20..20% rain and 0..3 C is clamped');
  check(fsAdvice.options.some(o => o.review.constraintFlags.length) && fsAdvice.disclaimer?.bn && fsAdvice.season_calendar?.trends?.length, 'constraints flag options; the disclaimer and the season calendar are sent');
  const badRotation = await (await fetch(`${BASE}/api/v1/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    unionId: 'talanda_tanore', currentRotation: { winter: '<script>' } }) })).json();
  check(!badRotation.options.some(o => o.farmerCurrent) && !badRotation.what_if, 'a malformed rotation is ignored; no scenario, no what-if');
  const years = await (await fetch(`${BASE}/api/v1/map/years`)).json();
  const raj = years.districts?.Rajshahi;
  check(years.years?.length === 25 && raj?.groundwaterMm?.[0] === null && typeof raj?.groundwaterMm?.[24] === 'number' && raj.hotDays.length === 25
    && years.upazilaCropsByYear?.ADM3_Tanore?.length === 25 && years.sources?.groundwater,
    'the map\'s time slider gets 25 years: district heat, heavy rain, dry-season soil and GLDAS groundwater (from 2003), and MODIS crops per upazila');
  console.log('✓ Field Shift: the farmer\'s rotation ranks', fsMine[0].rank, 'of', fsAdvice.options.length, '; what-if clamped; season risks on the map; 25 years for the slider');
  check(Object.values(mapRows.upazilas).filter(r => r.blastStatus && r.lateBlightStatus).length > 500, 'the map carries this week\'s disease weather');
  check(['high', 'watch', 'clear', 'none'].includes(mapRows.upazilas.ADM3_Tanore.amanDryStatus) && typeof mapRows.upazilas.ADM3_Tanore.paddyWaterMm === 'number'
    && mapRows.upazilas.ADM3_Abhaynagar.amanDryStatus === null, 'the map carries this week\'s field alerts where the daily file has field water');
  const floodList = await (await fetch(`${BASE}/api/v1/flood/upazilas`)).json();
  check(floodList.status?.window === undefined && floodList.status?.radar?.summary?.upazilas === 1 && floodList.cropLoss?.year === 2026
    && floodList.upazilas.map(u => u.id).join() === 'ADM3_Barhatta,ADM3_Atpara' && floodList.upazilas[0].amanNotGreenPct === 45
    && floodList.upazilas[1].floodSharePct === null && mapRows.upazilas.ADM3_Tanore.floodSharePct === null,
    'the check list ranks Aman land not green (NASA HLS), most first, and leaves out places below 20%; no flood share where no satellite read one');
  const barhatta = floodList.upazilas[0];
  check(barhatta.floodSharePct === 30 && barhatta.sensor === 'nisar' && barhatta.drainPerWeekPct === 6 && barhatta.freeBy === daysAgo(-30)
    && mapRows.upazilas.ADM3_Barhatta.floodSharePct === 30,
    "with no OPERA reading, NISAR radar gives the flood share and this season's drain pace and free-by date");
  check(mapRows.upazilas.ADM3_Barhatta.amanNotGreenPct === 45 && mapRows.upazilas.ADM3_Tanore.amanNotGreenPct === 0 && mapRows.upazilas.ADM3_Abhaynagar.amanNotGreenPct === null,
    'the map carries the share of last year\'s Aman land not green this year');
  const outlines = await fetch(`${BASE}/data/bd_upazilas.geojson`, { headers: { 'Accept-Encoding': 'gzip' } });
  const encoding = outlines.headers.get('content-encoding');
  const shapes = await outlines.json();
  check(outlines.headers.get('content-type')?.includes('geo+json') && encoding === 'gzip' && shapes.features.length === 544
    && shapes.features.every(f => mapRows.upazilas[f.properties.id]), 'the map outlines are gzipped and match the 544 upazila ids');
  console.log('✓ Map:', Object.keys(mapRows.upazilas).length, 'upazilas; Godagari crops a year', god.cropsNow, ', rice pesticide', god.pesticideRice.join('-'), 'kg/ha');

  // 2. POST /api/v1/advice
  console.log('Testing POST /api/v1/advice ...');
  const resAdvice = await fetch(`${BASE}/api/v1/advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ landType: 'medium_high', farmerPriorities: { water: 0.6, income: 0.4 } }),
  });
  const dataAdvice = await resAdvice.json();
  check(resAdvice.status === 200, 'advice status');
  check(dataAdvice.farmer_card?.audioScriptBangla, 'advice carries the checked audio script for the app');
  console.log('✓ Advice status:', resAdvice.status, 'Top option:', dataAdvice.options[0].nameBangla);

  // 3. POST /api/v1/narrate
  console.log('Testing POST /api/v1/narrate ...');
  const resNarrate = await fetch(`${BASE}/api/v1/narrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ advice: dataAdvice, selectedOptionId: dataAdvice.options[0].id }),
  });
  const dataNarrate = await resNarrate.json();
  check(resNarrate.status === 200 && dataNarrate.status === 'verified_template', 'narrate');
  console.log('✓ Narrate status:', resNarrate.status, 'Engine used:', dataNarrate.status);

  // 4. POST /api/v1/channel-events (Keypad 1)
  console.log('Testing POST /api/v1/channel-events ...');
  const resKeypad = await fetch(`${BASE}/api/v1/channel-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keypad: '1' }),
  });
  const dataKeypad = await resKeypad.json();
  check(resKeypad.status === 200 && dataKeypad.topOptionId, 'keypad re-ranks');
  console.log('✓ Keypad status:', resKeypad.status, 'Ack:', dataKeypad.acknowledgementBangla);

  // 5. POST /api/v1/advice for a union without research data
  console.log('Testing POST /api/v1/advice for an unmodelled union ...');
  const resUnknown = await fetch(`${BASE}/api/v1/advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unionId: 'selborash_dharmapasha', landType: 'low' }),
  });
  check(resUnknown.status === 422, `expected 422 for an unmodelled union, got ${resUnknown.status}`);
  console.log('✓ Unmodelled union refused with', resUnknown.status);

  // 6-11. Krishi officer desk
  const post = (url, body, token) => fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  console.log('Testing the Krishi officer desk ...');
  const locked = await fetch(`${BASE}/api/v1/officer/desk`);
  check(locked.status === 401, `officer desk must need sign-in, got ${locked.status}`);
  const wrong = await post('/api/v1/officer/login', { officerId: 'saao_talanda_01', accessCode: 'wrong-code' });
  check(wrong.status === 401, 'wrong access code must be refused');
  const session = await (await post('/api/v1/officer/login', { officerId: 'saao_talanda_01', accessCode: OFFICER_CODE })).json();
  check(session.token, 'officer login returns a session token');
  const auth = { headers: { Authorization: `Bearer ${session.token}` } };
  const deskView = await (await fetch(`${BASE}/api/v1/officer/desk`, auth)).json();
  check(deskView.queue[0].farmerId === 'F04' && deskView.queue[0].level === 'urgent', 'the keypad-9 farmer with a late Aman tops the queue');
  console.log('✓ Officer sign-in works; queue top:', deskView.queue[0].farmerId, deskView.queue[0].reasons.map(r => r.en).join('; '));

  const observed = await (await post('/api/v1/officer/observations', {
    farmerId: 'F02', landType: 'high', currentAmanCrop: 'BRRI dhan71', irrigation: 'shallow_tube_well',
    pestSeen: 'aphid', pestSeverity: 'high', priorities: { water: 0.4, income: 0.2, soil: 0.2, pest: 0.2 },
    noteBangla: 'জমি দেখা হয়েছে', resolveCallbacks: true,
  }, session.token)).json();
  check(observed.advice.verification?.officerId === 'saao_talanda_01', 'observation marks the advice as officer-verified');
  check(observed.advice.scope.land_type === 'high' && observed.advice.this_season.currentAmanVariety === 'BRRI dhan71', "the officer's field details take priority");
  const farmerAdvice = await (await post('/api/v1/advice', { farmerId: 'F02' })).json();
  check(farmerAdvice.verification && farmerAdvice.scope.land_type === 'high', 'farmer advice uses the officer observation');
  console.log('✓ Officer observation takes priority in F02 advice:', farmerAdvice.options[0].nameEnglish);

  const banned = await post('/api/v1/officer/observations', {
    farmerId: 'F02', landType: 'high', currentAmanCrop: 'BRRI dhan71', irrigation: 'shallow_tube_well', noteBangla: 'কৃষি ব্যাংক থেকে ঋণ নিন',
  }, session.token);
  check(banned.status === 400, 'officer notes go through the same banned-word filter');

  const keypad9 = await (await post('/api/v1/channel-events', { keypad: '9', farmerId: 'F03' })).json();
  check(keypad9.callbackId, 'keypad 9 creates a call-back request');
  const deskAfter = await (await fetch(`${BASE}/api/v1/officer/desk`, auth)).json();
  check(deskAfter.queue.find(q => q.farmerId === 'F03').openCallbackId === keypad9.callbackId, 'the call-back reaches the officer queue');
  const knowledge = await (await fetch(`${BASE}/api/v1/officer/knowledge`, auth)).json();
  check(knowledge.srdi.rows.length >= 5 && knowledge.ipm.byRabi.length >= 4, 'officer knowledge pack has the full SRDI card and IPM steps');
  console.log('✓ Keypad 9 call-back queued; knowledge pack served to the signed-in officer');

  // 11b. The farmer register and the daily advice calls (farmer_calls.ts): consent, the list, approval, dry-run sends,
  // the retry and SMS, the limits, questions back through the officer, missed calls, and stopping the calls
  console.log('Testing the farmer register and the daily advice calls ...');
  const lockedPlan = await fetch(`${BASE}/api/v1/officer/calls/plan`);
  check(lockedPlan.status === 401, 'the call list needs an officer');
  const planView = await (await fetch(`${BASE}/api/v1/officer/calls/plan`, auth)).json();
  check(planView.register.farmers === 6 && planView.register.callable === 6 && !planView.live, 'six sample farmers who agreed, and calls are dry runs');
  const farmerBody = { nameBangla: 'পরীক্ষা কৃষক', phone: '01712345678', placeId: 'talanda_tanore', unionBangla: 'তালন্দ', landType: 'medium_high', crops: ['lentil', 'mustard', 'wheat'], callSlot: 'morning', consentMethod: 'in_person' };
  check((await post('/api/v1/officer/farmers', farmerBody, session.token)).status === 400, 'no registration without the farmer agreeing');
  check((await post('/api/v1/officer/farmers', { ...farmerBody, consent: true, phone: '12345' }, session.token)).status === 400, 'a phone must be a Bangladeshi mobile');
  const reg = await (await post('/api/v1/officer/farmers', { ...farmerBody, consent: true }, session.token)).json();
  check(reg.farmer?.id === 'F07' && reg.farmer.phoneMasked === '017XX-XXX678' && reg.farmer.consent.takenBy === 'saao_talanda_01', 'a registered farmer has a masked number and recorded consent');
  check((await post('/api/v1/officer/farmers', { ...farmerBody, consent: true }, session.token)).status === 400, 'one registration per number');

  // Season reminders on a fixed day: the lentil window closes 14 Nov, so on 6 Nov the lentil farmers hear it
  const day1 = '2026-11-06', day2 = '2026-11-07', day3 = '2026-11-08';
  const plan1 = await (await post('/api/v1/officer/calls/plan', { date: day1 }, session.token)).json();
  const mine1 = plan1.calls.find(c => c.farmerId === 'F07');
  check(mine1?.kind === 'reminder' && mine1.key.startsWith('reminder:lentil:close') && mine1.status === 'proposed', `the lentil farmer gets the closing-window reminder, got ${mine1?.key}`);
  check(mine1.scriptBangla.startsWith('আসসালামু আলাইকুম। মাটি কহন থেকে বলছি, তালন্দ ইউনিয়নের কৃষকদের জন্য।') && mine1.scriptBangla.includes('আবার বলছি') && mine1.scriptBangla.includes('এক ছয় এক দুই তিন'), 'the script says where it is for, repeats the action and gives the helpline');
  check(mine1.smsBangla.includes('১৬১২৩') && mine1.durationSeconds <= 60, 'the SMS names the helpline and the call stays under a minute');
  check(!JSON.stringify(plan1).includes('01712345678'), 'phone numbers never leave the server');
  check(plan1.calls.some(c => c.farmerId === 'F01' && c.kind === 'reminder'), 'the sample lentil farmer gets the reminder too');

  const removeOne = plan1.calls.find(c => c.farmerId === 'F01');
  await post(`/api/v1/officer/calls/${removeOne.id}/review`, { action: 'remove' }, session.token);
  const edited = await post(`/api/v1/officer/calls/${mine1.id}/review`, { action: 'edit', scriptBangla: `${mine1.scriptBangla} ঋণ নিন।` }, session.token);
  check(edited.status === 400, 'edited scripts go through the banned-word filter');
  const approved = await (await post('/api/v1/officer/calls/approve-all', { date: day1 }, session.token)).json();
  check(approved.approved >= 1 && approved.calls.find(c => c.id === removeOne.id).status === 'removed', 'approve-all skips the removed call');
  const sent1 = await (await post('/api/v1/officer/calls/send', { date: day1 }, session.token)).json();
  check(sent1.result.live === false && sent1.result.sent.every(s => s.outcome === 'dry_run'), 'with the switches off every call is a dry run');
  check(sent1.result.sent.filter(s => s.farmerId.startsWith('F0') && Number(s.farmerId.slice(1)) <= 6).every(s => s.note === 'sample farmer: never dialled'), 'sample farmers are never dialled');
  check((await post(`/api/v1/officer/calls/${mine1.id}/review`, { action: 'remove' }, session.token)).status === 400, 'a call that went out cannot be changed');

  // Not answered: a retry in the evening and an SMS; a second miss is "not reached"
  const missedOnce = await (await post(`/api/v1/officer/calls/${mine1.id}/outcome`, { outcome: 'unanswered' }, session.token)).json();
  check(missedOnce.call.status === 'retry' && missedOnce.call.slot === 'evening' && missedOnce.call.sms?.dryRun === true, 'an unanswered call is retried in the evening with an SMS');
  const sent2 = await (await post('/api/v1/officer/calls/send', { date: day1 }, session.token)).json();
  check(sent2.result.sent.some(s => s.id === mine1.id), 'the retry goes out');
  const missedTwice = await (await post(`/api/v1/officer/calls/${mine1.id}/outcome`, { outcome: 'unanswered' }, session.token)).json();
  check(missedTwice.call.status === 'unreached' && missedTwice.call.attempts.length === 2, 'two misses: not reached, for the officer to follow up');

  // Limits: one call a day; never the same message twice; at most two a week
  const again = await (await post('/api/v1/officer/calls/plan', { date: day1 }, session.token)).json();
  check(again.calls.filter(c => c.farmerId === 'F07').length === 1 && again.skipped.some(s => s.farmerId === 'F07' && s.reason === 'already has a call this day'), 'one call a farmer a day');
  const plan2 = await (await post('/api/v1/officer/calls/plan', { date: day2 }, session.token)).json();
  const mine2 = plan2.calls.find(c => c.farmerId === 'F07');
  check(mine2 && mine2.key !== mine1.key && mine2.key.startsWith('reminder:mustard'), `the next day brings the next message, got ${mine2?.key}`);
  await post('/api/v1/officer/calls/approve-all', { date: day2 }, session.token);
  await post('/api/v1/officer/calls/send', { date: day2 }, session.token);
  const plan3 = await (await post('/api/v1/officer/calls/plan', { date: day3 }, session.token)).json();
  check(!plan3.calls.some(c => c.farmerId === 'F07') && plan3.skipped.some(s => s.farmerId === 'F07'), 'two calls this week: the wheat reminder waits');

  // On low land after the flood (October to January), when the land will be free and when to sow the Boro seedbed
  const todayMd = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(5, 10);
  const today = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);
  // (registered now: on the test days above it would already have heard the same reading)
  const haorFarmer = (await (await post('/api/v1/officer/farmers', { ...farmerBody, consent: true, phone: '01812345678', placeId: 'ADM3_Barhatta', unionBangla: 'নমুনা', landType: 'low', crops: ['boro'] }, session.token)).json()).farmer;
  const planToday = await (await post('/api/v1/officer/calls/plan', {}, session.token)).json();
  const haorCall = planToday.calls.find(c => c.farmerId === haorFarmer.id);
  if (todayMd >= '10-01' || todayMd <= '01-31') {
    check(haorCall?.kind === 'drain' && haorCall.scriptBangla.includes('NISAR') && haorCall.scriptBangla.includes('বোরোর বীজতলা'), `the low-land farmer hears when the water will have left, got ${haorCall?.key}`);
  }

  // Questions come back through the officer; crop questions get the engine's draft
  const q1 = (await (await post('/api/v1/officer/questions', { farmerId: 'F07', textBangla: 'আমি সরিষা আর মসুর করতে চাই, কোনটা ভালো?', channel: 'phone' }, session.token)).json()).question;
  check(q1.status === 'open' && q1.draftBangla.includes('মসুর') && !q1.draftBangla.startsWith('আসসালামু'), "the engine drafts an answer to a crop question");
  const q2 = (await (await post('/api/v1/officer/questions', { farmerId: 'F07', textBangla: 'আমার গাভীর দুধ কমে গেছে কেন?' }, session.token)).json()).question;
  check(q2.draftBangla === '', 'no draft when the engine does not understand: the officer writes it');
  check((await post(`/api/v1/officer/questions/${q1.id}/answer`, { answerBangla: 'সুদ ছাড়া ঋণ নিন।' }, session.token)).status === 400, 'answers go through the banned-word filter');
  const answered = await (await post(`/api/v1/officer/questions/${q1.id}/answer`, { answerBangla: q1.draftBangla }, session.token)).json();
  check(answered.call?.kind === 'answer' && answered.call.date === today && answered.call.durationSeconds <= 75 && answered.question.status === 'answered', 'the approved answer goes on today\'s list');

  // A farmer's own question from the app
  const farmerSignIn = await (await post('/api/v1/auth/login', { role: 'farmer', farmerId: 'F01', pin: '1234' })).json();
  const appQ = await post('/api/v1/farmer/questions', { textBangla: 'গম কবে বুনব?' }, farmerSignIn.token);
  check(appQ.status === 200 && (await appQ.json()).question.channel === 'app', 'a farmer can ask from the app');
  check((await post('/api/v1/farmer/questions', { textBangla: 'x' }, session.token)).status === 401, 'only a farmer session asks as a farmer');

  // Missed calls: a key is required; a known number gets this week's advice on the list, an unknown one is kept masked
  check((await post('/api/v1/calls/missed', { phone: '01812345678' })).status === 401, 'missed calls need the webhook key');
  const missedKnown = await (await post('/api/v1/calls/missed?key=test-missed-key', { phone: '01812345678' })).json();
  check(missedKnown.registered && missedKnown.queued, 'a registered farmer\'s missed call puts their advice on the list');
  const missedUnknown = await (await post('/api/v1/calls/missed?key=test-missed-key', { phone: '01999999999' })).json();
  check(!missedUnknown.registered, 'an unknown number is not answered');
  const withUnknown = await (await fetch(`${BASE}/api/v1/officer/calls/plan`, auth)).json();
  check(withUnknown.unknownCallers[0]?.phoneMasked === '019XXXX9999', 'the officer sees the unknown caller, masked');

  // Stopping the calls: today's waiting calls go, and no more are planned
  const stopped = await (await post(`/api/v1/officer/farmers/${haorFarmer.id}/calls`, { on: false, how: 'farmer asked' }, session.token)).json();
  check(stopped.farmer.optedOut?.how === 'farmer asked', 'the officer records that the farmer stopped the calls');
  const afterStop = await (await post('/api/v1/officer/calls/plan', {}, session.token)).json();
  check(!afterStop.calls.some(c => c.farmerId === haorFarmer.id && c.status !== 'removed') && afterStop.skipped.some(s => s.farmerId === haorFarmer.id && s.reason === 'stopped the calls'), 'no calls after a farmer stops them');
  console.log(`✓ Farmer calls: consent, ${plan1.calls.length} calls on ${day1}, dry-run sends, retry + SMS, limits, questions, missed calls and stop`);

  // 12. Every dashboard text has an English translation
  const html = fs.readFileSync('apps/saao-dashboard/public/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const { EN } = await import('./apps/saao-dashboard/public/i18n.js');
  const keys = new Set([...html.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)].map(m => m[1]));
  const untranslated = [...keys].filter(k => !(k in EN));
  check(untranslated.length === 0, `English translations missing for: ${untranslated.join(', ')}`);
  console.log(`✓ All ${keys.size} dashboard texts have an English translation`);

  // 13. GET /
  // 14. Weather: contract, validation and per-location isolation (live providers; an outage must be reported honestly)
  console.log('Testing weather endpoints ...');
  const getJson = async (url) => { const r = await fetch(`${BASE}${url}`); return { status: r.status, body: await r.json() }; };
  const badLat = await getJson('/api/v1/weather/forecast?lat=abc&lon=90');
  check(badLat.status === 400 && badLat.body.error.code === 'invalid_input', 'invalid latitude is rejected with the error envelope');
  const outside = await getJson('/api/v1/weather/forecast?lat=51.5&lon=-0.12');
  check(outside.status === 400 && outside.body.error.code === 'invalid_input', 'coordinates outside Bangladesh are rejected');
  const missing = await getJson('/api/v1/weather?lat=24.6');
  check(missing.status === 400, 'missing lon is rejected (no silent Talanda default)');

  const dhaka = await getJson('/api/v1/weather/forecast?lat=23.81&lon=90.41');
  const sylhetForecast = await getJson('/api/v1/weather/forecast?lat=24.89&lon=91.87');
  if (dhaka.status === 200 && sylhetForecast.status === 200) {
    check(dhaka.body.location.lat === 23.81 && sylhetForecast.body.location.lat === 24.89, 'forecast echoes the requested coordinates');
    check(dhaka.body.forecast.source.kind === 'model_estimate' && dhaka.body.forecast.source.live === true, 'forecast is labelled a model estimate');
    const h = dhaka.body.forecast.hourly;
    check(h.length >= 24 && h.some(x => x.relativeHumidityPct !== null), 'hourly forecast carries relative humidity');
    check(new Set(h.slice(0, 24).map(x => x.relativeHumidityPct)).size > 1, 'hourly humidity varies by hour (not one repeated value)');
    check(dhaka.body.forecast.current.temperatureC !== sylhetForecast.body.forecast.current.temperatureC
      || dhaka.body.forecast.current.relativeHumidityPct !== sylhetForecast.body.forecast.current.relativeHumidityPct, 'two locations do not share one cached forecast');
    console.log('✓ Open-Meteo: per-location forecast with hourly humidity, labelled as a model estimate');
  } else {
    check(dhaka.body.error?.code === 'provider_unavailable', `forecast failure must be provider_unavailable, got ${JSON.stringify(dhaka.body)}`);
    console.log('! Open-Meteo unreachable from this machine: verified the honest provider_unavailable response instead');
  }

  const nasaA = await getJson('/api/v1/weather?lat=23.81&lon=90.41');
  const nasaB = await getJson('/api/v1/weather?lat=22.35&lon=91.83');
  if (nasaA.status === 200 && nasaB.status === 200) {
    check(nasaA.body.isLive === false && nasaA.body.source.kind === 'satellite_delayed' && nasaA.body.source.live === false, 'NASA POWER is never labelled live');
    check(nasaA.body.location.lat === 23.81 && nasaB.body.location.lat === 22.35, 'NASA response carries the requested coordinates');
    check(nasaA.body.soilMoisture.status === 'unavailable', 'NASA POWER reports soil moisture as unavailable instead of a constant');
    check(!('rootZoneMoistureM3M3' in nasaA.body.latest), 'no invented SMAP value in the NASA payload');
    check(JSON.stringify(nasaA.body.recentDays) !== JSON.stringify(nasaB.body.recentDays), 'NASA cache is per location');
    check(!JSON.stringify(nasaA.body).includes('তালন্দ'), 'NASA payload has no hardcoded Talanda labels');
    console.log('✓ NASA POWER: per-location, delayed, soil moisture unavailable, latest', nasaA.body.latestObservationDate);
  } else {
    check(nasaA.body.error?.code === 'provider_unavailable' || nasaA.body.error?.code === 'no_data', 'NASA failure must be an explicit error, never baseline data');
    console.log('! NASA POWER unreachable from this machine: verified the explicit error response instead');
  }

  const cfg = await getJson('/api/v1/config');
  check(cfg.status === 200 && cfg.body.llm.status === 'unavailable' && cfg.body.tts.status === 'unavailable', 'config reports unconfigured LLM/TTS as unavailable');
  check(cfg.body.earthEngine.status !== 'ready' || cfg.body.earthEngine.reason === 'ready', 'earth engine status comes from a real probe');
  check(cfg.body.jobs.productionDurable === false, 'config states the job store is not production durable');
  const locs = await getJson('/api/v1/locations');
  check(locs.body.districtCount === 64 && locs.body.upazilaCount >= 495, `locations cover all 64 districts and 495+ upazilas (got ${locs.body.districtCount}/${locs.body.upazilaCount})`);
  check(locs.body.districts.every(d => d.upazilas.length > 0 && d.upazilas.every(u => Number.isFinite(u.lat) && Number.isFinite(u.lon))), 'every upazila has coordinates');
  check(cfg.body.sms && cfg.body.sms.live === false, 'config reports the SMS gateway as not live');
  const smsDry = await (await fetch(`${BASE}/api/v1/sms/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '01700000000', unionId: 'talanda_tanore' }) })).json();
  check(smsDry.sms?.dryRun === true && smsDry.sms.request.toUser === '8801700000000' && smsDry.sms.request.messageContent.startsWith('মাটি কহন')
    && !/apikey=[^*]/.test(smsDry.sms.endpoint), 'the advice SMS is a dry run with the keys masked');
  const tts = await fetch(`${BASE}/api/v1/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'পরীক্ষা' }) });
  check(tts.status === 503 && (await tts.json()).error.code === 'configuration_required', 'TTS without a provider returns configuration_required');
  const unknown = await getJson('/api/v1/does-not-exist');
  check(unknown.status === 404 && unknown.body.error.code === 'not_found', 'unknown API path is a JSON 404, not the HTML page');
  const badJson = await fetch(`${BASE}/api/v1/advice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  check(badJson.status === 400, 'malformed JSON is a 400');
  console.log('✓ Config, locations, TTS fallback status and error envelope verified');

  // 15. River Erosion Information (GET /api/v1/erosion)
  console.log('Testing GET /api/v1/erosion ...');
  const resErosion = await fetch(`${BASE}/api/v1/erosion?river=jamuna`);
  const dataErosion = await resErosion.json();
  check(resErosion.status === 200, 'erosion status');
  check(dataErosion.corridor.stations.length >= 3, 'erosion stations');
  check(dataErosion.corridor.stations[0].dangerLevelM > 0, 'station carries real danger level');
  console.log('✓ River Erosion status: 200, Corridor:', dataErosion.corridor.riverNameBangla, 'Stations:', dataErosion.corridor.stations.length);

  // 16. Unified Auth (POST /api/v1/auth/login, GET /session, POST /logout)
  console.log('Testing Unified Auth ...');
  const farmerLogin = await (await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'farmer', farmerId: 'F01', pin: '1234' }),
  })).json();
  check(farmerLogin.token && farmerLogin.user.role === 'farmer', 'farmer login succeeds with session token');
  const farmerSession = await (await fetch(`${BASE}/api/v1/auth/session`, {
    headers: { Authorization: `Bearer ${farmerLogin.token}` },
  })).json();
  check(farmerSession.user.id === 'F01', 'farmer session validated');
  const logoutRes = await (await fetch(`${BASE}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerLogin.token}` },
  })).json();
  check(logoutRes.ok === true, 'logout succeeds');
  const expiredSession = await fetch(`${BASE}/api/v1/auth/session`, {
    headers: { Authorization: `Bearer ${farmerLogin.token}` },
  });
  check(expiredSession.status === 401, 'session revoked after logout');
  console.log('✓ Farmer Auth lifecycle verified: login -> session -> logout -> revoked');

  // 17. Grounded Bengali AI Agricultural Assistant (POST /api/v1/ai/ask)
  console.log('Testing AI Assistant ...');
  const aiNoLoc = await (await fetch(`${BASE}/api/v1/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'আমার জমিতে সেচ কখন দেওয়া উচিত?' }),
  })).json();
  check(aiNoLoc.evidenceLevel === 'insufficient_evidence', 'AI asks for a location instead of using a default one');
  const aiFert = await (await fetch(`${BASE}/api/v1/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'কত সার দেব?', lat: 23.81, lon: 90.41 }),
  })).json();
  check(aiFert.evidenceLevel === 'insufficient_evidence', 'AI does not apply the Talanda SRDI card elsewhere');
  const aiFertTalanda = await (await fetch(`${BASE}/api/v1/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'কত সার দেব?', lat: 24.62, lon: 88.56 }),
  })).json();
  check(aiFertTalanda.evidenceLevel === 'reference_card' && aiFertTalanda.answer.includes('229'), 'AI reads the real SRDI card values near Talanda');
  const aiRefusal = await (await fetch(`${BASE}/api/v1/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'শেয়ার বাজারে কোন শেয়ার কিনলে বেশি লাভ হবে?' }),
  })).json();
  check(aiRefusal.evidenceLevel === 'insufficient_evidence', 'AI refuses unsupported query without fabricating');
  console.log('✓ Grounded AI Assistant verified: evidence-based answer and safe refusal');

  // 18. Cattle AOI & Advisory Pipeline Endpoints
  console.log('Testing Cattle AOI & Advisory Endpoints ...');
  const resReadiness = await (await fetch(`${BASE}/api/v1/cattle/readiness`)).json();
  check(resReadiness.weatherForecast?.provider === 'Open-Meteo' && resReadiness.weatherForecast.status !== 'operational', 'readiness never hardcodes operational');
  check(resReadiness.mlModels?.supervisedHeatStress === 'training_data_unavailable', 'cattle ml readiness reports data unavailable');

  const resAois = await (await fetch(`${BASE}/api/v1/cattle/aois`)).json();
  check(Array.isArray(resAois.aois), 'list AOIs returns array');

  // Test invalid AOI geometry rejection (400)
  const badAoiRes = await fetch(`${BASE}/api/v1/cattle/aois`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmLabel: 'Invalid AOI',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    }),
  });
  check(badAoiRes.status === 400, 'out-of-bounds geometry must be rejected with 400');

  // Create valid farm AOI in Tanore
  const newAoiRes = await fetch(`${BASE}/api/v1/cattle/aois`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmLabel: 'তানোর টেস্ট ডেইরি (Tanore Test Dairy)',
      ownerName: 'মো. রফিকুল ইসলাম',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [88.5810, 24.5150],
            [88.5845, 24.5150],
            [88.5845, 24.5185],
            [88.5810, 24.5185],
            [88.5810, 24.5150],
          ],
        ],
      },
    }),
  });
  check(newAoiRes.status === 201, `create AOI status 201, got ${newAoiRes.status}`);
  const newAoiData = await newAoiRes.json();
  check(newAoiData.aoi.aoiId && newAoiData.job.jobId, 'create AOI returns AOI and enqueued background job');

  check(newAoiData.job.status === 'queued' && newAoiData.job.startedAt === undefined, 'a queued job has not started');

  // Wait for the job to reach a terminal status; the advisory exists only after real processing
  let job = newAoiData.job;
  for (let i = 0; i < 120 && ['queued', 'running'].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 500));
    job = (await (await fetch(`${BASE}/api/v1/cattle/jobs/${job.jobId}`)).json()).job;
  }
  check(!['queued', 'running'].includes(job.status), `job reached a terminal state, got ${job.status}`);
  const advRes = await fetch(`${BASE}/api/v1/cattle/aois/${encodeURIComponent(newAoiData.aoi.aoiId)}/advisory`);
  if (job.status === 'failed') {
    check(job.errorCode === 'provider_unavailable' && advRes.status === 404, 'a failed job leaves no advisory and says why');
    console.log('! weather providers unreachable: verified failed-job semantics instead');
  } else {
    check(job.status !== 'succeeded' || job.missing.length === 0, 'succeeded implies nothing is missing');
    check(job.status === 'partial' ? job.missing.length > 0 : true, 'partial lists what is missing');
    check(advRes.status === 200, 'advisory is available after the job completes');
    const advData = await advRes.json();
    const t = advData.advisory.derived.thi;
    check(t.current > 0 && t.hourly.length > 0 && t.hourly.length <= 24, 'advisory carries derived THI and an hourly curve');
    check(advData.advisory.measured.forecast.source.kind === 'model_estimate', 'measured forecast is labelled a model estimate');
    check(advData.advisory.heuristic.kind === 'heuristic' && !JSON.stringify(advData.advisory).includes('estimatedIncreasePct'), 'heuristic guidance carries no unsupported percentages');
    check(advData.advisory.modelStatus?.modelRegistryStatus === 'training_data_unavailable', 'advisory carries unavailable status for ungrounded models');
    if (!cfg.body.earthEngine || cfg.body.earthEngine.status !== 'ready') {
      check(job.status === 'partial' && advData.advisory.measured.satellite.status === 'unavailable' && advData.advisory.forageStatus.ndviProxy === null, 'without Earth Engine, satellite data is unavailable (no null-as-success)');
    }
  }

  const sat = await (await fetch(`${BASE}/api/v1/cattle/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aoiId: newAoiData.aoi.aoiId, jobType: 'satellite_extract' }) })).json();
  let satJob = sat.job;
  for (let i = 0; i < 60 && ['queued', 'running'].includes(satJob.status); i++) {
    await new Promise((r) => setTimeout(r, 250));
    satJob = (await (await fetch(`${BASE}/api/v1/cattle/jobs/${satJob.jobId}`)).json()).job;
  }
  if (cfg.body.earthEngine.status !== 'ready') {
    check(satJob.status === 'blocked' && satJob.errorCode === 'configuration_required', 'satellite job without Earth Engine is blocked/configuration_required, not complete');
  }
  const trainJob = await (await fetch(`${BASE}/api/v1/cattle/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aoiId: newAoiData.aoi.aoiId, jobType: 'train_model' }) })).json();
  let tJob = trainJob.job;
  for (let i = 0; i < 40 && ['queued', 'running'].includes(tJob.status); i++) {
    await new Promise((r) => setTimeout(r, 250));
    tJob = (await (await fetch(`${BASE}/api/v1/cattle/jobs/${tJob.jobId}`)).json()).job;
  }
  check(tJob.status === 'blocked' && tJob.errorCode === 'training_data_unavailable', 'training without labelled data is blocked, never succeeded');
  const badType = await fetch(`${BASE}/api/v1/cattle/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aoiId: newAoiData.aoi.aoiId, jobType: 'mine_bitcoin' }) });
  check(badType.status === 400, 'unknown job types are rejected');
  const retryOk = await fetch(`${BASE}/api/v1/cattle/jobs/${tJob.jobId}/retry`, { method: 'POST' });
  check(retryOk.status === 202, 'a blocked job can be retried');

  // Clean up created test AOI
  const delRes = await fetch(`${BASE}/api/v1/cattle/aois/${encodeURIComponent(newAoiData.aoi.aoiId)}`, {
    method: 'DELETE',
  });
  check(delRes.status === 200, 'delete AOI status');
  console.log('✓ Cattle AOI & Advisory Pipeline verified: create -> job enqueue -> advisory -> delete');

  // Officer routes without a token or with a token that is not valid
  console.log('Testing officer route protection ...');
  for (const [method, route] of [['GET', '/api/v1/officer/desk'], ['GET', '/api/v1/officer/knowledge'], ['GET', '/api/v1/officer/calls'],
    ['POST', '/api/v1/officer/observations'], ['POST', '/api/v1/officer/reset']]) {
    const noToken = await fetch(`${BASE}${route}`, { method });
    check(noToken.status === 401, `${method} ${route} without a token must be 401, got ${noToken.status}`);
    const junk = await fetch(`${BASE}${route}`, { method, headers: { Authorization: 'Bearer not-a-real-token' } });
    check(junk.status === 401 || junk.status === 503, `${method} ${route} with an unknown token must be refused, got ${junk.status}`);
  }
  const demoConfig = await (await fetch(`${BASE}/api/v1/auth/config`)).json();
  check(demoConfig.demoMode === true, 'auth config reports demo mode when DEMO_MODE=true');
  console.log('✓ Officer routes refuse missing and unknown tokens');

  // Manager data-sources status: 401 / 403 / 200 over HTTP, and never a secret value
  console.log('Testing GET /api/v1/manager/data-sources ...');
  const sources = '/api/v1/manager/data-sources';
  check((await fetch(`${BASE}${sources}`)).status === 401, 'data sources without a token must be 401');
  check((await fetch(`${BASE}${sources}`, { headers: { Authorization: 'Bearer nope' } })).status === 401, 'data sources with an unknown token must be 401');
  const asViewer = await fetch(`${BASE}${sources}`, { headers: { Authorization: 'Bearer viewer-token' } });
  check(asViewer.status === 403, `a signed-in non-manager must get 403, got ${asViewer.status}`);
  check(!(await asViewer.text()).includes('earthdataLogin'), 'the 403 body carries no status');
  const asManager = await fetch(`${BASE}${sources}`, { headers: { Authorization: 'Bearer mgr-token' } });
  check(asManager.status === 200, `a manager must get 200, got ${asManager.status}`);
  const managerText = await asManager.text();
  const sourcesBody = JSON.parse(managerText);
  const { integrations, ...flags } = sourcesBody;
  check(JSON.stringify(flags) === JSON.stringify({ earthdataLogin: 'set', earthdataToken: 'set', firmsMapKey: 'set', nasaApiKey: 'set', adsApiToken: 'set', offline: true }), `unexpected data-sources flags: ${JSON.stringify(flags)}`);
  // every integration, with one of four labels and plain sentences in both languages; offline mode makes NASA POWER a saved copy
  check(Array.isArray(integrations) && integrations.length >= 15, 'the data-sources response lists every integration');
  check(integrations.every((i) => ['live', 'saved', 'demo', 'notset'].includes(i.label) && i.name.bn && i.name.en && i.reason.bn && i.reason.en && i.usedBy.en && i.reality.bn), 'each integration has a label and bilingual text');
  check(integrations.find((i) => i.id === 'nasa-power').label === 'saved', 'with OFFLINE=1 NASA POWER is a saved copy, not live');
  check(integrations.find((i) => i.id === 'awaj').label === 'notset' && integrations.find((i) => i.id === 'demo-features').label === 'demo', 'unset Awaj is "notset" and the demo features say demo');
  check(!/[A-Z][A-Z0-9]+_[A-Z0-9_]{2,}/.test(JSON.stringify(integrations).replace(/OFFLINE|AWAJ_LIVE|DEMO_MODE|NOT_NEEDED|NOT_APPLICABLE/g, '')), 'the integrations list names no environment variable');
  for (const value of Object.values(FAKE_SECRETS)) check(!managerText.includes(value), 'the data-sources response must never contain a secret value');
  const demoSources = await fetch(`${BASE}${sources}`, { headers: { Authorization: `Bearer ${session.token}` } });
  check(demoSources.status === 200, 'the demo desk session may read the data-sources status in DEMO_MODE');
  const demoText = await demoSources.text();
  for (const value of Object.values(FAKE_SECRETS)) check(!demoText.includes(value), 'the demo response must never contain a secret value');
  console.log('✓ Data sources: 401 without a token, 403 for a non-manager, 200 for a manager, flags only (no secret)');

  // Everything a farmer hears or is sent (narration, audio script, voice reply, SMS, call script, keypad call, keypad-9 survey
  // answers, channel acknowledgements, the assistant): outside the pilot it carries no fertilizer amount and nothing from the Talanda SRDI card
  console.log('Testing spoken and delivered text outside the pilot ...');
  const postJson = async (route, body) => (await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const phone = '01712345678';
  const NO_CARD = 'এই এলাকার মাটির কার্ড (SRDI) যোগ করা হয়নি, সার-পরামর্শ দেওয়া যাচ্ছে না';
  const FERT_AMOUNT = /(urea|tsp|mop|potash|gypsum|zinc|ইউরিয়া|টিএসপি|এমওপি|পটাশ|জিপসাম|জিংক)[^.।]*[0-9০-৯]|[0-9০-৯][^.।]*(kg|কেজি)[^.।]*(urea|tsp|mop|ইউরিয়া|টিএসপি|এমওপি)/i;
  const SOIL_CARD_TEXT = /SRDI|Kharia|খিয়ার|এসআরডিআই|Talanda card|তালন্দ কার্ড/;
  const TALANDA_WORDS = /তালন্দ|Talanda|তানোর|Tanore/;
  const deliveredTexts = async (place, near) => {
    const texts = [];
    const add = (name, value) => { if (typeof value === 'string' && value) texts.push({ name, value }); };
    const advice = await postJson('/api/v1/advice', { unionId: place });
    const card = advice.farmer_card;
    for (const k of ['audioScriptBangla', 'narrativeBangla', 'provenanceBangla']) add(`farmer_card.${k}`, card[k]);
    add('farmer_card.season2.fertilizerBangla', card.season2.fertilizerBangla);
    add('farmer_card.season2.notesBangla', card.season2.notesBangla);
    const narration = await postJson('/api/v1/narrate', { advice, selectedOptionId: advice.options[0].id });
    for (const k of ['banglaSpeechText', 'englishGloss', 'banglaKeypadPrompt']) add(`narrate.${k}`, narration[k]);
    for (const text of ['আমি মসুর ও সরিষা করতে চাই', 'আলু করতে চাই, সার কত দেব', 'বোরো ধান করব']) {
      const v = await postJson('/api/v1/voice/answer', { unionId: place, text });
      add(`voice[${text}].speech`, v.reply.speechBangla); add(`voice[${text}].sms`, v.reply.smsBangla);
    }
    const call = await postJson('/api/v1/calls/advice', { unionId: place, phone, text: 'গম করতে চাই' });
    call.call.request.texts.forEach((t, i) => add(`calls/advice.texts[${i}]`, t));
    add('calls/advice.sms', call.reply.smsBangla);
    const keypad = await postJson('/api/v1/calls/keypad', { unionId: place, phone });
    add('calls/keypad.menu', keypad.menu); add('calls/keypad.request', JSON.stringify(keypad.call.request ?? keypad.call));
    for (const key of ['1', '2', '3', '4', '5', '9']) {
      const c = await postJson('/api/v1/channel-events', { keypad: key, farmerId: 'F01', unionId: place });
      add(`channel-events[${key}].bn`, c.acknowledgementBangla); add(`channel-events[${key}].en`, c.acknowledgementEnglish);
    }
    const assistant = await postJson('/api/v1/ai/ask', { query: 'এই এলাকায় সারের সুপারিশ কী?', ...near });
    return { texts, assistant };
  };
  const away = await deliveredTexts('ADM3_Godagari', { lat: 24.4, lon: 88.3 });
  check(away.texts.length >= 30, `the check really covers the delivered texts (${away.texts.length} texts)`);
  for (const { name, value } of away.texts) {
    const text = value.replace(NO_CARD, '');
    check(!FERT_AMOUNT.test(text), `Godagari ${name} carries a fertilizer amount: ${text.slice(0, 120)}`);
    check(!SOIL_CARD_TEXT.test(text), `Godagari ${name} carries Talanda SRDI card text: ${text.slice(0, 120)}`);
    check(!TALANDA_WORDS.test(text), `Godagari ${name} names Talanda or Tanore: ${text.slice(0, 120)}`);
  }
  check(away.assistant.evidenceLevel === 'insufficient_evidence' && !FERT_AMOUNT.test(away.assistant.answer) && !/[0-9০-৯]+ কেজি/.test(away.assistant.answer), 'the assistant gives no fertilizer amount away from Talanda');
  const home = await deliveredTexts('talanda_tanore', { lat: 24.62, lon: 88.56 });
  check(home.texts.some(({ name, value }) => name === 'farmer_card.season2.fertilizerBangla' && /ইউরিয়া.*টিএসপি.*এমওপি/.test(value)), 'the pilot\'s farmer card keeps its fertilizer line');
  check(home.assistant.evidenceLevel === 'reference_card' && /ইউরিয়া/.test(home.assistant.answer), 'the assistant still reads the Talanda card at Talanda');
  check(home.texts.every(({ value }) => !value.includes(NO_CARD)), 'the no-soil-card message never reaches a pilot text');
  check(home.texts.some(({ name }) => name.startsWith('calls/advice')) && home.texts.some(({ name }) => name.startsWith('channel-events')), 'the pilot\'s call and acknowledgement texts are still produced');
  console.log(`✓ Delivered text: ${away.texts.length} Godagari texts (narration, audio script, voice, SMS, call script, keypad menu, acknowledgements) carry no fertilizer amount, Talanda soil card text or Talanda name; the pilot is unchanged`);

  // Site scope over HTTP: a manager sees and changes only their own site's desk; the area parameter accepts known ids only
  console.log('Testing manager site scope ...');
  const as = (token) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const deskOf = async (token) => (await fetch(`${BASE}/api/v1/officer/desk`, as(token))).json();
  const ownDesk = await deskOf('h.talanda.s');
  // the six sample farmers and the ones the farmer-call test registered for the demo officer's site (talanda)
  const talandaCount = ownDesk.farmers.length;
  check(talandaCount >= 6 && ownDesk.farmers.some((f) => f.farmer.id === 'F06') && ownDesk.callbacks.some((c) => c.id === 'cb_seed_04'), 'the talanda manager sees the talanda desk');
  for (const token of ['h.other.s', 'h.nosite.s']) {
    const other = await deskOf(token);
    check(other.farmers.length === 0 && other.callbacks.length === 0 && other.queue.length === 0, `${token}: no farmers, call-backs or queue of another site`);
    const resolve = await fetch(`${BASE}/api/v1/officer/callbacks/cb_seed_04/resolve`, { method: 'POST', ...as(token) });
    check(resolve.status === 404, `${token}: another site's call-back is not found, got ${resolve.status}`);
    const observe = await fetch(`${BASE}/api/v1/officer/observations`, { method: 'POST', ...as(token), body: JSON.stringify({ farmerId: 'F01', landType: 'medium_high', currentAmanCrop: 'BRRI dhan71', irrigation: 'rainfed' }) });
    check(observe.status === 400, `${token}: cannot write an observation for another site's farmer, got ${observe.status}`);
    const calls = await (await fetch(`${BASE}/api/v1/officer/calls`, as(token))).json();
    check(calls.calls.length === 0, `${token}: the phone log of another site is not shown`);
  }
  const noSiteReset = await fetch(`${BASE}/api/v1/officer/reset`, { method: 'POST', ...as('h.nosite.s') });
  check(noSiteReset.status === 403 && (await noSiteReset.json()).error.code === 'site_required', 'a manager without a site cannot reset: 403 site_required (the dashboard shows the message and stays signed in)');
  // the same site written another way is the same site: the desk, the climate card and the area
  for (const token of ['h.upper.s', 'h.alias.s']) {
    const desk = await deskOf(token);
    check(desk.farmers.length === talandaCount && desk.callbacks.some((c) => c.id === 'cb_seed_04'), `${token}: a differently written talanda site sees the talanda desk`);
    const climate = await fetch(`${BASE}/api/v1/manager/climate`, as(token));
    const climateBody = await climate.json();
    check(climate.status === 200 && climateBody.area.id === 'talanda' && climateBody.area.isHome === true, `${token}: and the talanda climate card (status ${climate.status})`);
    const area = await (await fetch(`${BASE}/api/v1/manager/area`, as(token))).json();
    check(area.siteId === 'talanda' && area.placeId === 'talanda_tanore', `${token}: and the talanda home area`);
    const pack = await (await fetch(`${BASE}/api/v1/officer/knowledge`, as(token))).json();
    check(pack.srdi && pack.srdi.rows.length >= 4 && Array.isArray(pack.amanReplay), `${token}: and the talanda knowledge pack`);
  }
  // the knowledge pack is the pilot's: any other site gets only the no-soil-card message
  for (const token of ['h.other.s', 'h.nosite.s']) {
    const pack = await (await fetch(`${BASE}/api/v1/officer/knowledge`, as(token))).json();
    check(pack.srdi === null && pack.noSoilCard.bn === NO_CARD_BN && pack.noSoilCard.en.includes('soil card'), `${token}: the knowledge pack is the no-soil-card message`);
    for (const key of ['amanReplay', 'rabiReplay', 'ipm', 'caveats', 'saaoNotes', 'cattleHeat', 'haorSkill', 'haorEscape']) check(!(key in pack), `${token}: no ${key} (it is Tanore-point data)`);
  }
  await fetch(`${BASE}/api/v1/officer/reset`, { method: 'POST', ...as('h.other.s') });
  const afterReset = await deskOf('h.talanda.s');
  check(afterReset.farmers.length === talandaCount && afterReset.callbacks.some((c) => c.id === 'cb_seed_04' && c.status === 'open'), 'another site\'s reset leaves the talanda desk alone');
  const areaOf = async (token) => (await fetch(`${BASE}/api/v1/manager/area`, as(token))).json();
  const homeArea = await areaOf('h.talanda.s');
  check(homeArea.siteId === 'talanda' && homeArea.placeId === 'talanda_tanore' && homeArea.nameEnglish === 'Talanda, Tanore', 'the home area comes from app_metadata.site (not user_metadata)');
  check((await areaOf('h.other.s')).siteId === 'SUN_DHARMAPASHA', 'another manager has another home area, whatever user_metadata says');
  check((await fetch(`${BASE}/api/v1/manager/area`)).status === 401, 'the home area needs a token');
  check((await fetch(`${BASE}/api/v1/manager/area`, as('h.viewer.s'))).status === 403, 'the home area is for managers only');
  for (const area of ['nowhere', 'ADM3_Atlantis', '24.6,88.5', 'ADM3_']) {
    const bad = await fetch(`${BASE}/api/v1/manager/climate?area=${encodeURIComponent(area)}`, as('h.talanda.s'));
    check(bad.status === 422, `an unknown area (${area}) must be refused with 422, got ${bad.status}`);
  }
  check((await fetch(`${BASE}/api/v1/manager/climate?area=ADM3_ChuadangaSadar`)).status === 401, 'area climate needs a token');
  const sylhetOverview = await (await fetch(`${BASE}/api/v1/overview?place=ADM3_Godagari`)).json();
  check(sylhetOverview.early_warnings === null && sylhetOverview.soil_carbon === null && sylhetOverview.recent_farmer_contacts.length === 0 && sylhetOverview.pest_reports.length === 0 && sylhetOverview.context.landTypeBangla === null,
    'another place never receives the Tanore pilot\'s warnings, carbon, sample farmers or field reports');
  console.log('✓ Site scope: own desk only, another site cannot read, resolve, write or reset; area ids validated; pilot-only overview parts stay with the pilot');

  await checkDemoModeOff();
  await checkGuestMode();

  console.log('\n===========================================');
  console.log('  ALL ENDPOINTS TESTED & VERIFIED!          ');
  console.log('===========================================');
}

/** A second server without DEMO_MODE: the demo officer credentials must not work at all. */
async function checkDemoModeOff() {
  console.log('Testing that the demo login is closed without DEMO_MODE ...');
  const port = String(Number(PORT) + 1);
  const base = `http://localhost:${port}`;
  const store = path.join(os.tmpdir(), `eden-officer-test-nodemo-${process.pid}.json`);
  const env = { ...process.env, PORT: port, EDEN_OFFICER_CODE: OFFICER_CODE, SUPABASE_URL: FAKE_SUPABASE_URL, SUPABASE_ANON_KEY: 'fake-anon-key', EDEN_OFFICER_STORE: store,
    CATTLE_STORE_PATH: CATTLE_STORE, LLM_BASE_URL: '', TTS_BASE_URL: '', API_WRITE_TOKEN: '', AWAJ_LIVE: '0',
    EDEN_LIVE_FILE: path.resolve('tests/fixtures/live_conditions_2026-10-01.json') };
  delete env.DEMO_MODE;
  const proc = spawn('node', ['--experimental-strip-types', 'services/api/src/server.ts'], { stdio: 'ignore', env });
  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(`${base}/api/v1/overview`)).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    check(up, 'the no-demo server did not start');
    const json = { 'Content-Type': 'application/json' };
    const login = await fetch(`${base}/api/v1/officer/login`, { method: 'POST', headers: json, body: JSON.stringify({ officerId: 'saao_talanda_01', accessCode: OFFICER_CODE }) });
    check(login.status === 401, `demo officer login must be refused without DEMO_MODE, got ${login.status}`);
    const unified = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ role: 'officer', officerId: 'saao_talanda_01', accessCode: OFFICER_CODE }) });
    check(unified.status === 401, `unified officer login must be refused without DEMO_MODE, got ${unified.status}`);
    const officers = await (await fetch(`${base}/api/v1/officers`)).json();
    check(Array.isArray(officers) && officers.length === 0, 'the demo officer list is empty without DEMO_MODE');
    const desk = await fetch(`${base}/api/v1/officer/desk`);
    check(desk.status === 401, 'officer desk needs a token');
    const config = await (await fetch(`${base}/api/v1/auth/config`)).json();
    check(config.demoMode === false && config.guestMode === false && config.accountSignIn === false && Object.keys(config).sort().join() === 'accountSignIn,demoMode,emailDomain,guestMode,supabaseAnonKey,supabaseUrl', 'auth config exposes only the URL, the anon key, the email domain and the sign-in flags');
    const noGuest = await fetch(`${base}/api/v1/auth/guest`, { method: 'POST', headers: json, body: '{}' });
    check(noGuest.status === 403, `the guest manager must be closed without GUEST_MODE, got ${noGuest.status}`);
    // nothing configured: the manager sees "unset" and the demo NASA key
    const unset = await (await fetch(`${base}/api/v1/manager/data-sources`, { headers: { Authorization: 'Bearer mgr-token' } })).json();
    const { integrations: unsetIntegrations, ...unsetFlags } = unset;
    check(JSON.stringify(unsetFlags) === JSON.stringify({ earthdataLogin: 'unset', earthdataToken: 'unset', firmsMapKey: 'unset', nasaApiKey: 'unset', adsApiToken: 'unset', offline: false }), `unexpected unset data-sources flags: ${JSON.stringify(unsetFlags)}`);
    const unsetLabel = (id) => unsetIntegrations.find((i) => i.id === id).label;
    check(unsetLabel('nasa-power') === 'live' && unsetLabel('awaj') === 'notset' && unsetLabel('tts') === 'notset' && unsetLabel('llm') === 'notset', 'online and unset: POWER is live; Awaj, TTS and the LLM are not set up');
    console.log('✓ Without DEMO_MODE the demo officer credentials do not work at all');
  } finally {
    proc.kill();
    fs.rmSync(store, { force: true });
  }
}

/** A third server with GUEST_MODE=true: sign-in is optional, the guest works on the sample desk and can never go live. */
async function checkGuestMode() {
  console.log('Testing the optional sign-in: the guest manager ...');
  const port = String(Number(PORT) + 2);
  const base = `http://localhost:${port}`;
  const store = path.join(os.tmpdir(), `eden-officer-test-guest-${process.pid}.json`);
  const callStore = path.join(os.tmpdir(), `eden-calls-test-guest-${process.pid}.json`);
  const env = { ...process.env, PORT: port, GUEST_MODE: 'true', SUPABASE_URL: FAKE_SUPABASE_URL, SUPABASE_ANON_KEY: 'fake-anon-key', AUTH_EMAIL_DOMAIN: 'example.test',
    EDEN_OFFICER_STORE: store, EDEN_CALL_STORE: callStore, CATTLE_STORE_PATH: CATTLE_STORE, LLM_BASE_URL: '', TTS_BASE_URL: '', API_WRITE_TOKEN: '', AWAJ_LIVE: '0', OFFLINE: '1',
    SMS_LIVE: '1', SMS_API_KEY: 'fake-sms-key', SMS_SECRET_KEY: 'fake-sms-secret', SMS_SENDER_ID: 'fake', // a live SMS gateway on paper: the guest must be refused before anything is sent
    EDEN_LIVE_FILE: path.resolve('tests/fixtures/live_conditions_2026-10-01.json') };
  delete env.DEMO_MODE;
  delete env.EDEN_OFFICER_CODE;
  const proc = spawn('node', ['--experimental-strip-types', 'services/api/src/server.ts'], { stdio: 'ignore', env });
  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(`${base}/api/v1/overview`)).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    check(up, 'the guest-mode server did not start');
    const json = { 'Content-Type': 'application/json' };
    const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
    const post = (route, body, token) => fetch(`${base}${route}`, { method: 'POST', headers: token ? { ...json, Authorization: `Bearer ${token}` } : json, body: JSON.stringify(body ?? {}) });

    const config = await (await fetch(`${base}/api/v1/auth/config`)).json();
    check(config.guestMode === true && config.demoMode === false && config.accountSignIn === true, 'auth config reports guest mode on, demo off, and account sign-in set up');

    const guestRes = await post('/api/v1/auth/guest');
    check(guestRes.status === 200, `guest sign-in status ${guestRes.status}`);
    const guest = await guestRes.json();
    check(guest.token && guest.guest === true && guest.officer?.guest === true && guest.officer.site === 'talanda', 'the guest session is marked and belongs to the pilot site');
    const session = await (await fetch(`${base}/api/v1/auth/session`, as(guest.token))).json();
    check(session.user?.role === 'officer', 'the guest session can be checked again after a refresh');

    const guestDesk = await (await fetch(`${base}/api/v1/officer/desk`, as(guest.token))).json();
    check(guestDesk.officer?.guest === true && guestDesk.farmers.length === 6 && guestDesk.farmers.every((f) => f.farmer.sample), 'the guest sees the six sample farmers and the desk knows it is a guest');
    check((await fetch(`${base}/api/v1/officer/knowledge`, as(guest.token))).status === 200, 'the guest reads the knowledge pack');
    const sources = await fetch(`${base}/api/v1/manager/data-sources`, as(guest.token));
    check(sources.status === 200, 'the guest reads the data-sources status (flags only)');
    const area = await (await fetch(`${base}/api/v1/manager/area`, as(guest.token))).json();
    check(area.siteId === 'talanda', 'the guest has the pilot site as the home area');
    check((await fetch(`${base}/api/v1/officer/desk`)).status === 401, 'the desk still needs a token');
    check((await fetch(`${base}/api/v1/officer/desk`, as('not-a-guest-token'))).status === 401, 'an unknown token is refused');

    // a guest registers a sample farmer: never dialled, and the phone number is not kept anywhere
    const farmerBody = { nameBangla: 'অতিথির কৃষক', phone: '01712345678', placeId: 'talanda_tanore', unionBangla: 'তালন্দ', landType: 'medium_high', crops: ['lentil', 'wheat'], callSlot: 'morning', consentMethod: 'in_person', consent: true };
    const reg = await (await post('/api/v1/officer/farmers', farmerBody, guest.token)).json();
    check(reg.farmer?.sample === true && reg.farmer.phoneMasked === '017XX-XXX678', 'a guest registers a sample farmer with a masked number');
    check(!fs.readFileSync(store, 'utf8').includes('01712345678'), 'the guest\'s phone number is not written to the store');
    // the call list: a guest can plan, approve and "send", and it is always a dry run
    check((await post('/api/v1/officer/calls/plan', {}, guest.token)).status === 200, 'the guest builds the call list');
    check((await post('/api/v1/officer/calls/approve-all', {}, guest.token)).status === 200, 'the guest approves it');
    const sent = await (await post('/api/v1/officer/calls/send', {}, guest.token)).json();
    check(sent.result?.live === false, 'a guest\'s send is never live');
    // the gate for a real SMS: a guest is refused before anything is sent, no token is refused, the dry-run SMS route is not asked here
    const smsBody = { phone: '01712345678', crops: ['wheat'] };
    check((await post('/api/v1/sms/advice', smsBody, guest.token)).status === 403, 'a guest cannot send a real SMS');
    check((await post('/api/v1/sms/advice', smsBody)).status === 401, 'no token cannot send a real SMS');

    // a guest may restore the sample desk, but not wipe one that holds a real manager's registrations
    check((await post('/api/v1/officer/reset', {}, guest.token)).status === 200, 'a guest restores the sample desk');
    const real = await post('/api/v1/officer/farmers', farmerBody, 'h.talanda.s');
    check(real.status === 200 && (await real.json()).farmer?.sample === false, 'a manager account registers a real farmer, even with the number a guest used');
    const blocked = await post('/api/v1/officer/reset', {}, guest.token);
    check(blocked.status === 403, `a guest must not reset a desk with real registrations, got ${blocked.status}`);
    check((await post('/api/v1/officer/reset', {}, 'h.talanda.s')).status === 200, 'the manager account may still reset its own desk');

    check((await post('/api/v1/auth/logout', {}, guest.token)).status === 200, 'the guest signs out');
    check((await fetch(`${base}/api/v1/officer/desk`, as(guest.token))).status === 401, 'a signed-out guest token is refused');
    console.log('✓ Optional sign-in: the guest manager opens the sample desk in one click, never goes live, keeps no phone number and cannot wipe real records');
  } finally {
    proc.kill();
    fs.rmSync(store, { force: true });
    fs.rmSync(callStore, { force: true });
  }
}

function finish(code) {
  serverProc.kill();
  fakeSupabase.close();
  fs.rmSync(STORE, { force: true });
  fs.rmSync(CALL_STORE, { force: true });
  fs.rmSync(CATTLE_STORE, { force: true });
  fs.rmSync(NISAR, { force: true });
  process.exit(code);
}

run()
  .then(() => finish(0))
  .catch((err) => {
    console.error('Test error:', err);
    finish(1);
  });
