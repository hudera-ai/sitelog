// Sample data for a fictional contractor. Deterministic (seeded PRNG) so server and
// browser demo produce the same dataset. Everything here — company, people, projects,
// figures — is invented for demonstration purposes.

import { parseMessage } from "./parser.js";

// PBKDF2-SHA256 of "demo1234" (see shared/auth.js). All demo users share it.
export const DEMO_PASSWORD = "demo1234";
export const DEMO_HASH = "pbkdf2$100000$736974656c6f672d64656d6f2d73616c74$c1518516014ed00eeb9fbc27d1c19b37b424ccc30559442d91dd95fbc6a52a89";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const pad = n => String(n).padStart(2, "0");
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const COMPANY = {
  name_ar: "شركة أفق البناء للمقاولات", name_en: "Ufuq Al-Bina Contracting Co.",
  cr_no: "1010XXXXXX", vat_no: "3000XXXXXXXXXX3", city: "Riyadh", phone: "+966 5X XXX XXXX", email: "reports@ufuq-albina.example",
};

export const USERS = [
  { name: "Khalid Al-Harbi",   email: "khalid@ufuq.example",  role: "admin",    phone: "+9665XXXXXX01" },
  { name: "Eng. Sara Al-Qahtani", email: "sara@ufuq.example", role: "pm",       phone: "+9665XXXXXX02" },
  { name: "Eng. Omar Hassan",  email: "omar@ufuq.example",    role: "pm",       phone: "+9665XXXXXX03" },
  { name: "Eng. Mahmoud Adel", email: "mahmoud@ufuq.example", role: "engineer", phone: "+9665XXXXXX04" },
  { name: "Eng. Faisal Nasser",email: "faisal@ufuq.example",  role: "engineer", phone: "+9665XXXXXX05" },
  { name: "Ahmed Yousef (Foreman)", email: "ahmed@ufuq.example", role: "foreman", phone: "+9665XXXXXX06" },
  { name: "Rami Saleh (Foreman)",  email: "rami@ufuq.example",  role: "foreman", phone: "+9665XXXXXX07" },
  { name: "Client viewer",     email: "viewer@ufuq.example",  role: "viewer",   phone: "" },
];

