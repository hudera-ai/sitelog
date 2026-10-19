// Field-message parser: turns a free-text WhatsApp message (Arabic / English / mixed)
// into structured report lines. Deterministic, dependency-free, runs on server and browser.
// A language model can be plugged in on the server (see server/src/llm.js); this parser is
// the fallback and the reference behaviour the tests assert.

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function normalizeDigits(s) {
  return s.replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
          .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function norm(s) {
  return normalizeDigits(s)
    .replace(/[ً-ْـ]/g, "")      // tashkeel + tatweel
    .replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s+/g, " ").trim();
}

// ---- lexicons ---------------------------------------------------------------
export const TRADES = [
  ["carpenter",      ["carpenter","carpenters","نجار","نجارين","نجاره"]],
  ["steel_fixer",    ["steel fixer","steel fixers","steelfixer","rebar worker","حداد","حدادين","حداده"]],
  ["mason",          ["mason","masons","بناء","بنائين","بنا"]],
  ["labour",         ["labour","labours","labor","labors","helper","helpers","worker","workers","عامل","عمال","عماله","عمالة"]],
  ["electrician",    ["electrician","electricians","كهربائي","كهربائيين","كهربجي","كهربا"]],
  ["plumber",        ["plumber","plumbers","سباك","سباكين"]],
  ["welder",         ["welder","welders","لحام","لحامين"]],
  ["operator",       ["operator","operators","مشغل","مشغلين","اوبريتر"]],
  ["driver",         ["driver","drivers","سائق","سائقين","سواق","سواقين"]],
  ["surveyor",       ["surveyor","surveyors","مساح","مساحين"]],
  ["engineer",       ["engineer","engineers","مهندس","مهندسين"]],
  ["foreman",        ["foreman","foremen","فورمان","ملاحظ","مراقب"]],
  ["safety_officer", ["safety officer","safety","مسؤول سلامه","سلامه"]],
  ["plasterer",      ["plasterer","plasterers","لياس","لياسين","مليس"]],
  ["tiler",          ["tiler","tilers","مبلط","مبلطين"]],
  ["painter",        ["painter","painters","دهان","دهانين","نقاش"]],
  ["cutting_tech",   ["cutting tech","cutting technician","coring tech","فني قص","فني كور","فني"]],
];

export const EQUIPMENT = [
  ["excavator",      ["excavator","excavators","حفار","حفارات","بوكلين","بكلين"]],
  ["loader",         ["loader","loaders","wheel loader","لودر","لودرات","شيول"]],
  ["crane",          ["crane","cranes","mobile crane","tower crane","كرين","كراين","ونش","اوناش","رافعه"]],
  ["concrete_pump",  ["concrete pump","pump","بمب","مضخه خرسانه","مضخه"]],
  ["mixer",          ["mixer","transit mixer","mixers","خلاطه","خلاطات","ميكسر"]],
  ["compactor",      ["compactor","roller","دكاكه","دكاكات","رولر","هراس"]],
  ["generator",      ["generator","generators","مولد","مولدات"]],
  ["dump_truck",     ["dump truck","tipper","truck","trucks","قلاب","قلابات","شاحنه","شاحنات"]],
  ["bobcat",         ["bobcat","skid steer","بوبكات"]],
  ["jack_hammer",    ["jack hammer","jackhammer","breaker","هيلتي","جاك هامر","كساره"]],
  ["core_machine",   ["core machine","coring machine","كور","مكينه كور","ماكينه كور"]],
  ["wall_saw",       ["wall saw","floor saw","saw","منشار","مكينه قص","ماكينه قص"]],
  ["forklift",       ["forklift","فوركلفت","رافعه شوكيه"]],
  ["water_tanker",   ["water tanker","tanker","وايت","صهريج"]],
  ["boom_truck",     ["boom truck","بوم تراك"]],
];

const EQUIP_STATUS = [
  ["breakdown", ["breakdown","broken","down","under repair","عطلان","معطل","عطل","خربان","صيانه"]],
  ["idle",      ["idle","standby","stand by","not working","واقف","متوقف","ستاند باي","بدون عمل"]],
  ["working",   ["working","operating","active","شغال","يعمل","تعمل","شغاله"]],
];

