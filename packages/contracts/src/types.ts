/**
 * Project EDEN — Shared Contracts & Data Types
 * Deterministic crop rotation engine, multi-objective ranking, and anti-hallucination narration.
 */

export type LandType = 'high' | 'medium_high' | 'medium_low' | 'low' | 'very_low';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

export interface DataProvenance {
  source: string;
  timePeriod: string;
  spatialResolution: string;
  measuredOrModeled: 'measured' | 'modeled' | 'assumed';
  notesBangla?: string;
}

export interface DimensionScoreResult {
  dimensionId: string;
  score: number; // 0.0 to 1.0 (higher = better outcome)
  confidence: ConfidenceLevel;
  summaryBangla: string;
  summaryEnglish: string;
  metrics: Record<string, number | string | boolean>;
  provenance: DataProvenance;
  staleOrMissing?: boolean;
}

export interface EvaluationContext {
  unionId: string;
  upazilaId: string;
  districtId: string;
  landType: LandType;
  seasonYear: number;
  rotationId: string;
  crops: Array<{
    season: 'Aman' | 'Kharif-2' | 'Rabi' | 'Kharif-1'; // explicit, so plugins never guess the crop from its name
    cropName: string;
    variety: string;
    sowingDate: string; // ISO format or relative
    harvestDate: string;
    durationDays: number;
  }>;
  farmerPriorities: Record<string, number>;
}

export interface IEvidenceDimensionPlugin {
  readonly id: string; // 'water' | 'heat' | 'flood' | 'soil' | 'fodder' | 'income'
  readonly displayNameBangla: string;
  readonly displayNameEnglish: string;
  readonly version: string;
  readonly isEnabled: boolean;

  evaluate(context: EvaluationContext): Promise<DimensionScoreResult> | DimensionScoreResult;
  explain(result: DimensionScoreResult): {
    banglaBullets: string[];
    englishBullets: string[];
  };
}

export interface CropPhase {
  crop: string;
  cropBangla?: string;
  variety: string;
  varietyBangla?: string;
  seasonType: 'Aman' | 'Kharif-2' | 'Rabi' | 'Aus' | 'Pre-Kharif';
  fallow?: boolean; // the monsoon slot left empty (no rice and no other crop)
  sowingWindow: string;
  harvestWindow: string;
  durationDays: number;
  daysToFieldFree: number;
  sowingBangla?: string; // the date this crop goes in the field in this option ('১০ নভেম্বর')
  harvestBangla?: string;
}

export interface MonthTimelineSlot {
  monthNameBangla: string;
  monthNameEnglish: string;
  status: 'occupied' | 'transplanting' | 'harvesting' | 'fallow_available';
  cropName?: string;
  cropNameEnglish?: string;
}

export interface CandidateRotation {
  id: string;
  nameBangla: string;
  nameEnglish: string;
  isBaseline: boolean;
  currentPractice?: boolean; // what most farmers at the place grow now (BRRI's 2014-15 survey), shown for comparison
  cropSequence: CropPhase[];
  scores: Record<string, number>; // Dimension ID -> normalized score (0.0 - 1.0)
  dimensionDetails: Record<string, DimensionScoreResult>;
  totalWeightedScore: number;
  rank: number;
  timeline: MonthTimelineSlot[];
  approvedActionIds: string[];
  approvedActionBangla: string[];
  approvedActionEnglish?: string[];
  fieldFreeDateBangla: string; // e.g. "১০ নভেম্বর"
  fieldFreeDateEnglish?: string; // e.g. "10 Nov"
  ipmActions?: IpmTip[];
  ledger?: EnvironmentLedger;
  stewardship?: StewardshipTip[]; // soil-and-water tips: what the rotation saves and what to watch for
  /** The rotation the farmer said they grow now: always shown, so every other option is read against it. */
  farmerCurrent?: boolean;
  /** Crop ids in field order (data/crop_choice.ts ids, 'aman' for Aman rice). */
  cropIds?: string[];
  /** When the crops meet heat, cold and heavy rain, and when the soil lies bare, from the place's NASA calendar. */
  seasonRisk?: SeasonRisk | null;
  /** Why it was suggested, its evidence, benefits, information gaps and the risks to check locally. */
  review?: OptionReview;
}

/** One line of text in both languages, with where it comes from when it carries a number. */
export interface ReviewLine {
  bn: string;
  en: string;
  source?: string;
}

/**
 * Field Shift asks, for every rotation compared: why it was suggested, what evidence supports it, what benefits it
 * may offer, where information gaps exist, and the risks that need local review by farmers or agricultural experts.
 */
