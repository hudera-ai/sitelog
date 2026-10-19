// Domain service: every operation the app offers, written once against the dbx
// interface. The Node server exposes these over REST (server/src/routes.js); the
// browser demo calls them directly against an in-browser SQLite (web/src/api-local.js).

import { verifyPassword, randomToken } from "./auth.js";
import { parseMessage, matchBoqItem } from "./parser.js";

export class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const today = () => new Date().toISOString().slice(0, 10);
const num = v => (v === "" || v == null ? 0 : Number(v));

const ROLE_RANK = { viewer: 0, foreman: 1, engineer: 2, pm: 3, admin: 4 };
function require(ctx, minRole) {
  if (!ctx?.user) throw new ApiError(401, "unauthenticated");
  if (ROLE_RANK[ctx.user.role] < ROLE_RANK[minRole]) throw new ApiError(403, "forbidden", `Requires role ${minRole}`);
}
function canSeeProject(dbx, ctx, projectId) {
  if (["admin", "viewer"].includes(ctx.user.role)) return true;
  return !!dbx.get("SELECT 1 FROM project_members WHERE project_id=? AND user_id=?", [projectId, ctx.user.id]);
}
function assertProject(dbx, ctx, projectId) {
  const p = dbx.get("SELECT * FROM projects WHERE id=?", [projectId]);
  if (!p) throw new ApiError(404, "project_not_found");
  if (!canSeeProject(dbx, ctx, projectId)) throw new ApiError(403, "not_a_member");
  return p;
}
function audit(dbx, ctx, action, entity, entityId, detail) {
  dbx.run("INSERT INTO audit_log (user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?)", [ctx?.user?.id ?? null, action, entity, entityId ?? null, detail ? JSON.stringify(detail).slice(0, 500) : null]);
}

// ---- auth ------------------------------------------------------------------
export const auth = {
  async login(dbx, { email, password }) {
    const u = dbx.get("SELECT * FROM users WHERE lower(email)=lower(?) AND active=1", [String(email || "").trim()]);
    if (!u || !(await verifyPassword(String(password || ""), u.password_hash))) throw new ApiError(401, "bad_credentials", "Wrong email or password");
    const { password_hash, ...user } = u;
    return { token: randomToken(), user };
  },
  users(dbx, ctx) { require(ctx, "viewer"); return dbx.all("SELECT id,name,email,phone,role,active FROM users ORDER BY role, name"); },
};

// ---- company ----------------------------------------------------------------
export function company(dbx) { return dbx.get("SELECT * FROM company WHERE id=1"); }

