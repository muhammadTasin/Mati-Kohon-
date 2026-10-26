/**
 * Phone calls through SysTech (the voice platform behind smsvaults.work, the same account family as the REVE SMS
 * gateway), which plays our own Google Cloud TTS recording of the advice. Two routes onto the same kind of call:
 *
 *  - VoiceBlast portal (http://voice.smsvaults.work): a session sign-in with VOICEBLAST_USER / VOICEBLAST_PASSWORD,
 *    the recording uploaded to the account's file library once per script (its id cached in
 *    services/api/.data/voiceblast_audio.json), then a call to one number from VOICEBLAST_CALLER_ID. The portal has no
 *    published API: these are the requests its own pages make, so a change on their side can break it.
 *  - Voice Broadcast REST API (BROADCAST_BASE_URL, "APIs for Voice Broadcast"): BROADCAST_USER / BROADCAST_PASS as
 *    headers, the recording and up to many numbers in one request (do_blast), a delivery report per blast.
 *
 * Both want G.711 u-law WAV at 8 kHz mono; ulawWav() converts the 16-bit 8 kHz WAV that synthesizeSpeech(..., 'wav8k')
 * returns. CALL_PROVIDER (awaj, voiceblast or broadcast) picks the route for /api/v1/calls/advice. Nothing is dialled
 * unless VOICEBLAST_LIVE=1 or BROADCAST_LIVE=1; otherwise every function returns what it would send ({ dryRun: true }).
 * Keep the credentials in .env, never in the repository.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bdMobile } from './awaj.ts';

export type CallRoute = 'voiceblast' | 'broadcast';
const CACHE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/voiceblast_audio.json');

export function systechConfig(env = process.env) {
  const vb = { user: env.VOICEBLAST_USER || '', pass: env.VOICEBLAST_PASSWORD || '', caller: env.VOICEBLAST_CALLER_ID || '' };
  const bc = { user: env.BROADCAST_USER || '', pass: env.BROADCAST_PASS || '', caller: env.BROADCAST_CALLER_ID || '' };
  const provider = (env.CALL_PROVIDER || '').toLowerCase();
  return {
    provider: provider === 'voiceblast' || provider === 'broadcast' ? provider as CallRoute : null,
    voiceblast: {
      baseUrl: (env.VOICEBLAST_BASE_URL || 'http://voice.smsvaults.work').replace(/\/$/, ''),
      signInSet: Boolean(vb.user && vb.pass), callerId: vb.caller || null,
      live: env.VOICEBLAST_LIVE === '1' && Boolean(vb.user && vb.pass && vb.caller),
    },
    broadcast: {
      baseUrl: (env.BROADCAST_BASE_URL || 'http://103.174.214.170:7002/broadcast/index.php/api').replace(/\/$/, ''),
      signInSet: Boolean(bc.user && bc.pass), callerId: bc.caller || null,
      live: env.BROADCAST_LIVE === '1' && Boolean(bc.user && bc.pass && bc.caller),
    },
  };
}

// ------------------------------------------------------------------ audio
const SEG_UEND = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];
/** 16-bit linear PCM sample -> 8-bit G.711 u-law, byte for byte as CPython's audioop.lin2ulaw (st_14linear2ulaw). */
function ulawByte(sample: number): number {
  let v = sample >> 2; // to 14 bits
  let mask = 0xff;
  if (v < 0) { v = -v; mask = 0x7f; }
  if (v > 8159) v = 8159;
  v += 0x84 >> 2;
  let seg = 0;
  while (seg < 8 && v > SEG_UEND[seg]) seg++;
  if (seg >= 8) return 0x7f ^ mask;
  return (((seg << 4) | ((v >> (seg + 1)) & 0x0f)) ^ mask) & 0xff;
}

