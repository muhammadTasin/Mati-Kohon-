/**
 * The advice a farmer gets, shared by the HTTP server, the farmer call planner and the command-line tools: the
 * engine request for a place (with today's NASA reading there), the engine's advice with its checked Bangla script,
 * and a farmer's sentence turned into both.
 */
import type { AdviceJSON } from '@project-eden/contracts';
import type { PlanOptionsRequest } from '../../../packages/rotation-engine/src/engine.ts';
import { RotationEngine } from '../../../packages/rotation-engine/src/engine.ts';
import { FeatureRegistry } from '../../../packages/rotation-engine/src/registry.ts';
import { placeFor } from '../../../packages/rotation-engine/src/data/location.ts';
import { TemplateNarrator } from '../../../packages/narration-core/src/template_narrator.ts';
import * as desk from './officer_desk.ts';
import { floodFor, liveUpazila } from './live.ts';
import { replyFor, requestFromWords, understand } from './voice.ts';

const featureRegistry = new FeatureRegistry();
export const rotationEngine = new RotationEngine(featureRegistry);
const templateNarrator = new TemplateNarrator();

export const DEFAULT_PRIORITIES = { water: 0.5, income: 0.3, soil: 0.2 };
/** Crops a request names: an array of ids, or one comma-separated string ('sunflower,lentil'). */
export function cropList(value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const ids = list.map(v => String(v).trim().toLowerCase()).filter(Boolean);
  return ids.length ? ids : undefined;
}

/** Today's NASA reading at a place from the daily live file, in the shape the engine takes; null without one. */
export function currentConditionsFor(place: ReturnType<typeof placeFor>): PlanOptionsRequest['currentConditions'] {
  if (!place) return undefined;
  const live = liveUpazila({ id: place.kind === 'pilot' ? 'ADM3_Tanore' : place.id });
  // NASA SMAP's root-zone percentile when it is less than a week old and defined here; NASA POWER otherwise
  const sm = live?.smap;
  if (sm && ['dry', 'normal', 'wet'].includes(sm.status) && (live!.ageDays.smap ?? 99) <= 7) {
    return {
      date: sm.date,
      soilStatus: sm.status,
      soilPercentile: sm.rootzonePctl,
      sensor: 'SMAP',
      rain30PctOfNormal: live!.power?.rain30PctOfNormal ?? null,
      disease: live!.disease ?? null,
      field: live!.field ?? null,
      flood: floodFor(live!.id),
      source: 'NASA SMAP L4 root-zone soil moisture percentile, 9 km (research/live/smap_now.py); rain from NASA POWER',
    };
  }
  if (!live?.power?.soilStatus) return undefined;
  return {
    sensor: 'POWER',
    date: live.power.date,
    soilStatus: live.power.soilStatus,
    soilRank: live.power.soilRank ?? null,
    soilYears: live.power.soilYears ?? null,
    rain30PctOfNormal: live.power.rain30PctOfNormal ?? null,
    disease: live.disease ?? null,
    field: live.field ?? null,
    flood: floodFor(live.id),
    source: 'NASA POWER daily, ranked against the same date in past years (research/live/daily_update.py)',
  };
}

export function planRequest(body: any): PlanOptionsRequest {
  const place = placeFor(body.unionId || 'talanda_tanore');
  return {
    unionId: body.unionId || 'talanda_tanore',
    unionNameBangla: body.unionNameBangla || place?.nameBangla || 'তালন্দ ইউনিয়ন',
    upazila: body.upazila || place?.upazila || 'Tanore',
    district: body.district || place?.district || 'Rajshahi',
    // The farmer's land type when given; else the place's usual land (NASA NASADEM, Landsat and BRRI's survey)
    landType: body.landType || place?.defaultLandType || 'medium_high',
    landTypeAssumed: !body.landType,
    irrigation: body.irrigation === 'none' ? 'none' : undefined,
    currentConditions: body.currentConditions ?? currentConditionsFor(place),
    season: body.season || '2026-aman',
    currentAmanCrop: body.currentAmanCrop,
    preferredCrops: cropList(body.preferredCrops),
    heroCrop: typeof body.heroCrop === 'string' && body.heroCrop.trim() ? body.heroCrop.trim().toLowerCase() : undefined,
    avoidCrops: cropList(body.avoidCrops),
    farmerPriorities: body.farmerPriorities || DEFAULT_PRIORITIES,
    defaultPriorities: !body.farmerPriorities,
    currentRotation: currentRotationOf(body.currentRotation),
    constraints: constraintsOf(body.constraints),
    scenario: scenarioOf(body.scenario),
  };
}

