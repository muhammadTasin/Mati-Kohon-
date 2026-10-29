/**
 * What each crop does for the soil and what it needs beyond the field: the crop roles Field Shift asks a tool to
 * explain (nitrogen-fixing, deep-rooting, drought-hardy, soil cover, fodder) and the local things a plan depends on
 * (machines, buyers, storage, seed, labour, water) that a farmer or officer must check before switching.
 *
 * Rooting depth: FAO Irrigation and Drainage Paper 56, Table 22 (maximum effective rooting depth, m). A crop counts as
 * deep-rooting at 1.5 m or more at the top of its range: it reaches water and nutrients below a rice plough pan.
 * Drought-hardy is decided per place from the replay (under 100 mm of net irrigation here), not from a label.
 * The needs are common Bangladesh agronomy (BARI Krishi Projukti Hatboi; DAE extension notes) written as things to
 * check locally, not as facts about a farm.
 */
import type { CropRoleId } from '@project-eden/contracts';

export interface CropTraits {
  /** FAO-56 Table 22 maximum effective rooting depth, metres [low, high]; null where the table has no entry. */
  rootDepthM: [number, number] | null;
  /** Kharif-1 crops stand in the field through the pre-monsoon storms, when bare soil washes away. */
  coversPreMonsoon?: boolean;
  /** Its plants can be ploughed in as green manure after the harvest. */
  greenManure?: boolean;
  /** Needs a machine a farmer may not have (a thresher, a sheller). */
  machine?: [string, string];
  /** Sells mainly through a town market, a mill or a contract buyer, not the village market. */
  townMarket?: [string, string];
  storage?: [string, string];
  seed?: [string, string];
  labour?: [string, string];
  water?: [string, string];
  risk?: [string, string];
}

const FAO56 = 'FAO-56 Table 22 rooting depth';
export const TRAITS_SOURCE = `${FAO56}; BARI Krishi Projukti Hatboi and DAE extension notes (to check locally)`;

export const CROP_TRAITS: Record<string, CropTraits> = {
  aman: { rootDepthM: [0.5, 1.0] },
  boro: {
    rootDepthM: [0.5, 1.0],
    water: ['নিশ্চিত সেচ (নলকূপ বা পাম্প) ও সেচের খরচ, সারা মৌসুম', 'assured irrigation (tube well or pump) and its fees all season'],
    labour: ['চারা রোপণ ও ধান কাটায় অনেক শ্রমিক', 'many hands for transplanting and harvest'],
  },
  boro_early: {
    rootDepthM: [0.5, 1.0],
    water: ['নিশ্চিত সেচ (নলকূপ বা পাম্প) ও সেচের খরচ', 'assured irrigation (tube well or pump) and its fees'],
    seed: ['ব্রি ধান৮৮-এর বীজ', 'seed of BRRI dhan88'],
  },
  aus: { rootDepthM: [0.5, 1.0], coversPreMonsoon: true, water: ['শুরুতে বৃষ্টি না হলে একটি-দুটি সেচ', 'one or two irrigations if the early rain fails'] },
  lentil: { rootDepthM: [0.6, 0.8], seed: ['বারি মসুর-৮-এর বীজ (BADC বা কৃষি অফিস)', 'seed of BARI Masur-8 (BADC or the agriculture office)'] },
  mustard: { rootDepthM: [1.0, 2.0] },
  wheat: {
    rootDepthM: [1.0, 1.5],
    machine: ['মাড়াই যন্ত্র (থ্রেশার) ভাড়া', 'a thresher to hire'],
    seed: ['বারি গম ৩৩-এর বীজ (BADC বা কৃষি অফিস)', 'seed of BARI Gom 33 (BADC or the agriculture office)'],
  },
  potato: {
    rootDepthM: [0.4, 0.6],
    storage: ['হিমাগারে জায়গা, না হলে কাটার সময়ই কম দামে বিক্রি', 'cold-store space, or selling at the low harvest price'],
    seed: ['ভালো বীজ আলু, খরচ বেশি', 'good seed potatoes, a large cost'],
    townMarket: ['দাম ওঠানামা বেশি; শহরের পাইকার বা হিমাগারের মাধ্যমে বিক্রি', 'prices swing; sold through town traders or the cold store'],
  },
  maize: {
    rootDepthM: [1.0, 1.7],
    machine: ['ভুট্টা ছাড়ানোর যন্ত্র (শেলার) ও শুকানোর জায়গা', 'a sheller and space to dry the grain'],
    townMarket: ['ক্রেতা মূলত পশুখাদ্য কারখানার ব্যাপারী', 'buyers are mostly feed-mill traders'],
  },
  sunflower: {
    rootDepthM: [0.8, 1.5],
    townMarket: ['সূর্যমুখীর বীজ ভাঙানোর মিল সব এলাকায় নেই', 'not every area has a mill that presses sunflower seed'],
    risk: ['পাকার সময় টিয়া ও পাখির ক্ষতি', 'parrots and other birds at ripening'],
  },
  sunflower_kharif: {
    rootDepthM: [0.8, 1.5],
    coversPreMonsoon: true,
    townMarket: ['সূর্যমুখীর বীজ ভাঙানোর মিল সব এলাকায় নেই', 'not every area has a mill that presses sunflower seed'],
  },
  chickpea: { rootDepthM: [0.6, 1.0], risk: ['ফল ছিদ্রকারী পোকা (পড বোরার)', 'pod borer'] },
  grasspea: { rootDepthM: null, risk: ['আমন কাটার আগে ভেজা মাটিতে ছিটিয়ে বুনতে হয়', 'it is broadcast into the standing Aman while the soil is wet'] },
  sweetpotato: { rootDepthM: [1.0, 1.5] },
  barley: { rootDepthM: [1.0, 1.5], townMarket: ['যবের ক্রেতা কম', 'few buyers for barley'] },
  soybean: { rootDepthM: [0.6, 1.3], townMarket: ['ক্রেতা মূলত পশুখাদ্য কারখানা; বেশিরভাগ এলাকায় বাজার ছোট', 'buyers are mostly feed mills; small markets in most areas'] },
  soybean_k2: { rootDepthM: [0.6, 1.3], townMarket: ['ক্রেতা মূলত পশুখাদ্য কারখানা; বেশিরভাগ এলাকায় বাজার ছোট', 'buyers are mostly feed mills; small markets in most areas'] },
  mungbean: {
    rootDepthM: [0.6, 0.9],
    coversPreMonsoon: true,
    greenManure: true,
    labour: ['শুঁটি ২–৩ বার তুলতে হয়', 'pods are picked two or three times'],
  },
  mungbean_k2: { rootDepthM: [0.6, 0.9], labour: ['শুঁটি ২–৩ বার তুলতে হয়', 'pods are picked two or three times'] },
  sesame: { rootDepthM: [1.0, 1.5], coversPreMonsoon: true, risk: ['জমিতে পানি জমলে গাছ মরে যায়', 'standing water kills it'] },
  sesame_k2: { rootDepthM: [1.0, 1.5], risk: ['জমিতে পানি জমলে গাছ মরে যায়', 'standing water kills it'] },
  jute: {
    rootDepthM: null,
    coversPreMonsoon: true,
    water: ['পাট জাগ দেওয়ার পানি (পুকুর বা খাল) কাছে', 'water nearby (a pond or canal) to ret the jute'],
    labour: ['কাটা, জাগ ও আঁশ ছাড়াতে অনেক শ্রম', 'much labour to cut, ret and strip'],
  },
};