/** A 16-bit PCM WAV at 8 kHz mono (Google's LINEAR16) -> a G.711 u-law WAV (format 7), the telephone format. */
export function ulawWav(wav16: Buffer): Buffer {
  let off = 12, fmt: { rate: number; channels: number; bits: number } | null = null, pcm: Buffer | null = null;
  while (off + 8 <= wav16.length) {
    const id = wav16.toString('ascii', off, off + 4), size = wav16.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: wav16.readUInt16LE(off + 10), rate: wav16.readUInt32LE(off + 12), bits: wav16.readUInt16LE(off + 22) };
    if (id === 'data') pcm = wav16.subarray(off + 8, Math.min(wav16.length, off + 8 + size));
    off += 8 + size + (size % 2);
  }
  if (!fmt || !pcm || fmt.bits !== 16 || fmt.channels !== 1 || fmt.rate !== 8000) {
    throw new Error('ulawWav needs a 16-bit, 8 kHz, mono WAV (synthesizeSpeech with format wav8k)');
  }
  const n = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(58 + n);
  out.write('RIFF', 0); out.writeUInt32LE(50 + n, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(18, 16);
  out.writeUInt16LE(7, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(8000, 24); out.writeUInt32LE(8000, 28);
  out.writeUInt16LE(1, 32); out.writeUInt16LE(8, 34); out.writeUInt16LE(0, 36);
  out.write('data', 38); out.writeUInt32LE(n, 42);
  for (let i = 0; i < n; i++) out[46 + i] = ulawByte(pcm.readInt16LE(i * 2));
  return out.subarray(0, 46 + n);
}

// ------------------------------------------------------------------ VoiceBlast portal (session sign-in)
class Jar {
  private cookies = new Map<string, string>();
  take(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const pair = c.split(';')[0], i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
}

/** fetch with the jar's cookies, following redirects by hand so each Set-Cookie is kept. */
async function jarFetch(jar: Jar, url: string, init: RequestInit = {}): Promise<{ res: Response; url: string; text: string }> {
  let res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers as Record<string, string> ?? {}), Cookie: jar.header() } });
  jar.take(res);
  for (let hops = 0; hops < 5 && res.status >= 300 && res.status < 400 && res.headers.get('location'); hops++) {
    url = new URL(res.headers.get('location')!, url).toString();
    res = await fetch(url, { redirect: 'manual', headers: { Cookie: jar.header() } });
    jar.take(res);
  }
  return { res, url, text: await res.text() };
}

const isLoginPage = (html: string) => /<form/i.test(html) && /password|login/i.test(html) && !/dashboard/i.test(html);