// ---- projects ----------------------------------------------------------------
export const projects = {
  list(dbx, ctx) {
    require(ctx, "viewer");
    const rows = ["admin", "viewer"].includes(ctx.user.role)
      ? dbx.all("SELECT p.*, u.name AS pm_name FROM projects p LEFT JOIN users u ON u.id=p.pm_id ORDER BY p.code")
      : dbx.all("SELECT p.*, u.name AS pm_name FROM projects p LEFT JOIN users u ON u.id=p.pm_id JOIN project_members m ON m.project_id=p.id AND m.user_id=? ORDER BY p.code", [ctx.user.id]);
    return rows.map(p => ({ ...p, ...projects.stats(dbx, p.id) }));
  },
  get(dbx, ctx, id) {
    const p = assertProject(dbx, ctx, id);
    const pm = dbx.get("SELECT name FROM users WHERE id=?", [p.pm_id]);
    return { ...p, pm_name: pm?.name, ...projects.stats(dbx, id), boq: projects.progress(dbx, id),
      members: dbx.all("SELECT u.id,u.name,u.role,u.email FROM users u JOIN project_members m ON m.user_id=u.id WHERE m.project_id=? ORDER BY u.role DESC", [id]) };
  },
  stats(dbx, id) {
    const s = dbx.get(`SELECT COUNT(*) AS reports,
        SUM(status='draft') AS draft, SUM(status='submitted') AS submitted, SUM(status='approved') AS approved, SUM(status='returned') AS returned,
        MAX(report_date) AS last_report FROM daily_reports WHERE project_id=?`, [id]);
    const issues = dbx.get("SELECT COUNT(*) AS open_issues FROM report_issues i JOIN daily_reports r ON r.id=i.report_id WHERE r.project_id=? AND i.status='open'", [id]);
    const mp = dbx.get("SELECT COALESCE(SUM(m.count),0) AS manpower FROM report_manpower m JOIN daily_reports r ON r.id=m.report_id WHERE r.project_id=? AND r.report_date=(SELECT MAX(report_date) FROM daily_reports WHERE project_id=?)", [id, id]);
    const prog = projects.progress(dbx, id);
    const totalValue = prog.reduce((a, b) => a + b.qty * b.rate, 0);
    const earned = prog.reduce((a, b) => a + Math.min(b.executed, b.qty) * b.rate, 0);
    return { ...s, open_issues: issues.open_issues, last_manpower: mp.manpower, progress_pct: totalValue ? +(100 * earned / totalValue).toFixed(1) : 0, earned_value: Math.round(earned) };
  },
  progress(dbx, id) {
    return dbx.all(`SELECT b.*, COALESCE((SELECT SUM(a.qty) FROM report_activities a JOIN daily_reports r ON r.id=a.report_id WHERE a.boq_item_id=b.id AND r.status<>'returned'),0) AS executed
                    FROM boq_items b WHERE b.project_id=? ORDER BY b.code`, [id]).map(b => ({ ...b, pct: b.qty ? +Math.min(100, 100 * b.executed / b.qty).toFixed(1) : 0 }));
  },
  create(dbx, ctx, p) {
    require(ctx, "pm");
    if (!p.code || !p.name_en) throw new ApiError(400, "validation", "code and name_en are required");
    const r = dbx.run("INSERT INTO projects (code,name_ar,name_en,client,consultant,city,start_date,end_date,contract_value,status,pm_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [p.code, p.name_ar || p.name_en, p.name_en, p.client || null, p.consultant || null, p.city || null, p.start_date || null, p.end_date || null, num(p.contract_value), p.status || "active", p.pm_id || ctx.user.id]);
    dbx.run("INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)", [r.lastId, p.pm_id || ctx.user.id]);
    audit(dbx, ctx, "create", "project", r.lastId, { code: p.code });
    return projects.get(dbx, ctx, r.lastId);
  },
  update(dbx, ctx, id, p) {
    require(ctx, "pm"); assertProject(dbx, ctx, id);
    const fields = ["name_ar", "name_en", "client", "consultant", "city", "start_date", "end_date", "contract_value", "status", "pm_id"].filter(f => f in p);
    if (fields.length) dbx.run(`UPDATE projects SET ${fields.map(f => `${f}=?`).join(",")} WHERE id=?`, [...fields.map(f => p[f]), id]);
    if (Array.isArray(p.member_ids)) { dbx.run("DELETE FROM project_members WHERE project_id=?", [id]); for (const u of p.member_ids) dbx.run("INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)", [id, u]); }
    audit(dbx, ctx, "update", "project", id, fields);
    return projects.get(dbx, ctx, id);
  },
  addBoq(dbx, ctx, id, it) {
    require(ctx, "pm"); assertProject(dbx, ctx, id);
    if (!it.code || !it.unit) throw new ApiError(400, "validation", "code and unit are required");
    const r = dbx.run("INSERT INTO boq_items (project_id,code,desc_ar,desc_en,unit,qty,rate) VALUES (?,?,?,?,?,?,?)", [id, it.code, it.desc_ar || it.desc_en || "", it.desc_en || it.desc_ar || "", it.unit, num(it.qty), num(it.rate)]);
    audit(dbx, ctx, "create", "boq_item", r.lastId, { code: it.code });
    return dbx.get("SELECT * FROM boq_items WHERE id=?", [r.lastId]);
  },
  updateBoq(dbx, ctx, id, itemId, it) {
    require(ctx, "pm"); assertProject(dbx, ctx, id);
    const fields = ["code", "desc_ar", "desc_en", "unit", "qty", "rate"].filter(f => f in it);
    dbx.run(`UPDATE boq_items SET ${fields.map(f => `${f}=?`).join(",")} WHERE id=? AND project_id=?`, [...fields.map(f => it[f]), itemId, id]);
    return dbx.get("SELECT * FROM boq_items WHERE id=?", [itemId]);
  },
  deleteBoq(dbx, ctx, id, itemId) { require(ctx, "pm"); assertProject(dbx, ctx, id); dbx.run("DELETE FROM boq_items WHERE id=? AND project_id=?", [itemId, id]); return { ok: true }; },
};

// ---- daily reports -------------------------------------------------------------
const LINE_TABLES = {
  manpower:   ["report_manpower",   ["trade", "count", "hours"]],
  equipment:  ["report_equipment",  ["name", "count", "hours", "status"]],
  activities: ["report_activities", ["boq_item_id", "description", "location", "qty", "unit"]],
  materials:  ["report_materials",  ["material", "qty", "unit", "supplier", "delivery_note"]],
  issues:     ["report_issues",     ["type", "severity", "description", "status"]],
  photos:     ["report_photos",     ["caption", "url"]],
};
function reportNo(dbx, projectId, date, shift) {
  const p = dbx.get("SELECT code FROM projects WHERE id=?", [projectId]);
  return `DPR-${p.code.slice(-3)}-${date.replace(/-/g, "")}${shift === "night" ? "N" : ""}`;
}
function canEdit(ctx, r) {
  if (ctx.user.role === "admin") return true;
  if (ctx.user.role === "viewer") return false;
  if (["pm"].includes(ctx.user.role)) return true;
  return ["draft", "returned"].includes(r.status);
}

export const reports = {
  list(dbx, ctx, q = {}) {
    require(ctx, "viewer");
    const where = [], params = [];
    if (!["admin", "viewer"].includes(ctx.user.role)) { where.push("r.project_id IN (SELECT project_id FROM project_members WHERE user_id=?)"); params.push(ctx.user.id); }
    if (q.project_id) { where.push("r.project_id=?"); params.push(q.project_id); }
    if (q.status) { where.push("r.status=?"); params.push(q.status); }
    if (q.from) { where.push("r.report_date>=?"); params.push(q.from); }
    if (q.to) { where.push("r.report_date<=?"); params.push(q.to); }
    const limit = Math.min(num(q.limit) || 50, 200), offset = num(q.offset);
    const sql = `FROM daily_reports r JOIN projects p ON p.id=r.project_id LEFT JOIN users u ON u.id=r.created_by ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
    const total = dbx.get(`SELECT COUNT(*) AS n ${sql}`, params).n;
    const rows = dbx.all(`SELECT r.*, p.code AS project_code, p.name_en AS project_name_en, p.name_ar AS project_name_ar, u.name AS created_by_name,
        (SELECT COALESCE(SUM(count),0) FROM report_manpower WHERE report_id=r.id) AS manpower,
        (SELECT COUNT(*) FROM report_activities WHERE report_id=r.id) AS activities,
        (SELECT COUNT(*) FROM report_issues WHERE report_id=r.id AND status='open') AS open_issues
        ${sql} ORDER BY r.report_date DESC, r.project_id LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { total, rows };
  },
  get(dbx, ctx, id) {
    require(ctx, "viewer");
    const r = dbx.get("SELECT r.*, p.code AS project_code, p.name_en AS project_name_en, p.name_ar AS project_name_ar, p.client, p.consultant, p.city, u.name AS created_by_name, a.name AS approved_by_name FROM daily_reports r JOIN projects p ON p.id=r.project_id LEFT JOIN users u ON u.id=r.created_by LEFT JOIN users a ON a.id=r.approved_by WHERE r.id=?", [id]);
    if (!r) throw new ApiError(404, "report_not_found");
    assertProject(dbx, ctx, r.project_id);
    for (const [k, [t]] of Object.entries(LINE_TABLES)) r[k] = dbx.all(`SELECT * FROM ${t} WHERE report_id=? ORDER BY id`, [id]);
    r.activities = r.activities.map(a => ({ ...a, boq_code: a.boq_item_id ? dbx.get("SELECT code FROM boq_items WHERE id=?", [a.boq_item_id])?.code : null }));
    r.can_edit = canEdit(ctx, r);
    return r;
  },
  create(dbx, ctx, { project_id, report_date = today(), shift = "day", ...rest }) {
    require(ctx, "foreman"); assertProject(dbx, ctx, project_id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report_date)) throw new ApiError(400, "validation", "report_date must be YYYY-MM-DD");
    if (dbx.get("SELECT id FROM daily_reports WHERE project_id=? AND report_date=? AND shift=?", [project_id, report_date, shift])) throw new ApiError(409, "duplicate", "A report for this date and shift already exists");
    const r = dbx.run("INSERT INTO daily_reports (project_id,report_no,report_date,shift,weather,temp_c,notes,safety_notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
      [project_id, reportNo(dbx, project_id, report_date, shift), report_date, shift, rest.weather || "sunny", rest.temp_c ?? null, rest.notes || null, rest.safety_notes || null, ctx.user.id]);
    audit(dbx, ctx, "create", "report", r.lastId, { report_date });
    if (Object.keys(LINE_TABLES).some(k => rest[k])) return reports.update(dbx, ctx, r.lastId, rest);
    return reports.get(dbx, ctx, r.lastId);
  },
  update(dbx, ctx, id, payload) {
    require(ctx, "foreman");
    const r = dbx.get("SELECT * FROM daily_reports WHERE id=?", [id]);
    if (!r) throw new ApiError(404, "report_not_found");
    assertProject(dbx, ctx, r.project_id);
    if (!canEdit(ctx, r)) throw new ApiError(409, "locked", `Report is ${r.status}; only a PM can change it`);
    dbx.tx(() => {
      const fields = ["weather", "temp_c", "notes", "safety_notes", "shift"].filter(f => f in payload);
      dbx.run(`UPDATE daily_reports SET ${[...fields.map(f => `${f}=?`), "updated_at=?"].join(",")} WHERE id=?`, [...fields.map(f => payload[f]), now(), id]);
      for (const [k, [t, cols]] of Object.entries(LINE_TABLES)) {
        if (!Array.isArray(payload[k])) continue;
        dbx.run(`DELETE FROM ${t} WHERE report_id=?`, [id]);
        for (const line of payload[k]) {
          if (k === "activities" && !line.description) continue;
          if (k === "manpower" && !line.trade) continue;
          dbx.run(`INSERT INTO ${t} (report_id,${cols.join(",")}) VALUES (?,${cols.map(() => "?").join(",")})`, [id, ...cols.map(c => line[c] ?? null)]);
        }
      }
    });
    audit(dbx, ctx, "update", "report", id, Object.keys(payload));
    return reports.get(dbx, ctx, id);
  },
  submit(dbx, ctx, id) {
    require(ctx, "foreman");
    const r = dbx.get("SELECT * FROM daily_reports WHERE id=?", [id]); if (!r) throw new ApiError(404, "report_not_found"); assertProject(dbx, ctx, r.project_id);
    if (!["draft", "returned"].includes(r.status)) throw new ApiError(409, "bad_state");
    const lines = dbx.get("SELECT (SELECT COUNT(*) FROM report_manpower WHERE report_id=?)+(SELECT COUNT(*) FROM report_activities WHERE report_id=?) AS n", [id, id]).n;
    if (!lines) throw new ApiError(400, "empty_report", "Add manpower or activities before submitting");
    dbx.run("UPDATE daily_reports SET status='submitted', submitted_at=?, pm_comment=NULL, updated_at=? WHERE id=?", [now(), now(), id]);
    audit(dbx, ctx, "submit", "report", id); return reports.get(dbx, ctx, id);
  },
  approve(dbx, ctx, id) {
    require(ctx, "pm");
    const r = dbx.get("SELECT * FROM daily_reports WHERE id=?", [id]); if (!r) throw new ApiError(404, "report_not_found"); assertProject(dbx, ctx, r.project_id);
    if (r.status !== "submitted") throw new ApiError(409, "bad_state", "Only submitted reports can be approved");
    dbx.run("UPDATE daily_reports SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?", [ctx.user.id, now(), now(), id]);
    audit(dbx, ctx, "approve", "report", id); return reports.get(dbx, ctx, id);
  },
  return(dbx, ctx, id, { comment }) {
    require(ctx, "pm");
    const r = dbx.get("SELECT * FROM daily_reports WHERE id=?", [id]); if (!r) throw new ApiError(404, "report_not_found"); assertProject(dbx, ctx, r.project_id);
    if (!["submitted", "approved"].includes(r.status)) throw new ApiError(409, "bad_state");
    if (!comment) throw new ApiError(400, "validation", "A comment is required when returning a report");
    dbx.run("UPDATE daily_reports SET status='returned', pm_comment=?, approved_by=NULL, approved_at=NULL, updated_at=? WHERE id=?", [comment, now(), id]);
    audit(dbx, ctx, "return", "report", id, { comment }); return reports.get(dbx, ctx, id);
  },
  remove(dbx, ctx, id) {
    require(ctx, "foreman");
    const r = dbx.get("SELECT * FROM daily_reports WHERE id=?", [id]); if (!r) throw new ApiError(404, "report_not_found"); assertProject(dbx, ctx, r.project_id);
    if (r.status !== "draft" && ctx.user.role !== "admin") throw new ApiError(409, "locked", "Only drafts can be deleted");
    dbx.run("DELETE FROM daily_reports WHERE id=?", [id]); audit(dbx, ctx, "delete", "report", id); return { ok: true };
  },
};