export const DEEP_ROOT_M = 1.5;
export const LOW_WATER_MM = 100;

export const ROLE_TEXT: Record<CropRoleId, { bn: string; en: string; whyBn: string; whyEn: string }> = {
  nitrogen: {
    bn: 'নাইট্রোজেন যোগ করে (ডাল ফসল)', en: 'Fixes nitrogen (legume)',
    whyBn: 'ডাল ফসলের শিকড়ের গুটিতে থাকা জীবাণু বাতাসের নাইট্রোজেন মাটিতে ধরে রাখে, তাই পরের ফসলে ইউরিয়া কম লাগে।',
    whyEn: 'Bacteria in the root nodules of legumes take nitrogen from the air into the soil, so the next crop needs less urea.',
  },
  deep_root: {
    bn: 'গভীর শিকড়', en: 'Deep roots',
    whyBn: 'দেড় মিটার বা তার বেশি গভীর শিকড় ধানের চাষের শক্ত স্তর ভেদ করে নিচের পানি ও পুষ্টি তোলে, মাটিতে পানি ঢোকার পথ তৈরি করে।',
    whyEn: 'Roots reaching 1.5 m or more break through the plough pan under rice, draw deeper water and nutrients, and open paths for water to soak in.',
  },
  drought: {
    bn: 'কম সেচে হয়', en: 'Needs little irrigation here',
    whyBn: 'এই জায়গার ২৫ মৌসুমের হিসাবে ১০০ মিমির কম সেচ লাগে: মাটির রস আর বৃষ্টিতেই বেশিরভাগ চলে।',
    whyEn: 'Under 100 mm of irrigation in this place\'s 25-season replay: soil moisture and rain carry most of it.',
  },
  cover: {
    bn: 'বর্ষার আগে মাটি ঢেকে রাখে', en: 'Covers the soil before the monsoon',
    whyBn: 'এপ্রিল-জুনের ঝড়বৃষ্টিতে খালি মাটি ধুয়ে যায়; এ সময় জমিতে ফসল থাকলে মাটি ক্ষয় কমে, জৈব পদার্থ যোগ হয়।',
    whyEn: 'April-June storms wash bare soil away; a crop in the field then cuts erosion and adds organic matter.',
  },
  fodder: {
    bn: 'গবাদিপশুর খাদ্য', en: 'Fodder for livestock',
    whyBn: 'খড়, ডাঁটা বা পাতা গরুর খাবার হয়: বাড়তি আয় বা কেনা খাবারের খরচ কমে।',
    whyEn: 'Straw, stalks or leaves feed cattle: extra income or less feed to buy.',
  },
};