let vbJar: Jar | null = null;
async function voiceblastSession(): Promise<Jar> {
  if (vbJar) return vbJar;
  const cfg = systechConfig().voiceblast;
  const jar = new Jar();
  await jarFetch(jar, `${cfg.baseUrl}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: process.env.VOICEBLAST_USER || '', password: process.env.VOICEBLAST_PASSWORD || '' }),
  });
  const dash = await jarFetch(jar, `${cfg.baseUrl}/customer/dashboard`);
  if (isLoginPage(dash.text) || !/dashboard/i.test(dash.url)) throw new Error('VoiceBlast refused the sign-in (check VOICEBLAST_USER and VOICEBLAST_PASSWORD)');
  vbJar = jar;
  return jar;
}

/** A portal page or JSON call, signing in again once if the session has lapsed. */
async function voiceblast(pathname: string, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  const url = `${systechConfig().voiceblast.baseUrl}${pathname}`;
  let got = await jarFetch(await voiceblastSession(), url, init);
  if (isLoginPage(got.text) || got.res.status === 401 || got.res.status === 403) {
    vbJar = null;
    got = await jarFetch(await voiceblastSession(), url, init);
  }
  return { status: got.res.status, text: got.text };
}

const plain = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

/** Balance, call rate and this month's cost from the portal's dashboard (read-only). */
export async function voiceblastAccount() {
  const text = plain((await voiceblast('/customer/dashboard')).text);
  const money = (label: string) => text.match(new RegExp(`৳\\s*([\\d.,]+)\\s*${label}`, 'i'))?.[1] ?? null;
  return { balanceTaka: money('Balance'), callRateTaka: money('Call Rate'), monthCostTaka: money("Month's Cost") };
}

/** The portal's recent calls: number, caller id, status, cause, time (read-only). */
export async function voiceblastHistory(limit = 10) {
  const html = (await voiceblast('/customer/demo-history')).text;
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => plain(c[1]).trim()));
  return rows.filter(r => r.length >= 5 && !/no demo calls/i.test(r[0])).slice(0, limit)
    .map(([phone, callerId, status, cause, time]) => ({ phone, callerId, status, cause, time }));
}

function audioCache(): Record<string, number> {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

/** Uploads a recording to the portal's file library (once per script) and returns its id. */
async function voiceblastAudioId(ulaw: Buffer, key: string): Promise<number> {
  const cache = audioCache();
  if (cache[key]) return cache[key];
  const name = `matikohon_${key}.wav`;
  const form = new FormData();
  form.append('file', new Blob([ulaw], { type: 'audio/wav' }), name);
  form.append('file_type', 'audio');
  const up = await voiceblast('/customer/library/upload', { method: 'POST', body: form });
  let ok = false;
  try { ok = Boolean(JSON.parse(up.text).success); } catch { /* not JSON */ }
  if (!ok) throw new Error(`VoiceBlast did not take the recording (HTTP ${up.status})`);
  const lib = (await voiceblast('/customer/library')).text;
  const card = lib.split(/(?=<[^>]+class="[^"]*file-card)/i).find(c => c.includes(name));
  const id = Number(card?.match(/id="file-(\d+)"/)?.[1]);
  if (!id) throw new Error('The recording was uploaded but its id was not found in the library');
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ ...cache, [key]: id }));
  return id;
}

// ------------------------------------------------------------------ Voice Broadcast REST API
async function broadcastApi(pathname: string, body?: FormData | URLSearchParams) {
  const res = await fetch(`${systechConfig().broadcast.baseUrl}${pathname}`, {
    method: 'POST', headers: { user: process.env.BROADCAST_USER || '', pass: process.env.BROADCAST_PASS || '' }, body,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}

/** The broadcast account's balance (read-only). */
export async function broadcastBalance() {
  return broadcastApi('/get_balance_info');
}

/** Delivery report of a blast: per-number outcome and seconds (read-only). */
export async function broadcastReport(blastId: number | string) {
  return broadcastApi('/get_report', new URLSearchParams({ blast_id: String(blastId) }));
}

// ------------------------------------------------------------------ one call
/**
 * Plays a G.711 recording of the advice to one farmer through the chosen route. `audio` is the 16-bit 8 kHz WAV from
 * synthesizeSpeech(text, 'bn', env, 'wav8k'); `script` is its text, which keys the portal's cached recording.
 */
export async function sendSystechCall(route: CallRoute, opts: { phone: string; audio: Buffer | null; script: string; dryRun?: boolean }) {
  const cfg = systechConfig()[route];
  const mobile = bdMobile(opts.phone);
  const key = crypto.createHash('sha1').update(opts.script).digest('hex').slice(0, 12);
  const request = route === 'voiceblast'
    ? { endpoint: `POST ${cfg.baseUrl}/customer/campaigns/demo-call`, phone: mobile, caller_id: cfg.callerId ?? '<VOICEBLAST_CALLER_ID>', audio_file: `matikohon_${key}.wav (uploaded once)` }
    : { endpoint: `POST ${cfg.baseUrl}/do_blast`, arr_dst: mobile ? [`88${mobile}`] : [], callerid: cfg.callerId ?? '<BROADCAST_CALLER_ID>', voice: `matikohon_${key}.wav`, retry: 0 };
  if (!mobile) return { dryRun: !cfg.live, route, error: 'No valid Bangladeshi mobile number (01XXXXXXXXX)', request };
  if (!cfg.live || opts.dryRun) return { dryRun: true, route, request, audioBytes: opts.audio ? ulawWav(opts.audio).length : null };
  if (!opts.audio) return { dryRun: false, route, error: 'A real SysTech call needs Google Cloud TTS (GOOGLE_TTS_CREDENTIALS) for the recording', request };
  const ulaw = ulawWav(opts.audio);
  if (route === 'voiceblast') {
    const audioId = await voiceblastAudioId(ulaw, key);
    const res = await voiceblast('/customer/campaigns/demo-call', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone: mobile, caller_id: cfg.callerId, audio_file_id: String(audioId) }),
    });
    let data: any = res.text;
    try { data = JSON.parse(res.text); } catch { /* keep the text */ }
    return { dryRun: false, route, audioId, ok: Boolean(data?.success), response: typeof data === 'string' ? data.slice(0, 200) : data };
  }
  const form = new FormData();
  form.append('voice', new Blob([ulaw], { type: 'audio/wav' }), `matikohon_${key}.wav`);
  form.append('callerid', cfg.callerId!);
  form.append('retry', '0');
  form.append('arr_dst', JSON.stringify([`88${mobile}`]));
  const res = await broadcastApi('/do_blast', form);
  return { dryRun: false, route, ok: Boolean((res.data as any)?.success), blastId: (res.data as any)?.blast_id ?? null, response: res.data };
}