export const UNITS = [
  ["m3",  ["m3","m³","cum","cubic","متر مكعب","م3","م٣","كوب"]],
  ["m2",  ["m2","m²","sqm","square","متر مربع","م2","م٢"]],
  ["m",   ["lm","rm","m","meter","meters","metre","متر طولي","م.ط","مط","متر"]],
  ["ton", ["ton","tons","tonne","طن"]],
  ["bag", ["bag","bags","كيس","اكياس","شكاير","شكاره"]],
  ["nos", ["nos","no","pcs","pc","points","point","pieces","piece","unit","units","عدد","نقطه","نقاط","قطعه","قطع","وحده","وحدات"]],
  ["trip",["trip","trips","load","loads","نقله","نقلات","رحله"]],
  ["ltr", ["ltr","litre","liter","liters","لتر"]],
  ["roll",["roll","rolls","رول","لفه"]],
  ["kg",  ["kg","kilo","كجم","كيلو"]],
];

const ACTIVITIES = [
  ["concrete_pour", ["pour","pouring","poured","casting","cast","concreting","صب","صبه","صبينا","خرسانه"]],
  ["excavation",    ["excavation","excavate","excavating","dig","حفر","حفريات","تجريف"]],
  ["backfill",      ["backfill","backfilling","ردم","دفان","الردم"]],
  ["formwork",      ["formwork","shuttering","شده","شدات","نجاره","فورم"]],
  ["rebar",         ["rebar","reinforcement","steel fixing","حديد","تسليح"]],
  ["blockwork",     ["blockwork","block work","blocks","بلوك","مباني","بناء"]],
  ["plaster",       ["plaster","plastering","لياسه","بياض","محاره"]],
  ["tiling",        ["tiling","tiles","ceramic","بلاط","سيراميك","تبليط"]],
  ["painting",      ["painting","paint","دهان","دهانات"]],
  ["waterproofing", ["waterproofing","waterproof","membrane","عزل","ممبرين"]],
  ["coring",        ["coring","core","cores","كور","تخريم","ثقب"]],
  ["cutting",       ["cutting","cut","saw cutting","قص","تقطيع"]],
  ["demolition",    ["demolition","demolish","breaking","هدم","تكسير","ازاله"]],
  ["mep",           ["cabling","cable","conduit","piping","pipes","ducting","تمديد","تمديدات","كابلات","مواسير","دكت"]],
  ["asphalt",       ["asphalt","paving","اسفلت","سفلته","رصف"]],
  ["survey",        ["survey","setting out","مساحه","توقيع","تحديد"]],
  ["scaffolding",   ["scaffolding","scaffold","سقاله","سقالات","سكفولد"]],
  ["curing",        ["curing","معالجه","رش"]],
];

const ISSUE_TYPES = [
  ["safety",   ["accident","injury","injured","near miss","unsafe","safety","حادث","اصابه","اصابات","سلامه","خطر"]],
  ["client",   ["client","consultant","owner","stopped","stop work","instruction","العميل","الاستشاري","المالك","اوقف","ايقاف","توجيه"]],
  ["quality",  ["rejected","rework","defect","crack","quality","honeycomb","مرفوض","رفض","اعاده","تشققات","تعشيش","جوده"]],
  ["material", ["shortage","no material","out of stock","late delivery","نقص","مافي","مفيش","نفاد","تاخر التوريد","تاخر وصول"]],
  ["delay",    ["delay","delayed","late","waiting","idle time","تاخير","تاخر","انتظار","توقف","تعطل"]],
];
const ISSUE_TRIGGERS = ["issue","problem","note","remark","delay","delayed","stopped","accident","injury","rejected","shortage","waiting",
  "مشكله","مشاكل","ملاحظه","ملاحظات","تاخير","تاخر","توقف","حادث","اصابه","مرفوض","نقص","انتظار","تعطل","ايقاف"];
const HIGH_SEVERITY = ["accident","injury","injured","stop work","stopped","collapse","fire","حادث","اصابه","ايقاف","اوقف","انهيار","حريق"];

const MATERIAL_TRIGGERS = ["received","delivered","delivery","arrived","supply","supplied","وصل","وصلت","استلام","استلمنا","استلمت","توريد","تم توريد","وصول"];
const MATERIALS = [
  ["cement",     ["cement","اسمنت","سمنت"]],
  ["rebar",      ["rebar","steel bars","reinforcement steel","حديد تسليح","حديد"]],
  ["blocks",     ["blocks","block","بلوك"]],
  ["sand",       ["sand","رمل"]],
  ["aggregate",  ["aggregate","gravel","بحص","حصي","زلط"]],
  ["concrete",   ["ready mix","readymix","concrete","خرسانه جاهزه","خرسانه"]],
  ["tiles",      ["tiles","ceramic","porcelain","بلاط","سيراميك","بورسلين"]],
  ["paint",      ["paint","دهان","بويه"]],
  ["membrane",   ["membrane","ممبرين","عازل"]],
  ["diesel",     ["diesel","fuel","ديزل","سولار","وقود"]],
  ["water",      ["water","ماء","مياه"]],
  ["timber",     ["timber","plywood","wood","خشب","بلايوود"]],
  ["pipes",      ["pipes","pipe","مواسير","ماسوره"]],
  ["cables",     ["cables","cable","كابلات","كابل"]],
];

