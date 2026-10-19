import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import initSqlJs from "sql.js";
import { wrap } from "../shared/dbx.js";
import { applySeed } from "../shared/seed.js";
import { auth, projects, reports, inbox, dashboard, ApiError } from "../shared/service.js";

let dbx, pm, foreman, viewer;
before(async () => {
  const SQL = await initSqlJs();
  dbx = wrap(new SQL.Database());
  dbx.exec(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  applySeed(dbx, { today: new Date("2026-10-19"), days: 20 });
  pm = { user: (await auth.login(dbx, { email: "sara@ufuq.example", password: "demo1234" })).user };
  foreman = { user: (await auth.login(dbx, { email: "ahmed@ufuq.example", password: "demo1234" })).user };
  viewer = { user: (await auth.login(dbx, { email: "viewer@ufuq.example", password: "demo1234" })).user };
});

test("login rejects wrong password", async () => {
  await assert.rejects(() => auth.login(dbx, { email: "sara@ufuq.example", password: "nope" }), e => e instanceof ApiError && e.status === 401);
});

test("project membership scopes what a foreman sees", () => {
  const mine = projects.list(dbx, foreman);
  assert.equal(mine.length, 1); assert.equal(mine[0].code, "UB-2026-014");
  assert.equal(projects.list(dbx, viewer).length, 3);
  assert.throws(() => projects.get(dbx, foreman, 2), e => e.code === "not_a_member");
});

test("progress is value-weighted and capped at the BOQ quantity", () => {
  const p = projects.get(dbx, pm, 1);
  const total = p.boq.reduce((a, b) => a + b.qty * b.rate, 0);
  const earned = p.boq.reduce((a, b) => a + Math.min(b.executed, b.qty) * b.rate, 0);
  assert.equal(p.progress_pct, +(100 * earned / total).toFixed(1));
  assert.ok(p.boq.every(b => b.pct <= 100));
});

test("report workflow: create → update → submit → return → resubmit → approve", () => {
  const r = reports.create(dbx, foreman, { project_id: 1, report_date: "2026-11-01" });
  assert.equal(r.status, "draft"); assert.equal(r.report_no, "DPR-014-20261101");
  assert.throws(() => reports.submit(dbx, foreman, r.id), e => e.code === "empty_report");
  reports.update(dbx, foreman, r.id, { manpower: [{ trade: "labour", count: 12, hours: 8 }], activities: [{ description: "Slab pour", qty: 40, unit: "m3", boq_item_id: 5 }] });
  const s = reports.submit(dbx, foreman, r.id); assert.equal(s.status, "submitted");
  assert.throws(() => reports.update(dbx, foreman, r.id, { notes: "x" }), e => e.code === "locked");
  assert.throws(() => reports.approve(dbx, foreman, r.id), e => e.status === 403);
  const ret = reports.return(dbx, pm, r.id, { comment: "fix qty" }); assert.equal(ret.status, "returned"); assert.equal(ret.pm_comment, "fix qty");
  reports.update(dbx, foreman, r.id, { activities: [{ description: "Slab pour", qty: 38, unit: "m3", boq_item_id: 5 }] });
  reports.submit(dbx, foreman, r.id);
  const a = reports.approve(dbx, pm, r.id); assert.equal(a.status, "approved"); assert.equal(a.approved_by, pm.user.id);
  assert.throws(() => reports.remove(dbx, foreman, r.id), e => e.code === "locked");
});

test("duplicate report for same date/shift is rejected", () => {
  assert.throws(() => reports.create(dbx, foreman, { project_id: 1, report_date: "2026-11-01" }), e => e.code === "duplicate");
});

test("inbox: receive → apply creates the day's report and links BOQ items", () => {
  const m = inbox.receive(dbx, foreman, { project_id: 1, sender: "+9665XXXXXX06", body: "carpenters 9, labours 14. Slab concrete pour 44 m3 level 5. Crane 1 idle. Received 150 bags cement DN 8811.", received_at: "2026-11-02 08:00:00" });
  assert.equal(m.parsed.manpower.length, 2);
  const res = inbox.apply(dbx, foreman, m.id, {});
  assert.deepEqual(res.added, { manpower: 2, equipment: 1, activities: 1, materials: 1, issues: 0 });
  const r = reports.get(dbx, foreman, res.report_id);
  assert.equal(r.report_date, "2026-11-02");
  assert.equal(r.activities[0].boq_code, "B-03"); // matched "Slab concrete" by activity + unit
  assert.equal(r.manpower.find(x => x.trade === "carpenter").count, 9);
  // applying a second message to the same day updates counts instead of duplicating
  const m2 = inbox.receive(dbx, foreman, { project_id: 1, sender: "+9665XXXXXX06", body: "carpenters 11", received_at: "2026-11-02 12:00:00" });
  inbox.apply(dbx, foreman, m2.id, {});
  const r2 = reports.get(dbx, foreman, res.report_id);
  assert.equal(r2.manpower.filter(x => x.trade === "carpenter").length, 1);
  assert.equal(r2.manpower.find(x => x.trade === "carpenter").count, 11);
});

test("webhook-style message routes to a project by sender phone", () => {
  const m = inbox.receive(dbx, null, { sender: "+9665XXXXXX07", body: "labours 5" });
  assert.equal(m.project_id, 2); // Rami is a member of project 2 (and 3); first by id
});

test("dashboard summary counts pending approvals for a PM", () => {
  const d = dashboard.summary(dbx, pm);
  assert.ok(d.projects.length >= 2);
  assert.equal(typeof d.pending_approvals, "number");
  assert.ok(Array.isArray(d.manpower_trend));
});

test("viewer cannot write", () => {
  assert.throws(() => reports.create(dbx, viewer, { project_id: 1, report_date: "2026-12-01" }), e => e.status === 403);
  assert.throws(() => projects.addBoq(dbx, viewer, 1, { code: "X", unit: "m" }), e => e.status === 403);
});
