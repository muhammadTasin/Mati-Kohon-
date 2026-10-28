/**
 * Krishi officer (SAAO) desk: a separate channel between farmers and their field officer.
 *
 *  - Officers sign in with a demo access code and get extra access: the call-back queue, the farmer register,
 *    a field observation form and a knowledge pack farmers do not see (full SRDI card, replay details, IPM).
 *  - An officer's observation "describes" the farmer's field (land type, the Aman variety in the ground,
 *    irrigation, pests, priorities). It takes priority over defaults when that farmer's advice is built.
 *  - Farmers reach the desk by pressing 9 in the IVR call; that request tops the officer's queue.
 *  - The farmer register behind the advice calls (farmer_calls.ts): the officer registers a farmer with their union,
 *    land, crops and call time only after the farmer agrees to the calls; a farmer can stop them at any time. Phone
 *    numbers stay in the store's `phones` map and never leave the server; screens get the masked number.
 *
 * Demo only: the access code is a shared demo secret (EDEN_OFFICER_CODE, default in the README) and the store
 * is a JSON file under services/api/.data/ (git-ignored). Farmers here are sample records, not real people.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CallbackRequest,
  CallSlot,
  FarmerConsent,
  FarmerRecord,
  FieldObservation,
  LandType,
  OfficerQueueItem,
  OfficerVerification,
  PestSeen,
} from '@project-eden/contracts';
import type { PlanOptionsRequest } from '../../../packages/rotation-engine/src/engine.ts';
import { thisSeasonFit } from '../../../packages/rotation-engine/src/engine.ts';
import { LOC, placeFor } from '../../../packages/rotation-engine/src/data/location.ts';
import { CHOICE_CROPS } from '../../../packages/rotation-engine/src/data/crop_choice.ts';
import { bdMobile } from './awaj.ts';
import { FORBIDDEN_TERMS } from '../../../packages/narration-core/src/dual_gate_validator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = process.env.EDEN_OFFICER_STORE || path.resolve(__dirname, '../.data/officer_store.json');
const ACCESS_CODE = process.env.EDEN_OFFICER_CODE || 'talanda-demo';

export const OFFICERS = [
  { id: 'saao_talanda_01', nameBangla: 'নমুনা কর্মকর্তা (SAAO)', nameEnglish: 'Sample officer (SAAO)', blockBangla: 'তালন্দ ব্লক', blockEnglish: 'Talanda block' },
];

export const PEST_NAMES: Record<PestSeen, { bn: string; en: string }> = {
  none: { bn: 'দেখা যায়নি', en: 'none seen' },
  stem_borer: { bn: 'মাজরা পোকা', en: 'stem borer' },
  bph: { bn: 'বাদামি গাছফড়িং', en: 'brown planthopper' },
  aphid: { bn: 'জাব পোকা', en: 'aphid' },
  blast: { bn: 'ব্লাস্ট রোগ', en: 'blast disease' },
  other: { bn: 'অন্যান্য বালাই', en: 'other pest' },
};

const LAND_TYPES: LandType[] = ['high', 'medium_high', 'medium_low', 'low', 'very_low'];
const IRRIGATION: FieldObservation['irrigation'][] = ['rainfed', 'shallow_tube_well', 'deep_tube_well'];
const SEVERITY = ['low', 'medium', 'high'] as const;
export const CALL_SLOTS: CallSlot[] = ['morning', 'afternoon', 'evening'];
const CONSENT_METHODS: FarmerConsent['method'][] = ['in_person', 'phone', 'app'];
/** The crops a farmer can register: Aman and every crop on the crop menu. */
export const REGISTER_CROPS = ['aman', ...CHOICE_CROPS.map(c => c.id)];

interface Store {
  farmers: FarmerRecord[];
  observations: FieldObservation[];
  callbacks: CallbackRequest[];
  /** farmer id -> 01XXXXXXXXX; sample farmers have none and are never dialled. */
  phones?: Record<string, string>;
}

