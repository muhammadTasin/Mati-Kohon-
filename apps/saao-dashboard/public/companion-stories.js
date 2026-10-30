// What Rongu says on his tours. Each step names the screen, the part of the page he lights up (a CSS selector),
// what he says in Bangla and English, and how he says it (a gesture or two, a colour mood, a move after he lands).
// A step whose part is not on the page for this role or place is skipped. The numbers and facts come from the
// dashboard's own cards (i18n.js, app.js), so they stay true to what the visitor sees.

export const STORY = {
  id: 'story',
  title: { bn: 'মাটি কহনের গল্প', en: 'The Mati Kohon story' },
  chapters: [
    { bn: 'স্বাগতম', en: 'Welcome' },
    { bn: 'প্রশ্নটা', en: 'The question' },
    { bn: 'আজকের মাঠ', en: "Today's field" },
    { bn: 'মানচিত্র', en: 'The map' },
    { bn: 'প্রতিদিনের তথ্য', en: 'Daily data' },
    { bn: 'আগাম সতর্কতা', en: 'Early warnings' },
    { bn: 'আবহাওয়া', en: 'Weather' },
    { bn: 'কাদের জন্য', en: 'Who it is for' },
  ],
  steps: [
    {
      chapter: 0, place: 'center', gesture: ['wave', 'skySoil'],
      text: {
        bn: 'স্বাগতম! আমি রঙ্গু, মাটি কহনের সঙ্গী। গিরগিটির মতো আমার এক চোখ আকাশে, এক চোখ মাটিতে, ঠিক যেমন মাটি কহন নাসার স্যাটেলাইট আর মাঠ একসাথে দেখে। চলুন, কয়েক মিনিটে পুরো গল্পটা দেখাই।',
        en: "Welcome! I'm Rongu, the Mati Kohon companion. Like any chameleon I keep one eye on the sky and one on the soil, just as Mati Kohon reads NASA satellites and the field together. Let me show you the whole story in a few minutes.",
      },
    },
    {
      chapter: 1, screen: 'screen-overview', target: '.banner-card', gesture: 'showTablet', tablet: ['chart', { title: 'Groundwater' }],
      text: {
        bn: 'তালন্দ ইউনিয়নের কৃষকের প্রতি বছর একই প্রশ্ন: আমন কাটার পর জমিতে কী লাগাবেন? বোরো ধানে অনেক পানি লাগে, আর বরেন্দ্রের ভূগর্ভস্থ পানি চাপে আছে। মাটি কহন ২৫ মৌসুমের নাসা তথ্য দেখে এমন ফসল চক্র বাছে, যাতে পানি বাঁচে, মাটি ভালো থাকে, কীটনাশক কম লাগে।',
        en: 'Every year farmers in Talanda union face the same question: what to plant after the Aman harvest? Boro rice needs a lot of water, and the Barind groundwater is under pressure. Mati Kohon reads 25 seasons of NASA data to pick rotations that save water, keep the soil healthy and cut pesticide use.',
      },
    },
    {
      chapter: 1, screen: 'screen-overview', target: '#freshnessStrip', gesture: 'adjustGlasses',
      text: {
        bn: 'পরামর্শের আগে দেখি তথ্য কতটা নতুন। প্রতিটি উৎসের শেষ তারিখ এখানে লেখা থাকে, যাতে পুরনো তথ্যে কেউ সিদ্ধান্ত না নেয়।',
        en: 'Before any advice, check how fresh the data is. The latest date of each source is written here, so nobody decides on stale numbers.',
      },
    },
    {
      chapter: 2, screen: 'screen-overview', target: '.stats-row', gesture: 'readTablet',
      text: {
        bn: 'এক নজরে আজকের মাঠ: গত ৩০ দিনের বৃষ্টি, নাসার SMAP স্যাটেলাইটে শিকড়ের কাছের মাটির রস, আর এবারের জন্য উপযুক্ত আমন জাত।',
        en: "Today's field at a glance: rain over the last 30 days, the moisture around the roots from NASA's SMAP satellite, and the Aman variety that suits this season.",
      },
    },
    {
      chapter: 2, screen: 'screen-overview', target: '.ov-attention', gesture: 'think',
      text: {
        bn: 'এই সপ্তাহে মাঠে কী করবেন, আর বন্যা হলে আগে কোথায় ক্ষতি খুঁজবেন, সবই নাসার আজকের তথ্য থেকে।',
        en: "What to do in the field this week, and where to look first for flood damage, all from today's NASA data.",
      },
    },
    {
      chapter: 3, screen: 'screen-overview', target: '.map-card', gesture: 'point', act: 'dive', actOpts: { splash: 'soil' }, actDelay: 2600,
      text: {
        bn: 'এটা বাংলাদেশের ৫৪৪টি উপজেলার মানচিত্র। যেকোনো উপজেলায় চাপ দিলে পুরো পাতা সেই জায়গার তথ্য দেখায়। দাঁড়ান, একটু মাটির নিচে ডুব দিয়ে আসি!',
        en: 'This is a map of all 544 upazilas of Bangladesh. Pick any upazila and the whole page follows that place. Hold on, let me take a quick dive into the soil!',
      },
    },
    {
      chapter: 3, screen: 'screen-overview', target: '.place-card', gesture: 'readTablet',
      text: {
        bn: 'যে জায়গা বাছবেন, তার মাটি, ভূগর্ভস্থ পানি, ফসল কতটা সবুজ আর আবহাওয়া অফিসের খবর এখানে।',
        en: 'For the place you pick: its soil, its groundwater, how green the crops are, and the weather office notes.',
      },
    },
    {
      chapter: 3, screen: 'screen-overview', target: '#climateTrendCard', gesture: 'think',
      text: {
        bn: 'গত ৩০ দিন স্বাভাবিকের চেয়ে কতটা আলাদা: বৃষ্টি, গরম, শুকনো দিন আর মাটির রস, নাসা POWER থেকে।',
        en: 'How the last 30 days differ from normal: rain, heat, dry spells and soil wetness, from NASA POWER.',
      },
    },
    {
      chapter: 4, screen: 'screen-overview', target: '.live-card', gesture: 'showTablet', tablet: ['chart', { title: 'NASA today', values: [0.3, 0.55, 0.4, 0.62, 0.48, 0.8] }],
      text: {
        bn: 'প্রতিদিন সকালে দেশের প্রতিটি উপজেলার জন্য নাসা POWER আর GPM IMERG-এর বৃষ্টির তথ্য নতুন করে আসে। জেলা আর উপজেলা বেছে নিজের এলাকা দেখুন।',
        en: "Every morning NASA POWER and GPM IMERG rain data are refreshed for every upazila in the country. Pick a district and upazila to see your own.",
      },
    },
    {
      chapter: 5, screen: 'screen-overview', target: '#warningsRow .warning-card:nth-child(1)', mood: 'flood', gesture: 'surprise',
      text: {
        bn: 'হাওরে আকস্মিক বন্যা! মার্চ থেকে মে, মেঘালয়ের সোহরায় (চেরাপুঞ্জি) ৩ দিনে অনেক বৃষ্টি হলে ধর্মপাশায় সতর্কতা ওঠে। তবে নদীর গেজ নিশ্চিত না করলে কোনো কল যায় না।',
        en: "Haor flash floods! From March to May, heavy rain over 3 days at Sohra (Cherrapunji) in Meghalaya raises a watch for Dharmapasha. No call goes out until the river gauges confirm it.",
      },
    },
    {
      chapter: 5, screen: 'screen-overview', target: '#warningsRow .warning-card:nth-child(2)', mood: 'heat', gesture: 'think',
      text: {
        bn: 'আমনে ফুল আসার রাতগুলো আগের চেয়ে গরম হচ্ছে। রাত গরম হলে চিটা বাড়ে, তাই কর্মকর্তারা নাসার রাতের তাপমাত্রা নজরে রাখেন।',
        en: 'The nights when Aman rice flowers are getting warmer. Warm nights mean more empty grains, so officers keep an eye on NASA night temperatures.',
      },
    },
    {
      chapter: 5, screen: 'screen-overview', target: '#warningsRow .warning-card:nth-child(3)', mood: 'heat', gesture: 'oops',
      text: {
        bn: 'গরমে গরুরও কষ্ট হয়। তাপ আর আর্দ্রতা মিলিয়ে তাপ-আর্দ্রতা সূচক (THI) দেখি; কিছু মাসে রাতেও স্বস্তি মেলে না।',
        en: 'Cattle suffer in the heat too. Heat and humidity together give the temperature-humidity index (THI); in some months even the nights bring no relief.',
      },
    },
    {
      chapter: 6, screen: 'screen-weather', target: '#fpanel-weather .weather-card', gesture: 'skySoil',
      text: {
        bn: 'আবহাওয়ার পাতায় যেকোনো উপজেলার আগামী ৭ দিনের পূর্বাভাস, নাসা POWER-এর তথ্য, আর গবাদিপশুর ঘণ্টায় ঘণ্টায় তাপ চাপ। জেলা আর উপজেলা বেছে নিন।',
        en: 'The weather screen has a 7-day forecast for any upazila, NASA POWER data, and the hour-by-hour heat stress for cattle. Choose a district and upazila.',
      },
    },
    {
      chapter: 7, screen: 'screen-overview', target: '#roleChip', gesture: 'salam', pad: 6,
      text: {
        bn: 'কৃষকেরা নিজের পোর্টালে আর ফোন কলে বাংলায় পরামর্শ পান। ম্যানেজাররা (উপসহকারী কৃষি কর্মকর্তা) কৃষকের কেস, কল আর ফসল চক্রের তুলনা সামলান। ভূমিকা বদলাতে এখানে চাপুন।',
        en: 'Farmers get advice in Bangla in their own portal and by phone call. Managers (Sub-Assistant Agriculture Officers) handle the farmer cases, the calls and the rotation comparisons. Tap here to change your role.',
      },
    },
    {
      chapter: 7, place: 'center', mood: 'happy', act: 'celebrate', actDelay: 300,
      text: {
        bn: 'গল্প এখানেই শেষ! আকাশ থেকে মাটি, নাসার তথ্য থেকে কৃষকের হাতে: এই হলো মাটি কহন। আমাকে চাপ দিলেই আবার পাবেন, আর টেনে যেখানে খুশি রাখতে পারেন।',
        en: "That's the story! From the sky to the soil, from NASA data to the farmer's hands: that's Mati Kohon. Tap me any time to see it again, and drag me anywhere you like.",
      },
    },
  ],
};