// ---- helpers ---------------------------------------------------------------
const WORD = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function findLex(lex, text) {
  // returns [key, matchedAlias, index] for the longest alias found in text
  let best = null;
  for (const [key, aliases] of lex) for (const a of aliases) {
    const re = new RegExp(`(^|[^\\p{L}])${WORD(norm(a))}(?=$|[^\\p{L}])`, "iu");
    const m = re.exec(text);
    if (m && (!best || a.length > best[1].length)) best = [key, a, m.index + m[1].length];
  }
  return best;
}
function hasAny(words, text) { return words.some(w => new RegExp(`(^|[^\\p{L}])${WORD(norm(w))}(?=$|[^\\p{L}])`, "iu").test(text)); }
function firstNumber(text) { const m = /(\d+(?:[.,]\d+)?)/.exec(text); return m ? parseFloat(m[1].replace(",", ".")) : null; }
function unitIn(text) { const u = findLex(UNITS, text); return u ? u[0] : null; }
function dnNumber(text) {
  const m = /(?:dn|d\.n|delivery note|بوليصه|اذن تسليم|اذن|رقم)\s*[:#]?\s*(\d{2,})/iu.exec(text);
  return m ? m[1] : null;
}
function locationIn(text) {
  const m = /(?:at|in|@|zone|level|grid|axis|block|في|بالدور|الدور|منطقه|محور|بلوك|مبني|المبني)\s+([\p{L}\d\-\/ ]{1,30}?)(?=[,.;\n]|$| and | و )/iu.exec(text);
  return m ? m[0].trim() : null;
}

const WAW_PROTECT = ["ونش","وايت","وحده","وحدات","وقود","وصل","وصلت","وصول","واقف","ورديه","وردية"];
export function splitClauses(text) {
  const t = normalizeDigits(text).replace(/م\.ط/g, "مط").replace(/d\.n/gi, "dn");
  const first = t.split(/[\n\r]+|[.;،؛]+|,(?!\d)|\s+(?:و|and)\s+(?=\d)|\s[-–•]\s/u).map(s => s.trim()).filter(s => s.length > 1);
  const out = [];
  for (const c of first) {
    const nums = (c.match(/\d+/g) || []).length;
    if (nums < 2 || !/\sو\p{L}/u.test(c)) { out.push(c); continue; }
    // "عمال 18 ومشغل 2" → ["عمال 18", "مشغل 2"], but keep lexicon words that start with و
    const parts = c.split(/\s+(?=و\p{L})/u);
    let cur = parts[0];
    for (const pt of parts.slice(1)) {
      const w = norm(pt.split(" ")[0]);
      if (WAW_PROTECT.some(x => w.startsWith(norm(x)))) cur += " " + pt; else { out.push(cur); cur = pt.slice(1); }
    }
    out.push(cur);
  }
  return out.map(s => s.trim()).filter(s => s.length > 1);
}

// ---- main ------------------------------------------------------------------
export function parseMessage(raw) {
  const out = { manpower: [], equipment: [], activities: [], materials: [], issues: [], unmatched: [] };
  if (!raw || !raw.trim()) return out;

  for (const clause of splitClauses(raw)) {
    const c = norm(clause);
    const n = firstNumber(c);

    // 1) issues (checked first: "delay in steel delivery" must not become a material)
    const labelled = /^(issue|problem|note|remark|incident|مشكله|ملاحظه|حادث|تنبيه)\s*[:\-]/iu.test(c);
    if (labelled || (hasAny(ISSUE_TRIGGERS, c) && !(hasAny(MATERIAL_TRIGGERS, c) && n != null))) {
      const t = ISSUE_TYPES.find(([, w]) => hasAny(w, c));
      out.issues.push({ type: t ? t[0] : "other", severity: hasAny(HIGH_SEVERITY, c) ? "high" : "medium", description: clause.trim() });
      continue;
    }

    // 2) materials received
    if (hasAny(MATERIAL_TRIGGERS, c)) {
      const mat = findLex(MATERIALS, c);
      out.materials.push({ material: mat ? mat[0] : clause.trim(), qty: n ?? 0, unit: unitIn(c) || (mat && mat[0] === "cement" ? "bag" : "nos"),
        delivery_note: dnNumber(c), supplier: ((/(?:from|من)\s+([\p{L} ]{2,40})/iu.exec(clause) || [])[1] || "").replace(/\s*(dn|d\.n|delivery note|بوليصة|بوليصه|إذن|اذن|رقم).*$/iu, "").trim() || null, source: clause.trim() });
      continue;
    }

    // 3) equipment (needs an equipment word; count defaults to 1). An activity word with a
    //    unit ("coring 40 points") wins unless the clause carries an explicit equipment status.
    const eq = findLex(EQUIPMENT, c);
    const tr = findLex(TRADES, c);
    const act = findLex(ACTIVITIES, c);
    const unit = unitIn(c);
    const hasStatus = hasAny(EQUIP_STATUS.flatMap(s => s[1]), c);
    if (eq && (hasStatus || (!tr && !(act && unit) && eq[1].split(" ").length > 1) || (!tr && !act))) {
      const st = EQUIP_STATUS.find(([, w]) => hasAny(w, c));
      out.equipment.push({ name: eq[0], count: Number.isInteger(n) ? n : 1, status: st ? st[0] : "working", source: clause.trim() });
      continue;
    }

    // 4) activities with quantity (verb + number + unit) — before manpower so "12 m3 pour" is not 12 workers
    if (act && (unit || n == null || !tr)) {
      out.activities.push({ activity: act[0], description: clause.trim(), qty: n ?? 0, unit: unit || "nos", location: locationIn(c), source: clause.trim() });
      continue;
    }

    // 5) manpower: trade + number
    if (tr && n != null) {
      // a clause may hold several "N trade" pairs: "12 نجار 8 حداد 20 عامل"
      const pairs = [...c.matchAll(/(\d+)\s*([\p{L} ]{2,25}?)(?=\s*\d|$|[,])|([\p{L} ]{2,25}?)\s*[:=]?\s*(\d+)(?=\s|$|[,])/gu)];
      let added = 0;
      for (const m of pairs) {
        const count = parseInt(m[1] ?? m[4], 10); const label = (m[2] ?? m[3] ?? "").trim();
        const t = findLex(TRADES, label);
        if (t && count > 0) { out.manpower.push({ trade: t[0], count, source: clause.trim() }); added++; }
      }
      if (!added) out.manpower.push({ trade: tr[0], count: n, source: clause.trim() });
      continue;
    }

    if (act) { out.activities.push({ activity: act[0], description: clause.trim(), qty: 0, unit: "nos", location: locationIn(clause), source: clause.trim() }); continue; }
    if (c.length > 3) out.unmatched.push(clause.trim());
  }
  return out;
}

// Suggest the BOQ item an activity belongs to, by activity type + keyword overlap.
export function matchBoqItem(activity, boqItems) {
  const key = activity.activity; const text = norm(activity.description);
  let best = null, bestScore = 0;
  for (const it of boqItems) {
    const d = norm(`${it.desc_en} ${it.desc_ar}`);
    let score = 0;
    const act = ACTIVITIES.find(a => a[0] === key);
    if (act && act[1].some(w => d.includes(norm(w)))) score += 3;
    if (activity.unit && it.unit && norm(it.unit) === norm(activity.unit)) score += 2;
    for (const w of text.split(" ")) if (w.length > 3 && d.includes(w)) score += 1;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 3 ? best : null;
}

export const LABELS = {
  trade: Object.fromEntries(TRADES.map(([k, a]) => [k, { en: a[0].replace(/\b\w/g, s => s.toUpperCase()), ar: a.find(x => /[؀-ۿ]/.test(x)) }])),
  equipment: Object.fromEntries(EQUIPMENT.map(([k, a]) => [k, { en: a[0].replace(/\b\w/g, s => s.toUpperCase()), ar: a.find(x => /[؀-ۿ]/.test(x)) }])),
  material: Object.fromEntries(MATERIALS.map(([k, a]) => [k, { en: a[0].replace(/\b\w/g, s => s.toUpperCase()), ar: a.find(x => /[؀-ۿ]/.test(x)) }])),
  activity: Object.fromEntries(ACTIVITIES.map(([k, a]) => [k, { en: a[0].replace(/\b\w/g, s => s.toUpperCase()), ar: a.find(x => /[؀-ۿ]/.test(x)) }])),
};