export const PROJECTS = [
  { code: "UB-2026-014", name_ar: "برج الواحة التجاري", name_en: "Al-Waha Commercial Tower", client: "Al-Waha Real Estate Development", consultant: "Riyadh Design Consultants", city: "Riyadh",
    start_date: "2026-03-01", end_date: "2027-06-30", contract_value: 48_500_000, pm: "sara@ufuq.example", members: ["mahmoud@ufuq.example", "ahmed@ufuq.example"],
    boq: [
      ["A-01", "حفر وتسوية الموقع", "Excavation & site grading", "m3", 18_000, 28],
      ["A-02", "ردم ودك بالطبقات", "Backfilling & compaction in layers", "m3", 9_500, 35],
      ["B-01", "خرسانة أساسات (لبشة)", "Foundation concrete (raft)", "m3", 4_200, 480],
      ["B-02", "خرسانة أعمدة وجدران", "Columns & shear walls concrete", "m3", 2_600, 560],
      ["B-03", "خرسانة أسقف", "Slab concrete", "m3", 6_800, 520],
      ["B-04", "حديد تسليح", "Reinforcement steel", "ton", 1_450, 4_100],
      ["B-05", "شدات خشبية", "Formwork", "m2", 48_000, 62],
      ["C-01", "مباني بلوك", "Blockwork", "m2", 22_000, 85],
      ["C-02", "لياسة داخلية وخارجية", "Plastering", "m2", 41_000, 38],
      ["D-01", "عزل مائي للأسطح", "Roof waterproofing", "m2", 3_100, 95],
    ],
    trades: ["carpenter", "steel_fixer", "labour", "mason", "operator", "driver", "foreman", "safety_officer"],
    equipment: ["excavator", "loader", "crane", "concrete_pump", "mixer", "dump_truck", "generator"],
  },
  { code: "UB-2026-021", name_ar: "مجمع الياسمين السكني – المرحلة 2", name_en: "Al-Yasmin Residential Compound – Phase 2", client: "Diyar Housing Co.", consultant: "Gulf Engineering Office", city: "Jeddah",
    start_date: "2026-05-15", end_date: "2027-02-28", contract_value: 21_750_000, pm: "omar@ufuq.example", members: ["faisal@ufuq.example", "rami@ufuq.example"],
    boq: [
      ["A-01", "حفر أساسات", "Foundation excavation", "m3", 6_400, 30],
      ["B-01", "خرسانة أساسات", "Foundation concrete", "m3", 1_900, 470],
      ["B-02", "خرسانة هيكل", "Superstructure concrete", "m3", 3_400, 540],
      ["B-03", "حديد تسليح", "Reinforcement steel", "ton", 640, 4_050],
      ["C-01", "مباني بلوك", "Blockwork", "m2", 19_000, 82],
      ["C-02", "لياسة", "Plastering", "m2", 36_000, 36],
      ["C-03", "بلاط أرضيات", "Floor tiling", "m2", 14_500, 120],
      ["C-04", "دهانات", "Painting", "m2", 52_000, 22],
      ["E-01", "تمديدات كهرباء", "Electrical conduits & cabling", "m", 28_000, 18],
      ["E-02", "تمديدات صحية", "Plumbing pipes", "m", 16_000, 24],
    ],
    trades: ["carpenter", "steel_fixer", "labour", "mason", "plasterer", "tiler", "painter", "electrician", "plumber", "foreman"],
    equipment: ["crane", "concrete_pump", "mixer", "bobcat", "generator", "forklift"],
  },
  { code: "UB-2026-033", name_ar: "تعديلات إنشائية – مستشفى الشفاء", name_en: "Structural Modifications – Al-Shifa Hospital", client: "Ministry of Health (East Region)", consultant: "Saud & Partners Consulting Engineers", city: "Dammam",
    start_date: "2026-08-01", end_date: "2026-12-31", contract_value: 3_980_000, pm: "sara@ufuq.example", members: ["mahmoud@ufuq.example", "rami@ufuq.example"],
    boq: [
      ["S-01", "قص جدران خرسانية بالمنشار", "Concrete wall saw cutting", "m", 1_250, 310],
      ["S-02", "كور خرساني قطر 100–300 مم", "Concrete coring Ø100–300 mm", "nos", 860, 240],
      ["S-03", "هدم وإزالة خرسانة", "Demolition & removal of concrete", "m3", 420, 650],
      ["S-04", "تدعيم بألياف الكربون CFRP", "CFRP strengthening", "m2", 980, 1_150],
      ["S-05", "حقن شروخ إيبوكسي", "Epoxy crack injection", "m", 1_600, 140],
      ["S-06", "سقالات", "Scaffolding", "m2", 5_200, 28],
    ],
    trades: ["cutting_tech", "labour", "operator", "engineer", "foreman", "safety_officer"],
    equipment: ["wall_saw", "core_machine", "jack_hammer", "generator", "water_tanker", "boom_truck"],
  },
];

export const INBOX_SAMPLES = [
  { project: "UB-2026-014", sender: "+9665XXXXXX06", body: "صباح الخير م. سارة. النهارده في الموقع 14 نجار، 9 حداد، 22 عامل، 2 مشغل. تم صب 48 م3 خرسانة سقف الدور الثالث منطقة A. كرين 1 شغال، بمب 1 شغال، لودر 1 عطلان. وصل 300 كيس اسمنت من شركة الصفوة بوليصة 5120. ملاحظة: الاستشاري طلب إعادة اختبار الهبوط للخلطة." },
  { project: "UB-2026-014", sender: "+9665XXXXXX06", body: "Night shift: labours 8, carpenters 6. Formwork 420 m2 level 4 columns. Generator 2 working. Issue: delay in steel delivery, expected tomorrow." },
  { project: "UB-2026-021", sender: "+9665XXXXXX07", body: "مساء الخير. مباني بلوك 310 م2 فيلا 12 و13. لياسة 180 م2 فيلا 9. بلاط 95 م2 فيلا 5. عمال 20، بناء 8، لياس 6، مبلط 4. بوبكات 1 شغال. وصل 4 نقلات رمل. مشكلة: المالك أوقف العمل في فيلا 7 لحين اعتماد اللون." },
  { project: "UB-2026-033", sender: "+9665XXXXXX07", body: "كور 36 نقطة قطر 150 الدور الأرضي. قص 42 م.ط جدار محور C-4. فني قص 4، عمال 6، مهندس 1. مكينة قص 2 شغالة، مكينة كور 2 شغالة، مولد 1. حادث بسيط: جرح في يد عامل، تم الإسعاف الأولي ورجع للعمل." },
  { project: "UB-2026-033", sender: "+9665XXXXXX04", body: "CFRP 64 m2 beams B3-B7 completed. Epoxy injection 85 m. Cutting techs 3, labours 5. Water tanker 1 working. Received 12 rolls carbon fibre DN 2291 from Sika distributor. Note: hospital requested no noise works between 13:00 and 15:00." },
];

