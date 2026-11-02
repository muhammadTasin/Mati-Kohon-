/**
 * The landing page's sample calls: what a farmer at four places would hear today if they were registered, each place
 * a different Bangladesh (the Barind's dry high land, a Jamuna char, a haor, the salty coast). The calls come from the
 * same rules as the real ones (farmer_calls.ts sampleCall): the day's alert, drain date or reminder, else the season's
 * rotation. Nothing is stored, planned or sent, and nobody is dialled.
 *
 * Their voice is our Google bn-BD recording, made once per script and kept on disk (data/audio/landing), so a page
 * full of visitors costs at most four recordings a day and no visitor's text is ever read out. EDEN_LANDING_AUDIO moves
 * the folder (the tests use an empty one).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dhakaToday, sampleCall, type SampleFarmer } from './farmer_calls.ts';
import { synthesizeSpeech, ttsStatus } from './providers/tts.ts';

const AUDIO_DIR = process.env.EDEN_LANDING_AUDIO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/audio/landing');

type Words = { bn: string; en: string };
interface Sample extends SampleFarmer {
  name: Words;
  district: Words;
  /** The kind of land the place stands for, in a few words. */
  land: Words;
}

const SAMPLES: Sample[] = [
  {
    id: 'landing_talanda', placeId: 'talanda_tanore', landType: 'medium_high', crops: ['aman', 'lentil'],
    unionBangla: 'তালন্দ', unionEnglish: 'Talanda',
    name: { bn: 'তালন্দ, তানোর', en: 'Talanda, Tanore' }, district: { bn: 'রাজশাহী', en: 'Rajshahi' },
    land: { bn: 'বরেন্দ্রের শুকনো উঁচু জমি', en: "The Barind's dry high land" },
  },
  {
    id: 'landing_chauhali', placeId: 'ADM3_Chauhali', landType: 'low', crops: ['boro'],
    name: { bn: 'চৌহালি', en: 'Chauhali' }, district: { bn: 'সিরাজগঞ্জ', en: 'Sirajganj' },
    land: { bn: 'যমুনার চরের নিচু জমি', en: 'Low land on the Jamuna chars' },
  },
  {
    id: 'landing_dharampasha', placeId: 'ADM3_Dharampasha', landType: 'low', crops: ['boro'],
    name: { bn: 'ধর্মপাশা', en: 'Dharampasha' }, district: { bn: 'সুনামগঞ্জ', en: 'Sunamganj' },
    land: { bn: 'হাওর: বর্ষায় পানির নিচে', en: 'Haor: under water all monsoon' },
  },
  {
    id: 'landing_koyra', placeId: 'ADM3_Koyra', landType: 'medium_low', crops: ['aman'],
    name: { bn: 'কয়রা', en: 'Koyra' }, district: { bn: 'খুলনা', en: 'Khulna' },
    land: { bn: 'উপকূলের লোনা জমি', en: 'Salty land on the coast' },
  },
];

const callOf = (s: Sample, today: string) => sampleCall(s, today);
let cached: { date: string; body: unknown } | null = null;

/** The four sample calls for today (worked out once a day: the advice behind them takes a few milliseconds each). */
export function landingCalls(today = dhakaToday()) {
  if (cached?.date === today) return cached.body;
  const samples = SAMPLES.map(s => ({
    id: s.id, placeId: s.placeId, name: s.name, district: s.district, land: s.land, call: callOf(s, today),
  }));
  const body = { date: today, voice: ttsStatus().status === 'configured', samples };
  cached = { date: today, body };
  return body;
}

type Recording = { audio: Buffer; contentType: string };
const making = new Map<string, Promise<Recording>>();
const TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
const extOf = (contentType: string) => Object.keys(TYPES).find(e => TYPES[e] === contentType.split(';')[0].trim()) ?? 'mp3';

/**
 * A sample call's recording for today: from disk when this script was recorded before, else made now (and the
 * sample's older recordings removed). Null for an unknown sample; throws when no voice is set up on the server.
 */
export async function landingAudio(id: string, today = dhakaToday()): Promise<Recording | null> {
  const s = SAMPLES.find(x => x.id === id);
  if (!s) return null;
  const script = callOf(s, today).scriptBangla;
  const stem = `${s.id}_${crypto.createHash('sha1').update(script).digest('hex').slice(0, 10)}`;
  const kept = fs.existsSync(AUDIO_DIR) ? fs.readdirSync(AUDIO_DIR).find(f => f.startsWith(`${stem}.`)) : undefined;
  if (kept) return { audio: fs.readFileSync(path.join(AUDIO_DIR, kept)), contentType: TYPES[path.extname(kept).slice(1)] ?? 'audio/mpeg' };
  if (!making.has(stem)) {
    making.set(stem, synthesizeSpeech(script, 'bn').then((made) => {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
      for (const old of fs.readdirSync(AUDIO_DIR)) if (old.startsWith(`${s.id}_`)) fs.rmSync(path.join(AUDIO_DIR, old), { force: true });
      fs.writeFileSync(path.join(AUDIO_DIR, `${stem}.${extOf(made.contentType)}`), made.audio);
      return made;
    }).finally(() => making.delete(stem)));
  }
  return making.get(stem)!;
}