// ---- inbox (field messages → report lines) ----------------------------------------
export const inbox = {
  list(dbx, ctx, q = {}) {
    require(ctx, "foreman");
    const where = [], params = [];
    if (!["admin", "viewer"].includes(ctx.user.role)) { where.push("(m.project_id IS NULL OR m.project_id IN (SELECT project_id FROM project_members WHERE user_id=?))"); params.push(ctx.user.id); }
    if (q.status) { where.push("m.status=?"); params.push(q.status); }
    if (q.project_id) { where.push("m.project_id=?"); params.push(q.project_id); }
    return dbx.all(`SELECT m.*, p.code AS project_code, p.name_en AS project_name_en, p.name_ar AS project_name_ar, r.report_no FROM inbox_messages m LEFT JOIN projects p ON p.id=m.project_id LEFT JOIN daily_reports r ON r.id=m.report_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY m.received_at DESC LIMIT 200`, params)
      .map(m => ({ ...m, parsed: m.parsed_json ? JSON.parse(m.parsed_json) : null }));
  },
  // Entry point for a WhatsApp webhook or the app's "paste a message" form.
  receive(dbx, ctx, { project_id = null, sender, body, channel = "whatsapp", received_at }) {
    if (!body) throw new ApiError(400, "validation", "body is required");
    if (project_id && ctx) assertProject(dbx, ctx, project_id);
    if (!project_id && sender) { // route by the sender's phone → projects they belong to
      const u = dbx.get("SELECT id FROM users WHERE phone=?", [sender]);
      if (u) project_id = dbx.get("SELECT project_id FROM project_members WHERE user_id=? ORDER BY project_id LIMIT 1", [u.id])?.project_id ?? null;
    }
    const parsed = parseMessage(body);
    const r = dbx.run("INSERT INTO inbox_messages (project_id,channel,sender,body,received_at,status,parsed_json) VALUES (?,?,?,?,?,?,?)", [project_id, channel, sender || "unknown", body, received_at || now(), "parsed", JSON.stringify(parsed)]);
    audit(dbx, ctx, "receive", "inbox", r.lastId, { channel, sender });
    return { id: r.lastId, project_id, parsed };
  },
  reparse(dbx, ctx, id, { project_id } = {}) {
    require(ctx, "foreman");
    const m = dbx.get("SELECT * FROM inbox_messages WHERE id=?", [id]); if (!m) throw new ApiError(404, "message_not_found");
    const parsed = parseMessage(m.body);
    dbx.run("UPDATE inbox_messages SET parsed_json=?, status='parsed', project_id=COALESCE(?,project_id) WHERE id=?", [JSON.stringify(parsed), project_id ?? null, id]);
    return { id, parsed };
  },
  // Merge the parsed lines into the project's report for that day (creating a draft if needed).
  apply(dbx, ctx, id, { report_date, shift = "day", lines } = {}) {
    require(ctx, "foreman");
    const m = dbx.get("SELECT * FROM inbox_messages WHERE id=?", [id]); if (!m) throw new ApiError(404, "message_not_found");
    if (!m.project_id) throw new ApiError(400, "no_project", "Assign the message to a project first");
    assertProject(dbx, ctx, m.project_id);
    const parsed = lines || JSON.parse(m.parsed_json || "null") || parseMessage(m.body);
    const date = report_date || m.received_at.slice(0, 10);
    let rep = dbx.get("SELECT * FROM daily_reports WHERE project_id=? AND report_date=? AND shift=?", [m.project_id, date, shift]);
    if (!rep) { reports.create(dbx, ctx, { project_id: m.project_id, report_date: date, shift }); rep = dbx.get("SELECT * FROM daily_reports WHERE project_id=? AND report_date=? AND shift=?", [m.project_id, date, shift]); }
    if (!canEdit(ctx, rep)) throw new ApiError(409, "locked", `Report ${rep.report_no} is ${rep.status}`);
    const boq = dbx.all("SELECT * FROM boq_items WHERE project_id=?", [m.project_id]);
    const added = { manpower: 0, equipment: 0, activities: 0, materials: 0, issues: 0 };
    dbx.tx(() => {
      for (const l of parsed.manpower || []) {
        const ex = dbx.get("SELECT id FROM report_manpower WHERE report_id=? AND trade=?", [rep.id, l.trade]);
        if (ex) dbx.run("UPDATE report_manpower SET count=? WHERE id=?", [num(l.count), ex.id]); else dbx.run("INSERT INTO report_manpower (report_id,trade,count,hours) VALUES (?,?,?,8)", [rep.id, l.trade, num(l.count)]);
        added.manpower++;
      }
      for (const l of parsed.equipment || []) {
        const ex = dbx.get("SELECT id FROM report_equipment WHERE report_id=? AND name=?", [rep.id, l.name]);
        if (ex) dbx.run("UPDATE report_equipment SET count=?, status=? WHERE id=?", [num(l.count) || 1, l.status, ex.id]); else dbx.run("INSERT INTO report_equipment (report_id,name,count,hours,status) VALUES (?,?,?,8,?)", [rep.id, l.name, num(l.count) || 1, l.status]);
        added.equipment++;
      }
      for (const l of parsed.activities || []) {
        const b = l.boq_item_id ? boq.find(x => x.id === l.boq_item_id) : matchBoqItem(l, boq);
        dbx.run("INSERT INTO report_activities (report_id,boq_item_id,description,location,qty,unit) VALUES (?,?,?,?,?,?)", [rep.id, b?.id ?? null, l.description, l.location || null, num(l.qty), l.unit || b?.unit || null]); added.activities++;
      }
      for (const l of parsed.materials || []) { dbx.run("INSERT INTO report_materials (report_id,material,qty,unit,supplier,delivery_note) VALUES (?,?,?,?,?,?)", [rep.id, l.material, num(l.qty), l.unit || null, l.supplier || null, l.delivery_note || null]); added.materials++; }
      for (const l of parsed.issues || []) { dbx.run("INSERT INTO report_issues (report_id,type,severity,description,status) VALUES (?,?,?,?,'open')", [rep.id, l.type || "other", l.severity || "medium", l.description]); added.issues++; }
      dbx.run("UPDATE daily_reports SET updated_at=? WHERE id=?", [now(), rep.id]);
      dbx.run("UPDATE inbox_messages SET status='applied', report_id=? WHERE id=?", [rep.id, id]);
    });
    audit(dbx, ctx, "apply", "inbox", id, { report_id: rep.id, added });
    return { report_id: rep.id, report_no: rep.report_no, added };
  },
  ignore(dbx, ctx, id) { require(ctx, "foreman"); dbx.run("UPDATE inbox_messages SET status='ignored' WHERE id=?", [id]); return { ok: true }; },
};

