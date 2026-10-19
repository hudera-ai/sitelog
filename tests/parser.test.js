import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMessage, normalizeDigits, matchBoqItem } from "../shared/parser.js";

test("normalizes Arabic-Indic digits", () => {
  assert.equal(normalizeDigits("٣٥٠ م٣ و١٢"), "350 م3 و12");
});

test("Arabic foreman message → manpower, activities, equipment, materials, issues", () => {
  const p = parseMessage("صباح الخير، النهارده في الموقع 12 نجار، 8 حداد، 20 عامل، 2 كهربائي. تم صب 35 م3 خرسانة سقف الدور الثاني. حفار 1 شغال، لودر 1 عطلان. وصل 200 كيس اسمنت من شركة الصفوة بوليصة 4471. ملاحظة: تأخر وصول الحديد.");
  assert.deepEqual(p.manpower.map(m => [m.trade, m.count]), [["carpenter", 12], ["steel_fixer", 8], ["labour", 20], ["electrician", 2]]);
  assert.equal(p.activities.length, 1);
  assert.equal(p.activities[0].activity, "concrete_pour"); assert.equal(p.activities[0].qty, 35); assert.equal(p.activities[0].unit, "m3");
  assert.deepEqual(p.equipment.map(e => [e.name, e.status]), [["excavator", "working"], ["loader", "breakdown"]]);
  assert.equal(p.materials[0].material, "cement"); assert.equal(p.materials[0].qty, 200); assert.equal(p.materials[0].unit, "bag"); assert.equal(p.materials[0].delivery_note, "4471"); assert.equal(p.materials[0].supplier, "شركة الصفوة");
  assert.equal(p.issues.length, 1); assert.equal(p.issues[0].type, "material");
});

test("English message with labelled issue", () => {
  const p = parseMessage("Today: carpenters 10, steel fixers 6, labours 15. Concrete pouring 42 m3 slab L3. Excavator 2 working, crane 1 idle. Received 120 bags cement DN 4471. Issue: client stopped work at zone B for 2 hrs.");
  assert.deepEqual(p.manpower.map(m => [m.trade, m.count]), [["carpenter", 10], ["steel_fixer", 6], ["labour", 15]]);
  assert.equal(p.equipment[1].status, "idle");
  assert.equal(p.issues[0].type, "client"); assert.equal(p.issues[0].severity, "high");
  assert.equal(p.materials[0].qty, 120);
});

test("'delay in steel delivery' is an issue, not a material", () => {
  const p = parseMessage("Issue: delay in steel delivery, expected tomorrow.");
  assert.equal(p.materials.length, 0); assert.equal(p.issues.length, 1); assert.equal(p.issues[0].type, "delay");
});

test("coring / cutting quantities win over equipment words; waw-joined pairs split", () => {
  const p = parseMessage("كور 40 نقطة في البدروم وقص 25 م.ط جدار محور C. فني قص 4 وعمال 6. مكينة كور 2 شغالة.");
  assert.deepEqual(p.activities.map(a => [a.activity, a.qty, a.unit]), [["coring", 40, "nos"], ["cutting", 25, "m"]]);
  assert.deepEqual(p.manpower.map(m => [m.trade, m.count]), [["cutting_tech", 4], ["labour", 6]]);
  assert.deepEqual(p.equipment.map(e => [e.name, e.count]), [["core_machine", 2]]);
});

test("safety incident gets high severity", () => {
  const p = parseMessage("حادث بسيط: اصابة عامل في اليد وتم اسعافه");
  assert.equal(p.issues[0].type, "safety"); assert.equal(p.issues[0].severity, "high");
});

test("BOQ matching by activity type and unit", () => {
  const boq = [{ id: 1, desc_en: "Slab concrete", desc_ar: "خرسانة أسقف", unit: "m3" }, { id: 2, desc_en: "Blockwork", desc_ar: "مباني بلوك", unit: "m2" }];
  const a = parseMessage("pour 40 m3 slab level 3").activities[0];
  assert.equal(matchBoqItem(a, boq)?.id, 1);
  const b = parseMessage("blockwork 120 m2 villa 4").activities[0];
  assert.equal(matchBoqItem(b, boq)?.id, 2);
});

test("empty / unknown text is harmless", () => {
  assert.deepEqual(parseMessage("").manpower, []);
  const p = parseMessage("hello team, good morning");
  assert.equal(p.manpower.length + p.equipment.length + p.activities.length + p.materials.length + p.issues.length, 0);
});