function seedFarmers(): FarmerRecord[] {
  const bn = (n: string) => n.replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
  const farmer = (n: string, landType: LandType, currentAmanCrop: string, irrigation: FarmerRecord['irrigation'],
    crops: string[], callSlot: CallSlot, where: Partial<FarmerRecord> = {}): FarmerRecord => ({
    id: `F${n}`,
    nameBangla: `নমুনা কৃষক ${bn(n)}`,
    nameEnglish: `Sample farmer ${n}`,
    villageBangla: `নমুনা গ্রাম ${bn(n)}`,
    villageEnglish: `Sample village ${n}`,
    phoneMasked: `017XX-XXX${n}`,
    landType,
    currentAmanCrop,
    irrigation,
    sample: true,
    placeId: 'talanda_tanore',
    unionBangla: 'তালন্দ',
    unionEnglish: 'Talanda',
    crops,
    callSlot,
    consent: { date: '2026-09-20T09:00:00.000Z', takenBy: 'saao_talanda_01', method: 'sample' },
    optedOut: null,
    registeredAt: '2026-09-20T09:00:00.000Z',
    registeredBy: 'saao_talanda_01',
    ...where,
  });
  // Two haor farmers on low land in Bajitpur (Kishoreganj), where NISAR radar sees the monsoon water leaving
  const haor = { placeId: 'ADM3_Bajitpur', unionBangla: 'নমুনা', unionEnglish: 'Sample' };
  return [
    farmer('01', 'medium_high', 'BRRI dhan71', 'deep_tube_well', ['aman', 'lentil'], 'evening'),
    farmer('02', 'high', 'BRRI dhan49', 'shallow_tube_well', ['aman', 'mustard', 'boro'], 'morning'),
    farmer('03', 'medium_high', 'BRRI dhan75', 'rainfed', ['aman', 'wheat'], 'evening'),
    farmer('04', 'medium_low', 'BRRI dhan49', 'deep_tube_well', ['aman', 'boro'], 'afternoon'),
    farmer('05', 'low', 'BRRI dhan49', 'shallow_tube_well', ['boro'], 'evening', haor),
    farmer('06', 'very_low', 'BRRI dhan49', 'shallow_tube_well', ['boro'], 'morning', haor),
  ];
}

function seedStore(): Store {
  return {
    farmers: seedFarmers(),
    observations: [
      {
        id: 'obs_seed_01',
        farmerId: 'F01',
        officerId: 'saao_talanda_01',
        date: '2026-09-25T10:00:00.000Z',
        landType: 'medium_high',
        currentAmanCrop: 'BRRI dhan71',
        irrigation: 'deep_tube_well',
        pestSeen: 'none',
        pestSeverity: null,
        priorities: { water: 0.5, income: 0.2, soil: 0.2, pest: 0.1 },
        noteBangla: 'জমি দেখা হয়েছে; মসুরের বীজ আগে থেকে সংগ্রহ করতে বলা হয়েছে।',
      },
    ],
    callbacks: [
      { id: 'cb_seed_04', farmerId: 'F04', channel: 'ivr_keypad_9', createdAt: '2026-09-29T08:30:00.000Z', status: 'open' },
    ],
    phones: {},
  };
}

function loadStore(): Store {
  try {
    const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Store;
    // A store from before the register holds only the four sample farmers: give it this release's samples
    if (saved.farmers.every(f => f.sample && !f.crops)) saved.farmers = seedFarmers();
    saved.phones ??= {};
    return saved;
  } catch {
    return seedStore();
  }
}

const store: Store = loadStore();
const sessions = new Map<string, string>(); // token -> officer id

function save(): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

/** Restore the sample data (used by tests and before a demo recording). */
export function resetDesk(): void {
  const fresh = seedStore();
  store.farmers = fresh.farmers;
  store.observations = fresh.observations;
  store.callbacks = fresh.callbacks;
  store.phones = fresh.phones;
  save();
}

export interface AuthUser {
  id: string;
  role: 'officer' | 'farmer';
  nameBangla: string;
  nameEnglish: string;
  titleBangla: string;
  blockOrVillageBangla: string;
  phoneMasked?: string;
  landType?: string;
  currentAmanCrop?: string;
}

const userSessions = new Map<string, AuthUser>();