// ---- dashboard ---------------------------------------------------------------------
export const dashboard = {
  summary(dbx, ctx) {
    require(ctx, "viewer");
    const ps = projects.list(dbx, ctx);
    const ids = ps.map(p => p.id);
    const inIds = ids.length ? `(${ids.join(",")})` : "(NULL)";
    const pending = dbx.get(`SELECT COUNT(*) AS n FROM daily_reports WHERE status='submitted' AND project_id IN ${inIds}`).n;
    const openIssues = dbx.all(`SELECT i.*, r.report_date, r.report_no, p.code AS project_code FROM report_issues i JOIN daily_reports r ON r.id=i.report_id JOIN projects p ON p.id=r.project_id WHERE i.status='open' AND r.project_id IN ${inIds} ORDER BY CASE i.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, r.report_date DESC LIMIT 20`);
    const newMessages = dbx.get(`SELECT COUNT(*) AS n FROM inbox_messages WHERE status IN ('new','parsed') AND (project_id IS NULL OR project_id IN ${inIds})`).n;
    const trend = dbx.all(`SELECT r.report_date AS d, SUM(m.count) AS manpower FROM daily_reports r JOIN report_manpower m ON m.report_id=r.id WHERE r.project_id IN ${inIds} AND r.report_date >= date('now','-30 day') GROUP BY r.report_date ORDER BY r.report_date`);
    const equipment = dbx.all(`SELECT e.status, SUM(e.count) AS n FROM report_equipment e JOIN daily_reports r ON r.id=e.report_id WHERE r.project_id IN ${inIds} AND r.report_date=(SELECT MAX(report_date) FROM daily_reports WHERE project_id=r.project_id) GROUP BY e.status`);
    return { projects: ps, pending_approvals: pending, open_issues: openIssues, new_messages: newMessages, manpower_trend: trend, equipment_today: equipment };
  },
  manpowerTrend(dbx, ctx, projectId, days = 30) {
    assertProject(dbx, ctx, projectId);
    return dbx.all("SELECT r.report_date AS d, m.trade, SUM(m.count) AS n FROM daily_reports r JOIN report_manpower m ON m.report_id=r.id WHERE r.project_id=? AND r.report_date >= date('now',?) GROUP BY r.report_date, m.trade ORDER BY r.report_date", [projectId, `-${days} day`]);
  },
  progressTrend(dbx, ctx, projectId) {
    assertProject(dbx, ctx, projectId);
    const boq = Object.fromEntries(dbx.all("SELECT id, qty, rate FROM boq_items WHERE project_id=?", [projectId]).map(b => [b.id, b]));
    const total = Object.values(boq).reduce((a, b) => a + b.qty * b.rate, 0) || 1;
    const rows = dbx.all("SELECT r.report_date AS d, a.boq_item_id AS b, SUM(a.qty) AS q FROM daily_reports r JOIN report_activities a ON a.report_id=r.id WHERE r.project_id=? AND a.boq_item_id IS NOT NULL AND r.status<>'returned' GROUP BY r.report_date, a.boq_item_id ORDER BY r.report_date", [projectId]);
    const exec = {}; const out = []; let last = null;
    for (const r of rows) {
      exec[r.b] = (exec[r.b] || 0) + r.q;
      const earned = Object.entries(exec).reduce((a, [id, q]) => a + Math.min(q, boq[id].qty) * boq[id].rate, 0);
      if (last && last.d === r.d) last.pct = +(100 * earned / total).toFixed(2); else { last = { d: r.d, pct: +(100 * earned / total).toFixed(2) }; out.push(last); }
    }
    return out;
  },
};

export function auditLog(dbx, ctx, limit = 100) {
  require(ctx, "pm");
  return dbx.all("SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT ?", [limit]);
}