export const FARMER_TOUR = {
  id: 'farmer',
  title: { bn: 'আমার পোর্টাল ঘুরে দেখি', en: 'Show me my portal' },
  chapters: [
    { bn: 'আজ', en: 'Today' },
    { bn: 'আবহাওয়া', en: 'Weather' },
    { bn: 'নদীভাঙন', en: 'River erosion' },
    { bn: 'প্রশ্ন', en: 'Questions' },
    { bn: 'আমার খামার', en: 'My farm' },
    { bn: 'পরিকল্পনা', en: 'Planning' },
  ],
  steps: [
    {
      chapter: 0, place: 'center', gesture: 'salam',
      text: {
        bn: 'আসসালামু আলাইকুম! আমি রঙ্গু। চলুন, আপনার পোর্টালটা এক পাক ঘুরে দেখাই।',
        en: "Assalamu alaikum! I'm Rongu. Let me walk you round your portal.",
      },
    },
    {
      chapter: 0, screen: 'screen-farmer', tab: 'today', target: '#fpanel-today', gesture: 'showTablet',
      text: {
        bn: 'এটা আপনার আজকের পাতা: এই বছরের ফসল পরিকল্পনা আর আজকের পরামর্শ। "পরামর্শ শুনুন" চাপলে বাংলায় শুনতে পাবেন।',
        en: 'This is your Today page: this year\'s crop plan and today\'s advice. Press "Listen to the advice" to hear it in Bangla.',
      },
    },
    {
      chapter: 1, screen: 'screen-farmer', tab: 'weather', target: '#fpanel-weather .weather-card', gesture: 'skySoil',
      text: {
        bn: 'জেলা আর উপজেলা বেছে নিলে আগামী ৭ দিনের আবহাওয়া, নাসার তথ্য আর গরুর তাপ চাপ দেখা যায়।',
        en: 'Choose your district and upazila to see the next 7 days of weather, NASA data and the heat stress for your cattle.',
      },
    },
    {
      chapter: 2, screen: 'screen-farmer', tab: 'erosion', target: '#fpanel-erosion', gesture: 'think', mood: 'flood',
      text: {
        bn: 'জমি নদীর পাশে? এখানে নদীভাঙন আর নদীর পানির উচ্চতা দেখুন (বাপাউবো ও সিইজিআইএস)।',
        en: 'Is your land by a river? See river erosion and water levels here (BWDB and CEGIS).',
      },
    },
    {
      chapter: 3, screen: 'screen-farmer', tab: 'ai', target: '#fpanel-ai', gesture: 'point',
      text: {
        bn: 'কোন ফসল চান লিখুন, যেমন "শুধু গম, ধান না", পরিকল্পনা পেয়ে যাবেন। অন্য প্রশ্ন যায় আপনার উপসহকারী কৃষি কর্মকর্তার কাছে, আর উত্তর আসে ফোন কলে।',
        en: 'Type the crops you want, for example "only wheat, no rice", and you get a plan. Other questions go to your Sub-Assistant Agriculture Officer, and the answer comes as a phone call.',
      },
    },
    {
      chapter: 4, screen: 'screen-farmer', tab: 'farm', target: '#fpanel-farm', gesture: 'readTablet',
      text: {
        bn: 'আপনার প্রোফাইল আর সম্মতি: ফোন কল বা মাঠ পরিদর্শনে কী তথ্য নেওয়া হবে, তা এখানে লেখা।',
        en: 'Your profile and consent: what a phone call or a field visit will collect is written here.',
      },
    },
    {
      chapter: 5, screen: 'screen-planner', target: '#screen-planner .card', gesture: 'showTablet', tablet: ['chart', { title: 'Rotation' }],
      text: {
        bn: 'এখানে নিজেই ফসল চক্র সাজিয়ে দেখুন: জমি, এখন মাঠে কী আছে আর আপনার কাছে কী বেশি জরুরি, তা বেছে নিন।',
        en: 'Plan a rotation yourself here: choose your land, what is in the field now, and what matters most to you.',
      },
    },
    {
      chapter: 5, place: 'center', mood: 'happy', act: 'celebrate', actDelay: 300,
      text: {
        bn: 'এই তো! দরকার হলে আমাকে চাপ দেবেন, আমি আবার দেখিয়ে দেব।',
        en: "That's it! Tap me whenever you need me and I'll show you again.",
      },
    },
  ],
};