const CROP_ID = /^[a-z_]{2,20}$/;
/** The farmer's rotation now ({ monsoon, winter, summer } crop ids), or undefined when it is missing or malformed. */
function currentRotationOf(value: any): PlanOptionsRequest['currentRotation'] {
  if (!value || typeof value !== 'object') return undefined;
  const id = (v: unknown) => (typeof v === 'string' && CROP_ID.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : undefined);
  const winter = id(value.winter);
  return winter ? { monsoon: id(value.monsoon) ?? 'aman', winter, summer: id(value.summer) ?? null } : undefined;
}

function constraintsOf(value: any): PlanOptionsRequest['constraints'] {
  if (!value || typeof value !== 'object') return undefined;
  const machinery = ['hand', 'hire', 'own'].includes(value.machinery) ? value.machinery : undefined;
  const market = ['village', 'town'].includes(value.market) ? value.market : undefined;
  return machinery || market ? { machinery, market } : undefined;
}

/** A what-if year: rain -20..20 per cent, warming 0..3 C; numbers outside are clamped. */
function scenarioOf(value: any): PlanOptionsRequest['scenario'] {
  if (!value || typeof value !== 'object') return undefined;
  const num = (v: unknown, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : 0);
  const rainPct = num(value.rainPct, -20, 20);
  const warmingC = num(value.warmingC, 0, 3);
  return rainPct || warmingC ? { rainPct, warmingC } : undefined;
}

/**
 * A farmer's sentence (typed, or from speech-to-text) -> the engine's plan for it -> the Bangla call script and SMS.
 * What the sentence names overrides the request's crops, land type and priorities.
 */
export function voiceAnswer(body: any) {
  const heard = understand(String(body.text ?? ''));
  const words = requestFromWords(heard);
  const request = planRequest({
    ...body,
    ...words,
    ...(words.heroCrop ? { preferredCrops: words.preferredCrops ?? [] } : {}),
    avoidCrops: [...(words.avoidCrops ?? []), ...(cropList(body.avoidCrops) ?? [])],
  });
  const advice = adviseWithNarration(request, body.farmerId);
  return {
    understood: heard,
    request: { unionId: request.unionId, heroCrop: request.heroCrop ?? null, preferredCrops: request.preferredCrops ?? [], avoidCrops: request.avoidCrops ?? [], landType: request.landType, irrigation: request.irrigation ?? 'available', farmerPriorities: request.farmerPriorities },
    reply: replyFor(advice, heard),
    advice,
  };
}

/**
 * Engine advice plus the checked spoken script for the phone app's cached card. With a farmer ID, the Krishi
 * officer's latest field observation takes priority over the request's land type, Aman variety and priorities.
 */
export function adviseWithNarration(request: PlanOptionsRequest, farmerId?: string): AdviceJSON {
  const advice = rotationEngine.generateAdvice(farmerId ? desk.planRequestForFarmer(farmerId, request) : request);
  if (farmerId) advice.verification = desk.verificationFor(farmerId);
  if (advice.farmer_card) {
    const narration = templateNarrator.render(advice, advice.options[0]);
    advice.farmer_card.audioScriptBangla = narration.banglaSpeechText;
    advice.farmer_card.audioDurationSeconds = narration.durationSecondsEstimate;
  }
  return advice;
}