// ---- generator ------------------------------------------------------------
export function buildSeed({ today = new Date(), days = 150 } = {}) {
  const rand = rng(20260301);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const reports = [];
  const weatherPool = ["sunny", "sunny", "sunny", "cloudy", "dusty", "hot", "windy"];
  const TRADE_RANGE = { carpenter: [8, 18], steel_fixer: [6, 14], labour: [14, 30], mason: [4, 10], operator: [1, 4], driver: [2, 6], foreman: [1, 2], safety_officer: [1, 1],
    plasterer: [4, 10], tiler: [3, 8], painter: [4, 9], electrician: [2, 6], plumber: [2, 5], cutting_tech: [3, 6], engineer: [1, 2] };
  const ACT = {
    "UB-2026-014": [["B-05", "formwork", "Formwork for level {L} columns & slab", "شدات خشبية أعمدة وسقف الدور {L}", 300, 700, "m2"], ["B-04", "rebar", "Rebar fixing level {L} slab", "تركيب حديد تسليح سقف الدور {L}", 8, 22, "ton"], ["B-03", "concrete_pour", "Slab concrete pour level {L} zone {Z}", "صب خرسانة سقف الدور {L} منطقة {Z}", 30, 90, "m3"], ["B-02", "concrete_pour", "Columns & walls concrete level {L}", "صب أعمدة وجدران الدور {L}", 20, 55, "m3"], ["C-01", "blockwork", "Blockwork level {L}", "مباني بلوك الدور {L}", 120, 320, "m2"], ["A-02", "backfill", "Backfilling around raft zone {Z}", "ردم حول اللبشة منطقة {Z}", 80, 260, "m3"]],
    "UB-2026-021": [["C-01", "blockwork", "Blockwork villas {V}", "مباني بلوك فلل {V}", 150, 360, "m2"], ["C-02", "plaster", "Plastering villas {V}", "لياسة فلل {V}", 120, 300, "m2"], ["C-03", "tiling", "Floor tiling villa {V}", "بلاط أرضيات فيلا {V}", 60, 140, "m2"], ["C-04", "painting", "Painting first coat villas {V}", "دهان وجه أول فلل {V}", 200, 520, "m2"], ["E-01", "mep", "Electrical conduits villas {V}", "تمديدات كهرباء فلل {V}", 150, 420, "m"], ["E-02", "mep", "Plumbing pipes villa {V}", "تمديدات صحية فيلا {V}", 80, 240, "m"], ["B-02", "concrete_pour", "Roof slab concrete villa {V}", "صب سقف فيلا {V}", 25, 60, "m3"]],
    "UB-2026-033": [["S-01", "cutting", "Wall saw cutting axis {Z}-{N}", "قص جدار محور {Z}-{N}", 15, 48, "m"], ["S-02", "coring", "Coring Ø150 level {L}", "كور قطر 150 الدور {L}", 12, 40, "nos"], ["S-03", "demolition", "Demolition of slab opening level {L}", "هدم فتحة سقف الدور {L}", 3, 12, "m3"], ["S-04", "mep", "CFRP wrapping beams level {L}", "لف ألياف كربون كمرات الدور {L}", 20, 70, "m2"], ["S-05", "mep", "Epoxy injection cracks level {L}", "حقن شروخ الدور {L}", 30, 110, "m"], ["S-06", "scaffolding", "Scaffolding erection level {L}", "تركيب سقالات الدور {L}", 100, 400, "m2"]],
  };
  const ISSUES = [
    ["delay", "medium", "Concrete delivery delayed 2 hours (traffic at plant)", "تأخر توريد الخرسانة ساعتين"],
    ["client", "medium", "Consultant requested additional slump test before pour", "الاستشاري طلب اختبار هبوط إضافي قبل الصب"],
    ["material", "high", "Rebar Ø16 shortage; next delivery tomorrow", "نقص حديد قطر 16، التوريد بكرة"],
    ["safety", "high", "Minor hand injury, first aid given, worker returned", "إصابة بسيطة في اليد، إسعاف أولي ورجع للعمل"],
    ["quality", "medium", "Honeycomb observed in column C-7, repair method submitted", "تعشيش في عمود C-7، تم تقديم طريقة المعالجة"],
    ["other", "low", "Power outage 45 min, generator used", "انقطاع كهرباء 45 دقيقة، تم تشغيل المولد"],
    ["client", "high", "Owner stopped works in villa 7 pending colour approval", "المالك أوقف العمل في فيلا 7 لحين اعتماد اللون"],
  ];
  const MATERIALS = [["cement", "bag", 150, 400, "Al-Safwa Building Materials"], ["rebar", "ton", 8, 30, "Rajhi Steel"], ["blocks", "nos", 2000, 6000, "Jeddah Blocks Factory"], ["sand", "trip", 2, 6, "Al-Nakhla Transport"], ["aggregate", "trip", 2, 5, "Al-Nakhla Transport"], ["concrete", "m3", 30, 90, "Saudi Readymix"], ["diesel", "ltr", 400, 1200, "Petro Supplies"], ["membrane", "roll", 10, 40, "Insulation House"]];

  const start = new Date(today); start.setDate(start.getDate() - days);
  for (const p of PROJECTS) {
    const pStart = new Date(p.start_date);
    for (let i = 0; i <= days; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (d < pStart) continue;
      if (d.getDay() === 5) continue; // Friday off
      const dateStr = iso(d);
      const ageDays = Math.round((today - d) / 86400000);
      const status = ageDays === 0 ? "draft" : ageDays === 1 ? pick(["submitted", "submitted", "draft"]) : ageDays === 2 ? pick(["submitted", "approved", "returned"]) : "approved";
      const L = between(1, 6), Z = pick(["A", "B", "C"]), V = `${between(1, 18)}`, N = between(1, 9);
      const fmt = s => s.replace("{L}", L).replace("{Z}", Z).replace("{V}", V).replace("{N}", N);
      const acts = []; const used = new Set();
      for (let k = 0; k < between(2, 4); k++) { const a = pick(ACT[p.code]); if (used.has(a[0])) continue; used.add(a[0]); acts.push({ boq_code: a[0], description: fmt(a[2]), description_ar: fmt(a[3]), qty: between(a[4], a[5]), unit: a[6], location: fmt(`Level ${L} / Zone ${Z}`) }); }
      const manpower = p.trades.map(t => ({ trade: t, count: between(...(TRADE_RANGE[t] || [1, 4])), hours: 9 })).filter(m => m.count > 0);
      const equipment = p.equipment.map(e => ({ name: e, count: between(1, 3), hours: between(6, 10), status: rand() < 0.08 ? "breakdown" : rand() < 0.15 ? "idle" : "working" }));
      const materials = rand() < 0.6 ? [1, 2].slice(0, between(1, 2)).map(() => { const m = pick(MATERIALS); return { material: m[0], unit: m[1], qty: between(m[2], m[3]), supplier: m[4], delivery_note: `DN-${between(4000, 9900)}` }; }) : [];
      const issues = rand() < 0.35 ? [pick(ISSUES)].map(([type, severity, en, ar]) => ({ type, severity, description: en, description_ar: ar, status: ageDays > 5 ? "closed" : "open" })) : [];
      reports.push({ project: p.code, report_date: dateStr, shift: "day", weather: pick(weatherPool), temp_c: between(24, 43), status, created_by: p.members[1], approved_by: status === "approved" ? p.pm : null,
        notes: pick(["Works progressing as planned.", "Pour completed before 11:00 due to heat.", "Consultant inspection passed for rebar.", "Toolbox talk held at 07:00.", "Housekeeping completed in zone A.", ""]),
        safety_notes: pick(["Toolbox talk: working at height.", "PPE inspection done, 2 helmets replaced.", "Heat stress breaks every 2 hours.", "No incidents.", ""]),
        pm_comment: status === "returned" ? "Please attach the pour card and correct the slab quantity." : null,
        manpower, equipment, activities: acts, materials, issues });
    }
  }
  const inbox = INBOX_SAMPLES.map((m, i) => ({ ...m, received_at: `${iso(today)} ${pad(7 + i * 2)}:${pad(between(5, 55))}:00`, parsed: parseMessage(m.body) }));
  return { company: COMPANY, users: USERS, projects: PROJECTS, reports, inbox };
}