export interface OptionReview {
  /** The option it is compared with: the farmer's own rotation, else what most farmers grow here, else Boro. */
  referenceId: string | null;
  why: ReviewLine[];
  evidence: ReviewLine[];
  benefits: ReviewLine[];
  gaps: ReviewLine[];
  checks: ReviewLine[];
  /** Crop roles in this rotation: nitrogen-fixing, deep-rooting, drought-tolerant, soil cover, fodder. */
  roles: Array<{ id: CropRoleId; cropIds: string[] }>;
  /** Clashes with what the farmer said they cannot do (machinery, market). */
  constraintFlags: ReviewLine[];
}

export type CropRoleId = 'nitrogen' | 'deep_root' | 'drought' | 'cover' | 'fodder';

/** One month of the crop year (July to June) at this place, for this rotation. */
export interface SeasonRiskMonth {
  month: number; // 0 = January
  /** Share of the month the field holds a crop (0-1), and which crop holds most of it. */
  cropShare: number;
  cropId: string | null;
  /** Average days a year in this month (NASA POWER with station correction, GPM IMERG; seasons 2001-2025). */
  hotDays: number;
  coldNights: number;
  heavyRainDays: number;
  erosiveRainDays: number;
  dryDays: number;
  rootWet: number;
  /** The satellite's median greenness here (NASA MODIS NDVI, 2021-25), or null. */
  ndvi: number | null;
  /** The hazards that matter this month for what is in the field: 'heat', 'cold', 'heavy_rain', 'bare_rain', 'dry'. */
  flags: string[];
}

export interface SeasonRisk {
  months: SeasonRiskMonth[];
  /** Days a year with no crop in the field, and the erosive (23 mm or more) and heavy (44 mm or more) rain days on them. */
  bareDays: number;
  bareErosiveRainDays: number;
  bareHeavyRainDays: number;
  /** Per crop: the hazard days it meets while in the field, on average. */
  crops: Array<{
    id: string;
    cropBangla: string;
    cropEnglish: string;
    hotDays: number;
    coldNights: number;
    heavyRainDays: number;
    /** Calendar months (0 = January) when this crop meets one of the month flags. */
    months: number[];
    /** The replay's net irrigation and crop water use for this crop here (mm), for the what-if. */
    irrigationMm: number;
    cropWaterUseMm: number | null;
    /** Rain while the crop is in the field, on average (mm). */
    rainMm: number;
  }>;
  source: string;
}

/** A rough what-if on the replay's numbers: the same rotations with a drier or wetter, and warmer, year. */
export interface WhatIfResult {
  rainPct: number;
  warmingC: number;
  method: string;
  options: Array<{
    id: string;
    /** Net irrigation of the dry-season and summer crops, mm a year (Aman's rescue water needs the daily replay). */
    irrigationMm: number;
    irrigationMmScenario: number;
    /** Days of 36 C or more while a crop is in the field. */
    hotDaysInField: number;
    hotDaysInFieldScenario: number;
    bareErosiveRainDays: number;
    bareErosiveRainDaysScenario: number;
  }>;
}

/** The place's NASA season calendar (research/explore/season_calendar.py), for the timeline and the map. */
export interface SeasonCalendarSummary {
  place: string;
  placeBangla: string;
  station: string | null;
  seasons: string;
  thresholds: Record<string, number>;
  months: Record<string, number[]>;
  greenness: { recent: Array<number | null>; early: Array<number | null> } | null;
  trends: Array<{ id: string; early: number; recent: number; change: number; slopePerDecade: number; p: number; clear: boolean }>;
  trendPeriods: { early: string; recent: string };
  source: string;
  /** NASA ECOSTRESS (70 m) around the pilot in the dry season: water use and stress by month (pilot only). */
  ecostress?: {
    source: string;
    years: string;
    thresholds: Record<string, number>;
    monthly: Record<string, { overpasses: number; etMedian: number; esiMedian: number; wetShare: number; stressedShare: number }>;
    overpasses: number;
  } | null;
}

/** One soil-and-water tip beside a rotation, with its numbers from the plan's own records and its source. */
export interface StewardshipTip {
  kind: 'water' | 'fertilizer' | 'pesticide' | 'soil' | 'metals';
  bn: string;
  en: string;
  source: string;
}