export function login(officerId: string, accessCode: string): { token: string; officer: (typeof OFFICERS)[number] } | null {
  const officer = OFFICERS.find(o => o.id === officerId);
  const given = Buffer.from(String(accessCode ?? ''));
  const expected = Buffer.from(ACCESS_CODE);
  if (!officer || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const token = crypto.randomUUID();
  sessions.set(token, officer.id);
  userSessions.set(token, {
    id: officer.id,
    role: 'officer',
    nameBangla: officer.nameBangla,
    nameEnglish: officer.nameEnglish,
    titleBangla: 'উপসহকারী কৃষি কর্মকর্তা (SAAO)',
    blockOrVillageBangla: officer.blockBangla,
  });
  return { token, officer };
}

export function loginUser(body: { role?: string; officerId?: string; accessCode?: string; farmerId?: string; phone?: string; pin?: string }): { token: string; user: AuthUser } | null {
  if (body.role === 'officer' || body.officerId) {
    const officerId = body.officerId || 'saao_talanda_01';
    const accessCode = body.accessCode || '';
    const res = login(officerId, accessCode);
    if (!res) return null;
    return { token: res.token, user: userSessions.get(res.token)! };
  } else {
    // Farmer login: lookup by ID (F01, F02, etc.) or phone
    let targetFarmer = body.farmerId ? farmerById(body.farmerId) : undefined;
    if (!targetFarmer && body.phone) {
      const cleanPhone = body.phone.replace(/\D/g, '');
      targetFarmer = store.farmers.find(f => {
        const lastDigits = f.phoneMasked.slice(-2);
        return cleanPhone.endsWith(lastDigits) || f.phoneMasked.includes(cleanPhone);
      });
    }
    if (!targetFarmer) {
      targetFarmer = store.farmers[0]; // fallback to F01
    }
    const pin = body.pin || '1234';
    if (pin !== '1234' && pin !== '0000') return null;

    const token = crypto.randomUUID();
    const user: AuthUser = {
      id: targetFarmer.id,
      role: 'farmer',
      nameBangla: targetFarmer.nameBangla,
      nameEnglish: targetFarmer.nameEnglish,
      titleBangla: 'নিবন্ধিত কৃষক',
      blockOrVillageBangla: targetFarmer.villageBangla,
      phoneMasked: targetFarmer.phoneMasked,
      landType: targetFarmer.landType,
      currentAmanCrop: targetFarmer.currentAmanCrop,
    };
    userSessions.set(token, user);
    return { token, user };
  }
}

export function userForToken(authorization: string | undefined): AuthUser | null {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  const user = userSessions.get(token);
  if (user) return user;
  const officerId = sessions.get(token);
  if (officerId) {
    const officer = OFFICERS.find(o => o.id === officerId);
    if (officer) {
      return {
        id: officer.id,
        role: 'officer',
        nameBangla: officer.nameBangla,
        nameEnglish: officer.nameEnglish,
        titleBangla: 'উপসহকারী কৃষি কর্মকর্তা (SAAO)',
        blockOrVillageBangla: officer.blockBangla,
      };
    }
  }
  return null;
}

export function logout(authorization: string | undefined): boolean {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return false;
  sessions.delete(token);
  userSessions.delete(token);
  return true;
}

export function officerForToken(authorization: string | undefined) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const officerId = token ? sessions.get(token) : undefined;
  return officerId ? OFFICERS.find(o => o.id === officerId) ?? null : null;
}

export function farmerById(farmerId: string): FarmerRecord | undefined {
  return store.farmers.find(f => f.id === farmerId);
}