// Writes the seed into an open dbx (see shared/dbx.js). Idempotent: clears existing rows.
export function applySeed(dbx, opts = {}) {
  const data = buildSeed(opts);
  dbx.tx(() => {
    for (const t of ["audit_log", "inbox_messages", "report_photos", "report_issues", "report_materials", "report_activities", "report_equipment", "report_manpower", "daily_reports", "boq_items", "project_members", "projects", "users", "company"]) dbx.run(`DELETE FROM ${t}`);
    dbx.run("DELETE FROM sqlite_sequence");
    dbx.run("INSERT INTO company (id,name_ar,name_en,cr_no,vat_no,city,phone,email) VALUES (1,?,?,?,?,?,?,?)", [data.company.name_ar, data.company.name_en, data.company.cr_no, data.company.vat_no, data.company.city, data.company.phone, data.company.email]);
    const uid = {};
    for (const u of data.users) uid[u.email] = dbx.run("INSERT INTO users (name,email,phone,role,password_hash) VALUES (?,?,?,?,?)", [u.name, u.email, u.phone, u.role, DEMO_HASH]).lastId;
    const pid = {}, boqId = {};
    for (const p of data.projects) {
      pid[p.code] = dbx.run("INSERT INTO projects (code,name_ar,name_en,client,consultant,city,start_date,end_date,contract_value,status,pm_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [p.code, p.name_ar, p.name_en, p.client, p.consultant, p.city, p.start_date, p.end_date, p.contract_value, "active", uid[p.pm]]).lastId;
      for (const m of [p.pm, ...p.members]) dbx.run("INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)", [pid[p.code], uid[m]]);
      for (const [code, ar, en, unit, qty, rate] of p.boq) boqId[`${p.code}/${code}`] = dbx.run("INSERT INTO boq_items (project_id,code,desc_ar,desc_en,unit,qty,rate) VALUES (?,?,?,?,?,?,?)", [pid[p.code], code, ar, en, unit, qty, rate]).lastId;
    }
    for (const r of data.reports) {
      const no = `DPR-${r.project.slice(-3)}-${r.report_date.replace(/-/g, "")}${r.shift === "night" ? "N" : ""}`;
      const rid = dbx.run("INSERT INTO daily_reports (project_id,report_no,report_date,shift,weather,temp_c,status,notes,safety_notes,pm_comment,created_by,submitted_at,approved_by,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [pid[r.project], no, r.report_date, r.shift, r.weather, r.temp_c, r.status, r.notes, r.safety_notes, r.pm_comment, uid[r.created_by], r.status !== "draft" ? `${r.report_date} 17:30:00` : null, r.approved_by ? uid[r.approved_by] : null, r.status === "approved" ? `${r.report_date} 20:10:00` : null]).lastId;
      for (const m of r.manpower) dbx.run("INSERT INTO report_manpower (report_id,trade,count,hours) VALUES (?,?,?,?)", [rid, m.trade, m.count, m.hours]);
      for (const e of r.equipment) dbx.run("INSERT INTO report_equipment (report_id,name,count,hours,status) VALUES (?,?,?,?,?)", [rid, e.name, e.count, e.hours, e.status]);
      for (const a of r.activities) dbx.run("INSERT INTO report_activities (report_id,boq_item_id,description,location,qty,unit) VALUES (?,?,?,?,?,?)", [rid, boqId[`${r.project}/${a.boq_code}`] ?? null, a.description, a.location, a.qty, a.unit]);
      for (const m of r.materials) dbx.run("INSERT INTO report_materials (report_id,material,qty,unit,supplier,delivery_note) VALUES (?,?,?,?,?,?)", [rid, m.material, m.qty, m.unit, m.supplier, m.delivery_note]);
      for (const i of r.issues) dbx.run("INSERT INTO report_issues (report_id,type,severity,description,status) VALUES (?,?,?,?,?)", [rid, i.type, i.severity, i.description, i.status]);
    }
    for (const m of data.inbox) dbx.run("INSERT INTO inbox_messages (project_id,channel,sender,body,received_at,status,parsed_json) VALUES (?,?,?,?,?,?,?)", [pid[m.project], "whatsapp", m.sender, m.body, m.received_at, "parsed", JSON.stringify(m.parsed)]);
    dbx.run("INSERT INTO audit_log (action,entity,detail) VALUES ('seed','database','Sample data loaded')");
  });
  return data;
}