/** What a rotation takes from the land in one year (the research's environment ledger method). */
export interface EnvironmentLedger {
  groundwaterPumpedM3PerHa: number;
  floodedRiceDays: number; // transplanting to two weeks before harvest: a methane proxy, not a measurement
  /** Urea for the whole rotation; null where the place has no SRDI soil card (no fertilizer amount is given there). */
  ureaKgHa: number | null;
  legume: boolean;
  bareDays: number; // days in the year with no crop in the field
}

/** One integrated pest management step: non-chemical first, sprays only on the officer's advice. */
export interface IpmTip {
  bn: string;
  en: string;
  source: string;
  /** The tip cites or depends on the SRDI soil card, so it is not given at a place that has none. */
  needsSoilCard?: boolean;
}

export interface AdviceJSON {
  schema_version: '1.0';
  advice_id: string;
  created_at: string;
  scope: {
    union_id: string;
    union_name_bangla: string;
    upazila: string;
    district: string;
    land_type: LandType;
    season: string;
  };
  data_release: string;
  farmer_priorities: Record<string, number>;
  active_plugins: string[];
  options: CandidateRotation[];
  stale_or_missing_inputs: Array<{
    dataset: string;
    issue: string;
    affectedDimension: string;
  }>;
  farmer_summary_bangla: string;
  farmer_summary_english?: string;
  saao_technical_notes: string;
  verification?: OfficerVerification | null;
  release?: { id: string; generatedOn: string; researchCommit: string };
  this_season?: ThisSeasonFit | null;
  this_season_option_id?: string | null; // best option that starts from the Aman already in the field
  farmer_card?: FarmerCard;
  crop_choice?: CropChoiceResult | null; // set when the farmer named the crops they want
  local_context?: LocalContext; // the place's land type, what farmers grow there now, and its local hazards
  /** The option every other one is compared with (the farmer's own rotation when they gave it). */
  reference_option_id?: string | null;
  /** Why the farmer's own rotation could not be shown, when it could not. */
  current_rotation_note?: { bn: string; en: string } | null;
  season_calendar?: SeasonCalendarSummary | null;
  what_if?: WhatIfResult | null;
  /** The tool supports, and does not replace, the farmer's judgment and the officer's local knowledge. */
  disclaimer?: { bn: string; en: string };
}

/** What the engine knows about the place beyond the weather replay, and the notes that follow from it. */
export interface LocalContext {
  landType: LandType;
  landTypeAssumed: boolean; // true when the land type is the place's default, not the farmer's word
  landEvidenceBangla: string;
  landEvidenceEnglish: string;
  patterns: Array<{ pattern: string; patternBangla: string; pctOfCroppedLand: number }>;
  patternsSource: string | null;
  croppingIntensityPct: number | null;
  hazards: string[]; // 'deep_flooding', 'flash_flood', 'submergence', 'winter_fallow_salinity', 'dry_start'
  /** One alert per hazard, the most serious first (flash floods, then salinity, a dry start, deep water, submergence). */
  alerts: Array<{ hazard: string; titleBangla: string; titleEnglish: string; textBangla: string; textEnglish: string }>;
  notesBangla: string[];
  notesEnglish: string[];
  /** This week's NASA rice-blast and late-blight weather, and whether each matters to the first option's crops. */
  diseaseWeather?: { date: string; rules: Array<{ id: string; nameBangla: string; nameEnglish: string; status: string; days7: number; season: string | null; typicalDays: number | null; relevant: boolean }>; method: string } | null;
  /** The district's groundwater budget: Boro land to move to a water-saving rotation to stop the GRACE-scale fall. */
  groundwaterBudget?: (Record<string, unknown> & { district: string; applies: boolean; trendMmPerYear: number; moveHaToLentil: number | null; moveShareToLentil: number | null; source: string; caution: string }) | null;
  /**
   * This week in the field (rotation-engine field_alerts.ts): a dry spell at Aman flowering, heat at rice flowering or
   * wheat grain filling, cold on Boro seedbeds and AWD in Boro, from the daily NASA update and a 7-day forecast.
   */
  fieldAlerts?: {
    through: string | null;
    observedTo: string | null;
    forecastFrom: string | null;
    rainSource: string | null;
    floodDate?: string | null; // the flood reading's date, when there is one
    floodSensor?: 'opera' | 'nisar' | null; // NASA OPERA (optical) or NASA-ISRO NISAR (radar), whichever is newer
    /** This season's drainage since the peak (research/live/nisar_water.py): points lost a week and the free-by date. */
    drain?: {
      from: { date: string; floodShare: number; sensor: 'opera' | 'nisar' };
      to: { date: string; floodShare: number; sensor: 'opera' | 'nisar' };
      perWeek: number | null;
      freeBy: string | null;
    } | null;
    alerts: Array<{ id: string; level: 'high' | 'watch' | 'advice' | 'clear'; crop: string; titleBangla: string; titleEnglish: string; textBangla: string; textEnglish: string; smsBangla: string; numbers: Record<string, number | string | null> }>;
    method: Record<string, string>;
  } | null;
}