export function latestObservation(farmerId: string): FieldObservation | undefined {
  return store.observations
    .filter(o => o.farmerId === farmerId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function farmers(): FarmerRecord[] {
  return store.farmers;
}

export function callbacks(): CallbackRequest[] {
  return store.callbacks;
}

/**
 * The farmer's advice request, with the officer's latest field observation taking priority over the
 * farmer's registered details and the default priorities.
 */
export function planRequestForFarmer(farmerId: string, base: PlanOptionsRequest): PlanOptionsRequest {
  const farmer = farmerById(farmerId);
  if (!farmer) return base;
  const obs = latestObservation(farmerId);
  return {
    ...base,
    landType: obs?.landType ?? farmer.landType,
    landTypeAssumed: false,
    currentAmanCrop: obs?.currentAmanCrop ?? farmer.currentAmanCrop,
    farmerPriorities: obs ? { ...obs.priorities } : base.farmerPriorities,
  };
}

export function verificationFor(farmerId: string): OfficerVerification | null {
  const obs = latestObservation(farmerId);
  const officer = obs ? OFFICERS.find(o => o.id === obs.officerId) : undefined;
  if (!obs || !officer) return null;
  return {
    officerId: officer.id,
    officerNameBangla: officer.nameBangla,
    officerNameEnglish: officer.nameEnglish,
    date: obs.date,
    noteBangla: obs.noteBangla,
  };
}

export function requestCallback(farmerId: string, channel: CallbackRequest['channel']): CallbackRequest | null {
  if (!farmerById(farmerId)) return null;
  const open = store.callbacks.find(c => c.farmerId === farmerId && c.status === 'open');
  if (open) return open;
  const request: CallbackRequest = { id: `cb_${Date.now()}_${farmerId}`, farmerId, channel, createdAt: new Date().toISOString(), status: 'open' };
  store.callbacks.push(request);
  save();
  return request;
}

export function resolveCallback(callbackId: string): CallbackRequest | null {
  const request = store.callbacks.find(c => c.id === callbackId);
  if (!request) return null;
  request.status = 'done';
  save();
  return request;
}

/** Validates and stores an officer's field observation; returns an error message instead when invalid. */
export function addObservation(officerId: string, body: any): { observation?: FieldObservation; error?: string } {
  const farmer = farmerById(String(body.farmerId ?? ''));
  if (!farmer) return { error: 'Unknown farmer' };
  if (!LAND_TYPES.includes(body.landType)) return { error: 'landType must be one of ' + LAND_TYPES.join(', ') };
  if (!LOC.aman[body.currentAmanCrop]) return { error: 'currentAmanCrop must be a variety in the research release' };
  if (!IRRIGATION.includes(body.irrigation)) return { error: 'irrigation must be one of ' + IRRIGATION.join(', ') };
  const pestSeen: PestSeen = body.pestSeen in PEST_NAMES ? body.pestSeen : 'none';
  const pestSeverity = pestSeen === 'none' ? null : SEVERITY.includes(body.pestSeverity) ? body.pestSeverity : 'low';
  const note = String(body.noteBangla ?? '').trim().slice(0, 300);
  const banned = FORBIDDEN_TERMS.filter(term => note.includes(term));
  if (banned.length) return { error: `Note contains terms not allowed in farmer messages: ${banned.join(', ')}` };
  const weight = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
  const p = body.priorities ?? {};

  const observation: FieldObservation = {
    id: `obs_${Date.now()}_${farmer.id}`,
    farmerId: farmer.id,
    officerId,
    date: new Date().toISOString(),
    landType: body.landType,
    currentAmanCrop: body.currentAmanCrop,
    irrigation: body.irrigation,
    pestSeen,
    pestSeverity,
    priorities: { water: weight(p.water), income: weight(p.income), soil: weight(p.soil), pest: weight(p.pest) },
    noteBangla: note,
  };
  store.observations.push(observation);
  if (body.resolveCallbacks) {
    store.callbacks.filter(c => c.farmerId === farmer.id && c.status === 'open').forEach(c => { c.status = 'done'; });
  }
  save();
  return { observation };
}

/** Farmers ranked by how much they need the officer now, with the reasons in Bangla and English. */
export function queue(): OfficerQueueItem[] {
  return store.farmers
    .map(farmer => {
      const obs = latestObservation(farmer.id);
      const reasons: OfficerQueueItem['reasons'] = [];
      let score = 0;

      const callback = store.callbacks.find(c => c.farmerId === farmer.id && c.status === 'open');
      if (callback) {
        score += 3;
        reasons.push({ bn: 'কৃষক কর্মকর্তার সাথে কথা বলতে চেয়েছেন (কিপ্যাড ৯)', en: 'Farmer asked for a call back (keypad 9)' });
      }

      const fit = !farmer.crops || farmer.crops.includes('aman') ? thisSeasonFit(obs?.currentAmanCrop ?? farmer.currentAmanCrop) : null;
      if (fit) {
        const pulseOrOil = fit.crops.filter(c => c.cropEnglish === 'Lentil' || c.cropEnglish === 'Mustard');
        if (pulseOrOil.length && pulseOrOil.every(c => !c.fits)) {
          score += 2;
          reasons.push({
            bn: `এ মৌসুমে মসুর ও সরিষার সময় পেরিয়ে যাবে (জমি খালি ~${fit.fieldFreeDateBangla})`,
            en: `Lentil and mustard deadlines will be missed (field free ~${fit.fieldFreeDateEnglish})`,
          });
        }
        if (fit.crops.every(c => !c.fits)) {
          score += 1;
          reasons.push({ bn: 'সময়মতো কোনো রবি ফসল হয় না: দেরিতে বোনা গমে তাপের ঝুঁকি', en: 'No Rabi crop fits on time: late wheat faces heat' });
        }
      }

      if (obs && obs.pestSeen !== 'none') {
        score += obs.pestSeverity === 'high' ? 2 : 1;
        reasons.push({ bn: `মাঠে বালাই: ${PEST_NAMES[obs.pestSeen].bn}`, en: `Pest seen: ${PEST_NAMES[obs.pestSeen].en}` });
      }
      if (!obs) {
        score += 1;
        reasons.push({ bn: 'মাঠ যাচাই বাকি', en: 'Not yet checked in the field' });
      }

      const level: OfficerQueueItem['level'] = score >= 4 ? 'urgent' : score >= 2 ? 'high' : 'normal';
      return { farmerId: farmer.id, score, level, reasons, openCallbackId: callback?.id ?? null };
    })
    .sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ the register behind the advice calls
const text = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function phoneOf(farmerId: string): string | null {
  return store.phones?.[farmerId] ?? null;
}

export function farmerByPhone(phone: string): FarmerRecord | undefined {
  const mobile = bdMobile(phone);
  const id = mobile ? Object.entries(store.phones ?? {}).find(([, p]) => p === mobile)?.[0] : undefined;
  return id ? farmerById(id) : undefined;
}

/** Farmers who agreed to the calls and have not stopped them. */
export function callable(farmer: FarmerRecord): boolean {
  return Boolean(farmer.consent) && !farmer.optedOut;
}

/**
 * Registers a farmer for the advice calls, or returns why not. The farmer's agreement is required: the officer
 * confirms they asked (in person, by phone), or the farmer agreed in the app.
 */
export function registerFarmer(officerId: string, body: any): { farmer?: FarmerRecord; error?: string } {
  const nameBangla = text(body.nameBangla, 60);
  if (!nameBangla) return { error: 'nameBangla is required' };
  const phone = bdMobile(String(body.phone ?? ''));
  if (!phone) return { error: 'phone must be a Bangladeshi mobile number (01XXXXXXXXX)' };
  if (farmerByPhone(phone)) return { error: 'This phone number is already registered' };
  const placeId = String(body.placeId ?? '');
  if (!placeId || !placeFor(placeId)) return { error: 'placeId must be the pilot (talanda_tanore) or an upazila id (ADM3_...)' };
  const unionBangla = text(body.unionBangla, 40);
  if (!unionBangla) return { error: 'unionBangla is required' };
  if (!LAND_TYPES.includes(body.landType)) return { error: 'landType must be one of ' + LAND_TYPES.join(', ') };
  const crops = [...new Set((Array.isArray(body.crops) ? body.crops : String(body.crops ?? '').split(','))
    .map((c: unknown) => String(c).trim()).filter(Boolean))] as string[];
  if (!crops.length || crops.some(c => !REGISTER_CROPS.includes(c))) return { error: `crops must be some of ${REGISTER_CROPS.join(', ')}` };
  const callSlot: CallSlot = CALL_SLOTS.includes(body.callSlot) ? body.callSlot : 'evening';
  if (body.consent !== true || !CONSENT_METHODS.includes(body.consentMethod)) {
    return { error: `The farmer must agree to the calls first: consent true and consentMethod one of ${CONSENT_METHODS.join(', ')}` };
  }
  const villageBangla = text(body.villageBangla, 60);
  const banned = FORBIDDEN_TERMS.filter(term => `${nameBangla} ${villageBangla} ${unionBangla}`.includes(term));
  if (banned.length) return { error: `Contains terms not allowed in farmer messages: ${banned.join(', ')}` };
  const next = Math.max(0, ...store.farmers.map(f => Number(f.id.replace(/\D/g, '')) || 0)) + 1;
  const now = new Date().toISOString();
  const farmer: FarmerRecord = {
    id: `F${String(next).padStart(2, '0')}`,
    nameBangla,
    nameEnglish: text(body.nameEnglish, 60) || nameBangla,
    villageBangla,
    villageEnglish: text(body.villageEnglish, 60) || villageBangla,
    phoneMasked: `${phone.slice(0, 3)}XX-XXX${phone.slice(-3)}`,
    landType: body.landType,
    currentAmanCrop: LOC.aman[body.currentAmanCrop] ? body.currentAmanCrop : 'BRRI dhan49',
    irrigation: IRRIGATION.includes(body.irrigation) ? body.irrigation : 'shallow_tube_well',
    sample: false,
    placeId,
    unionBangla,
    unionEnglish: text(body.unionEnglish, 40) || unionBangla,
    crops,
    callSlot,
    consent: { date: now, takenBy: officerId, method: body.consentMethod },
    optedOut: null,
    registeredAt: now,
    registeredBy: officerId,
  };
  store.farmers.push(farmer);
  store.phones![farmer.id] = phone;
  save();
  return { farmer };
}

/** Stops a farmer's calls (they told the officer), or starts them again with fresh consent. */
export function setCalls(officerId: string, farmerId: string, on: boolean, how: string): FarmerRecord | null {
  const farmer = farmerById(farmerId);
  if (!farmer) return null;
  const now = new Date().toISOString();
  if (on) {
    farmer.optedOut = null;
    farmer.consent = { date: now, takenBy: officerId, method: CONSENT_METHODS.includes(how as FarmerConsent['method']) ? how as FarmerConsent['method'] : 'in_person' };
  } else {
    farmer.optedOut = { date: now, how: text(how, 40) || 'told the officer' };
  }
  save();
  return farmer;
}