/** How the crops a farmer asked for fit the year at their place, and what else fits the gap before Aman. */
export interface CropChoiceResult {
  requested: Array<{ id: string; cropBangla: string; cropEnglish: string; season: 'Kharif-2' | 'Rabi' | 'Kharif-1' }>;
  notModelled: Array<{ id: string; bn: string; en: string }>;
  fits: Array<{
    id: string;
    cropBangla: string;
    cropEnglish: string;
    season: 'Kharif-2' | 'Rabi' | 'Kharif-1';
    fits: boolean;
    bestOptionId: string | null;
    sowingBangla: string | null;
    sowingEnglish: string | null;
    harvestBangla: string | null;
    harvestEnglish: string | null;
    netIrrigationMm: number | null;
    reasonBangla: string | null;
    reasonEnglish: string | null;
  }>;
  coverage: Array<{ optionId: string; cropIds: string[] }>; // which asked crops each option holds
  gapFillers: Array<{ id: string; cropBangla: string; cropEnglish: string; sowingBangla: string; sowingEnglish: string; harvestBangla: string; harvestEnglish: string; netIrrigationMm: number }>;
  notesBangla: string[];
  notesEnglish: string[];
  heroCrop: string | null; // the farmer's main crop, held by every option
  avoided: string[]; // crop ids left out at the farmer's word ('aman', 'boro', 'aus' for rice)
}

/** What still fits this season if a given Aman variety is already in the field. */
export interface ThisSeasonFit {
  currentAmanVariety: string;
  fieldFreeDateBangla: string;
  fieldFreeDateEnglish: string;
  crops: Array<{ cropBangla: string; cropEnglish: string; sowingDeadlineBangla: string; sowingDeadlineEnglish: string; fits: boolean }>;
  noteBangla: string;
  noteEnglish: string;
}

/** Set when a Krishi officer's field observation shaped this advice. */
export interface OfficerVerification {
  officerId: string;
  officerNameBangla: string;
  officerNameEnglish: string;
  date: string;
  noteBangla: string;
}

/** Ready-to-show Bangla text for the farmer app's cached advice card (one per advice, top option first). */
export interface FarmerCard {
  rotationTitleBangla: string;
  rotationSubtitleBangla: string;
  season1: { name: string; variety: string; windowBangla: string; stageBangla: string; irrigationBangla: string };
  season2: { name: string; variety: string; windowBangla: string; notesBangla: string; fertilizerBangla: string; fertilizerEnglish?: string };
  alternative: { name: string; categoryBangla: string; sowingBangla: string; yieldBangla: string; noteBangla: string; marketPriceBangla: string };
  narrativeBangla: string;
  provenanceBangla: string;
  audioScriptBangla: string;
  audioDurationSeconds: number;
}

export interface FarmerProfile {
  id: string;
  name: string;
  phone: string;
  unionId: string;
  landType: LandType;
  primaryWaterSource: 'rainfed' | 'shallow_tube_well' | 'deep_tube_well' | 'canal';
  hasLivestock: boolean;
  priorities: {
    water: number;
    income: number;
    soil: number;
    fodder: number;
  };
  keypadSelection?: string; // "1" for water, "2" for income, "3" for soil
  consentGiven: boolean;
}

export interface NarrationAuditLog {
  gate1Passed: boolean;
  gate2Passed: boolean;
  tokenDiffOk: boolean;
  unapprovedNumbersFound: string[];
  unapprovedActionsFound: string[];
  latencyMs: number;
  engineUsed: 'verified_template' | 'local_model_checked' | 'fallback_template';
}

export interface NarrationResult {
  status: 'verified_template' | 'local_model_checked' | 'fallback_template';
  banglaSpeechText: string;
  englishGloss?: string; // translation for reviewers; farmers hear the Bangla
  banglaKeypadPrompt: string;
  durationSecondsEstimate: number;
  auditLog: NarrationAuditLog;
}

// ---------------------------------------------------------------------------
// Krishi officer (SAAO) desk: officers describe farmers' fields, and their observations take priority.
// ---------------------------------------------------------------------------

export type PestSeen = 'none' | 'stem_borer' | 'bph' | 'aphid' | 'blast' | 'other';

export interface FieldObservation {
  id: string;
  farmerId: string;
  officerId: string;
  date: string; // ISO timestamp
  landType: LandType;
  currentAmanCrop: string; // e.g. 'BRRI dhan49'
  irrigation: 'rainfed' | 'shallow_tube_well' | 'deep_tube_well';
  pestSeen: PestSeen;
  pestSeverity: 'low' | 'medium' | 'high' | null;
  priorities: { water: number; income: number; soil: number; pest: number };
  noteBangla: string;
}

export interface FarmerRecord {
  id: string;
  nameBangla: string;
  nameEnglish: string;
  villageBangla: string;
  villageEnglish: string;
  phoneMasked: string;
  landType: LandType;
  currentAmanCrop: string;
  irrigation: FieldObservation['irrigation'];
  sample: boolean;
  /** Where the farm is: an upazila id (ADM3_...) or the pilot union; the pilot when not given. */
  placeId?: string;
  unionBangla?: string;
  unionEnglish?: string;
  /** This year's crops ('aman' and crop-menu ids such as 'boro', 'lentil', 'mustard'): who hears which reminder. */
  crops?: string[];
  callSlot?: CallSlot;
  /** No consent, no calls. */
  consent?: FarmerConsent | null;
  optedOut?: { date: string; how: string } | null;
  registeredAt?: string;
  registeredBy?: string;
  /** The manager site (app_metadata.site) this farmer belongs to; records written before sites existed count as 'talanda'. */
  site?: string;
}

// ---------------------------------------------------------------------------
// Farmer calls: the register's farmers get one-way advice calls; questions come back through the SAAO.
// ---------------------------------------------------------------------------

export type CallSlot = 'morning' | 'afternoon' | 'evening';

export interface FarmerConsent {
  date: string; // ISO timestamp
  takenBy: string; // officer id
  method: 'in_person' | 'phone' | 'app' | 'sample';
}

/** A farmer's question, brought by the SAAO (in person, by phone), a missed call or the app; answered by a call. */
export interface FarmerQuestion {
  id: string;
  farmerId: string;
  askedAt: string;
  channel: 'in_person' | 'phone' | 'missed_call' | 'app';
  textBangla: string;
  /** The engine's draft when it understood the question (crops, land, priorities); empty when the officer must write it. */
  draftBangla: string;
  answerBangla: string | null;
  status: 'open' | 'answered' | 'called';
  takenBy: string | null;
  callId: string | null;
}

export type PlannedCallKind = 'answer' | 'alert' | 'drain' | 'reminder';
export type PlannedCallStatus = 'proposed' | 'approved' | 'removed' | 'sent' | 'retry' | 'unreached';

export interface CallAttempt {
  at: string;
  route: string;
  dryRun: boolean;
  /** The provider's id for the call (VoiceBlast audio id, Broadcast blast id). */
  ref: string | null;
  outcome: 'answered' | 'unanswered' | 'failed' | 'dry_run' | 'pending';
  note: string | null;
}

/** One call on a day's list: proposed by the planner, approved or removed by the SAAO, then sent and followed up. */
export interface PlannedCall {
  id: string;
  date: string; // YYYY-MM-DD
  farmerId: string;
  kind: PlannedCallKind;
  /** Never sent twice to one farmer (the rule, the reading or season, and the farmer's question). */
  key: string;
  /** At most one call on a topic a week, unless it is an emergency. */
  topic: string;
  level: 'high' | 'watch' | 'advice';
  emergency: boolean;
  titleBangla: string;
  titleEnglish: string;
  /** Why this farmer gets this call, for the officer. */
  whyBangla: string;
  whyEnglish: string;
  scriptBangla: string;
  smsBangla: string;
  durationSeconds: number;
  slot: CallSlot;
  status: PlannedCallStatus;
  edited: boolean;
  approvedBy: string | null;
  attempts: CallAttempt[];
  sms: { at: string; dryRun: boolean; error: string | null } | null;
  questionId: string | null;
}

export interface CallbackRequest {
  id: string;
  farmerId: string;
  channel: 'ivr_keypad_9' | 'app';
  createdAt: string;
  status: 'open' | 'done';
}

export interface OfficerQueueItem {
  farmerId: string;
  score: number;
  level: 'urgent' | 'high' | 'normal';
  reasons: Array<{ bn: string; en: string }>;
  openCallbackId: string | null;
}
