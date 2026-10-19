import { h, ic, chip, statusChip, table, modal, toast, field, inp, sel, confirm } from "../ui.js";
import { t, pick, fmtNum, fmtDate, fmtDateTime, lex, LANG } from "../i18n.js";
import { render } from "../main.js";
import { TRADES, EQUIPMENT, UNITS } from "../../shared/parser.js";

const WEATHER = ["sunny", "cloudy", "dusty", "hot", "windy", "rain"];
const todayStr = () => new Date().toISOString().slice(0, 10);

export async function reports(app, route) {
  if (route.id === "new") return newReport(app, route);
  const q = { project_id: route.params.project_id || "", status: route.params.status || "", from: route.params.from || "", to: route.params.to || "", limit: 60 };
  const [list, projs] = await Promise.all([app.api.reports.list(q), app.api.projects.list()]);
  const go = () => { location.hash = `#/reports?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([k, v]) => v && k !== "limit")))}`; };
  const filt = h("div", { class: "row", style: { marginBottom: "14px" } },
    sel([["", t("All projects")], ...projs.map(p => [p.id, pick(p, "name")])], q.project_id, { style: { width: "auto" }, onchange: e => { q.project_id = e.target.value; go(); } }),
    sel([["", t("All statuses")], ...["draft", "submitted", "approved", "returned"].map(s => [s, t(s)])], q.status, { style: { width: "auto" }, onchange: e => { q.status = e.target.value; go(); } }),
    inp({ type: "date", value: q.from, style: { width: "auto" }, onchange: e => { q.from = e.target.value; go(); } }), h("span", { class: "muted" }, "→"), inp({ type: "date", value: q.to, style: { width: "auto" }, onchange: e => { q.to = e.target.value; go(); } }));
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Reports")), h("div", { class: "actions" }, h("a", { class: "btn primary", href: `#/reports/new${q.project_id ? `?project_id=${q.project_id}` : ""}` }, ic("plus"), t("New report")))),
    filt,
    h("div", { class: "card" }, table([
      { l: t("Report No."), v: r => h("span", { class: "mono small", style: { fontWeight: 600 } }, r.report_no) },
      { l: t("Date"), v: r => h("div", {}, fmtDate(r.report_date), r.shift === "night" ? h("span", { class: "xs muted" }, ` · ${t("night")}`) : null) },
      { l: t("Project"), v: r => h("div", {}, h("div", {}, pick(r, "project_name")), h("div", { class: "xs muted mono" }, r.project_code)) },
      { l: t("Status"), v: r => statusChip(r.status) },
      { l: t("Manpower"), v: r => fmtNum(r.manpower), r: true, num: true }, { l: t("Activities"), v: r => fmtNum(r.activities), r: true, num: true },
      { l: t("Open issues"), v: r => r.open_issues ? chip(r.open_issues, "red") : h("span", { class: "faint" }, "0"), r: true },
      { l: t("Created by"), v: r => h("span", { class: "small" }, r.created_by_name || "—") },
    ], list.rows, { onRow: r => location.hash = `#/report/${r.id}`, empty: t("No reports yet") })),
    h("p", { class: "xs faint", style: { marginTop: "8px" } }, `${t("Show")} ${list.rows.length} ${t("of")} ${list.total}`));
}

async function newReport(app, route) {
  const projs = await app.api.projects.list();
  const f = { project_id: sel(projs.map(p => [p.id, pick(p, "name")]), route.params.project_id || projs[0]?.id), report_date: inp({ type: "date", value: todayStr() }), shift: sel([["day", t("day")], ["night", t("night")]], "day") };
  const m = modal(t("New report"), h("div", { class: "form" }, field(t("Project"), f.project_id, { class: "wide" }), field(t("Report date"), f.report_date), field(t("Shift"), f.shift)),
    [{ label: t("Cancel"), onClick: () => { history.back(); } }, { label: t("Save"), cls: "primary", onClick: async () => { try { const r = await app.api.reports.create({ project_id: +f.project_id.value, report_date: f.report_date.value, shift: f.shift.value }); location.hash = `#/report/${r.id}`; } catch (e) { toast(t(e.message), true); return false; } } }]);
  return h("div", {});
}

// ---- report editor / viewer -----------------------------------------------------------------
export async function report(app, route) {
  const r = await app.api.reports.get(route.id);
  const proj = await app.api.projects.get(r.project_id);
  let edit = r.can_edit && route.sub !== "view";
  const isPm = ["pm", "admin"].includes(app.user.role);
  const boqOpts = [["", "—"], ...proj.boq.map(b => [b.id, `${b.code} · ${pick(b, "desc")}`])];
  const tradeOpts = TRADES.map(([k]) => [k, lex(k)]), eqOpts = EQUIPMENT.map(([k]) => [k, lex(k)]), unitOpts = UNITS.map(([k]) => [k, lex(k)]);

  // editable line tables -------------------------------------------------------------------
  const state = { manpower: r.manpower.map(x => ({ ...x })), equipment: r.equipment.map(x => ({ ...x })), activities: r.activities.map(x => ({ ...x })), materials: r.materials.map(x => ({ ...x })), issues: r.issues.map(x => ({ ...x })) };
  const bind = (row, k, el) => { el.addEventListener("input", () => row[k] = el.type === "number" ? (el.value === "" ? "" : +el.value) : el.value); return el; };
  const cell = (row, k, kind, opts) => {
    if (!edit) { const v = row[k]; if (kind === "sel") return (opts.find(o => String(o[0]) === String(v)) || [])[1] ?? "—"; if (kind === "status") return statusChip(v); return v ?? "—"; }
    if (kind === "sel") return bind(row, k, sel(opts, row[k]));
    if (kind === "num") return bind(row, k, inp({ type: "number", value: row[k] ?? "", min: 0, step: "any", style: { width: "90px" } }));
    return bind(row, k, inp({ value: row[k] ?? "" }));
  };
  const rm = (arr, row) => () => { arr.splice(arr.indexOf(row), 1); draw(); };
  const section = (key, title, cols, blank) => {
    const arr = state[key];
    const rows = arr.map(row => h("tr", {}, ...cols.map(c => h("td", { class: c.r ? "r num" : "" }, c.v(row))), edit ? h("td", {}, h("button", { class: "btn ghost sm", onclick: rm(arr, row), title: t("Delete") }, ic("x"))) : null));
    return h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, title), h("span", { class: "sp" }), edit ? h("button", { class: "btn sm", onclick: () => { arr.push({ ...blank }); draw(); } }, ic("plus"), t("Add row")) : chip(arr.length, "grey", false)),
      h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ...cols.map(c => h("th", { class: c.r ? "r" : "" }, c.l)), edit ? h("th", {}) : null)),
        h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colSpan: cols.length + 1, class: "empty small" }, t("Nothing here yet")))),
        key === "manpower" ? h("tfoot", {}, h("tr", {}, h("td", { style: { fontWeight: 700 } }, t("Total")), h("td", { class: "r num", style: { fontWeight: 700 }, "data-total": 1 }, fmtNum(arr.reduce((a, b) => a + (+b.count || 0), 0))), h("td", { colSpan: 2 }))) : null)));
  };
  const head = { weather: sel(WEATHER.map(w => [w, t(w)]), r.weather), temp_c: inp({ type: "number", value: r.temp_c ?? "", style: { width: "90px" } }), shift: sel([["day", t("day")], ["night", t("night")]], r.shift), notes: h("textarea", { value: r.notes || "" }), safety_notes: h("textarea", { value: r.safety_notes || "" }) };
  const payload = () => ({ weather: head.weather.value, temp_c: head.temp_c.value === "" ? null : +head.temp_c.value, shift: head.shift.value, notes: head.notes.value, safety_notes: head.safety_notes.value, ...state,
    activities: state.activities.map(a => ({ ...a, boq_item_id: a.boq_item_id ? +a.boq_item_id : null })) });
  const act = async (fn, msg) => { try { await fn(); toast(msg); render(); } catch (e) { toast(t(e.message), true); } };
  const save = () => act(() => app.api.reports.update(r.id, payload()), t("Saved"));
  const body = h("div", { class: "col", style: { gap: "14px" }, oninput: () => { const td = body.querySelector("[data-total]"); if (td) td.textContent = fmtNum(state.manpower.reduce((a, b) => a + (+b.count || 0), 0)); } });
  function draw() {
    body.replaceChildren(
      h("div", { class: "card" }, h("div", { class: "bd form" },
        field(t("Date"), inp({ value: fmtDate(r.report_date), disabled: true })), field(t("Shift"), edit ? head.shift : inp({ value: t(r.shift), disabled: true })), field(t("Weather"), edit ? head.weather : inp({ value: t(r.weather), disabled: true })), field(t("Temp °C"), edit ? head.temp_c : inp({ value: r.temp_c ?? "—", disabled: true })),
        field(t("General notes"), edit ? head.notes : h("div", { class: "small" }, r.notes || "—"), { class: "wide" }), field(t("Safety notes"), edit ? head.safety_notes : h("div", { class: "small" }, r.safety_notes || "—"), { class: "wide" }))),
      section("manpower", t("Manpower"), [{ l: t("Trade"), v: x => cell(x, "trade", "sel", tradeOpts) }, { l: t("Count"), v: x => cell(x, "count", "num"), r: true }, { l: t("Hours"), v: x => cell(x, "hours", "num"), r: true }], { trade: "labour", count: 1, hours: 8 }),
      section("activities", t("Activities"), [{ l: t("BOQ item"), v: x => cell(x, "boq_item_id", "sel", boqOpts) }, { l: t("Description"), v: x => cell(x, "description", "text") }, { l: t("Location"), v: x => cell(x, "location", "text") }, { l: t("Qty"), v: x => cell(x, "qty", "num"), r: true }, { l: t("Unit"), v: x => cell(x, "unit", "sel", unitOpts) }], { boq_item_id: "", description: "", location: "", qty: 0, unit: "m3" }),
      section("equipment", t("Equipment"), [{ l: t("Name"), v: x => cell(x, "name", "sel", eqOpts) }, { l: t("Count"), v: x => cell(x, "count", "num"), r: true }, { l: t("Hours"), v: x => cell(x, "hours", "num"), r: true }, { l: t("Status"), v: x => edit ? cell(x, "status", "sel", [["working", t("working")], ["idle", t("idle")], ["breakdown", t("breakdown")]]) : statusChip(x.status) }], { name: "excavator", count: 1, hours: 8, status: "working" }),
      section("materials", t("Materials received"), [{ l: t("Material"), v: x => cell(x, "material", "text") }, { l: t("Qty"), v: x => cell(x, "qty", "num"), r: true }, { l: t("Unit"), v: x => cell(x, "unit", "sel", unitOpts) }, { l: t("Supplier"), v: x => cell(x, "supplier", "text") }, { l: t("Delivery note"), v: x => cell(x, "delivery_note", "text") }], { material: "", qty: 0, unit: "nos", supplier: "", delivery_note: "" }),
      section("issues", t("Issues & notes"), [{ l: t("Type"), v: x => cell(x, "type", "sel", ["delay", "safety", "quality", "client", "material", "other"].map(k => [k, t(k)])) }, { l: t("Severity"), v: x => edit ? cell(x, "severity", "sel", ["low", "medium", "high"].map(k => [k, t(k)])) : statusChip(x.severity) }, { l: t("Description"), v: x => cell(x, "description", "text") }, { l: t("Status"), v: x => edit ? cell(x, "status", "sel", [["open", t("open")], ["closed", t("closed")]]) : statusChip(x.status) }], { type: "other", severity: "medium", description: "", status: "open" }),
    );
  }
  draw();

  const actions = h("div", { class: "actions row" },
    h("button", { class: "btn", onclick: () => { const was = edit; edit = false; draw(); setTimeout(() => { window.print(); edit = was; draw(); }, 80); } }, ic("print"), t("Print / PDF")),
    edit ? h("button", { class: "btn", onclick: save }, t("Save")) : null,
    edit && ["draft", "returned"].includes(r.status) ? h("button", { class: "btn primary", onclick: () => act(async () => { await app.api.reports.update(r.id, payload()); await app.api.reports.submit(r.id); }, t("Submitted")) }, ic("send"), t("Submit for approval")) : null,
    isPm && r.status === "submitted" ? h("button", { class: "btn primary", onclick: () => act(() => app.api.reports.approve(r.id), t("Approved")) }, ic("check"), t("Approve")) : null,
    isPm && ["submitted", "approved"].includes(r.status) ? h("button", { class: "btn danger", onclick: () => { const ta = h("textarea", { placeholder: t("Reason for returning the report") }); modal(t("Return with comment"), ta, [{ label: t("Cancel") }, { label: t("Return with comment"), cls: "danger", onClick: async () => { if (!ta.value.trim()) { toast(t("A comment is required when returning a report"), true); return false; } await act(() => app.api.reports.return(r.id, ta.value.trim()), t("Returned")); } }]); } }, t("Return with comment")) : null,
    edit && r.status === "draft" ? h("button", { class: "btn ghost", onclick: async () => { if (await confirm(t("Delete"), t("Delete this draft?"))) { await app.api.reports.remove(r.id); location.hash = "#/reports"; } } }, ic("trash")) : null);

  const comp = app.company || {};
  const printHead = h("div", { class: "print-only print-head" }, h("div", {}, h("div", { style: { fontWeight: 800, fontSize: "16px" } }, LANG === "ar" ? comp.name_ar : comp.name_en), h("div", { class: "small" }, LANG === "ar" ? comp.name_en : comp.name_ar), h("div", { class: "small" }, `${t("Project")}: ${pick(r, "project_name")} (${r.project_code})`), h("div", { class: "small" }, `${t("Client")}: ${r.client || "—"} · ${t("Consultant")}: ${r.consultant || "—"}`)),
    h("div", { style: { textAlign: "end" } }, h("div", { style: { fontWeight: 800, fontSize: "15px" } }, t("Daily Progress Report")), h("div", { class: "mono small" }, r.report_no), h("div", { class: "small" }, `${fmtDate(r.report_date)} · ${t(r.shift)} · ${t(r.weather)} ${r.temp_c ?? ""}°`), h("div", { class: "small" }, `${t("Status")}: ${t(r.status)}`)));
  const printFoot = h("div", { class: "print-only sig-grid" }, ...[[t("Prepared by"), r.created_by_name], [t("Reviewed by"), r.approved_by_name || ""], [t("Client"), ""]].map(([k, v]) => h("div", { style: { borderTop: "1px solid #999", paddingTop: "6px" } }, h("div", { style: { fontWeight: 700 } }, k), h("div", {}, v || " "), h("div", { class: "faint" }, t("Signature")))));

  return h("div", {},
    h("div", { class: "crumb no-print" }, h("a", { href: "#/reports" }, t("Reports")), " / ", h("a", { href: `#/project/${r.project_id}` }, pick(r, "project_name")), " / ", r.report_no),
    h("div", { class: "topbar" }, h("div", {}, h("h1", { class: "row" }, h("span", { class: "mono" }, r.report_no), statusChip(r.status)), h("div", { class: "small muted no-print" }, `${fmtDate(r.report_date)} · ${t("Created by")} ${r.created_by_name || "—"}`, r.approved_at ? ` · ${t("Approved by")} ${r.approved_by_name} ${fmtDateTime(r.approved_at)}` : "")), actions),
    r.pm_comment ? h("div", { class: "banner", style: { marginBottom: "14px" } }, ic("warn"), `${t("PM comment")}: ${r.pm_comment}`) : null,
    !edit && !["viewer"].includes(app.user.role) && r.status !== "draft" && !isPm ? h("div", { class: "banner blue no-print", style: { marginBottom: "14px" } }, t("Report is locked")) : null,
    printHead, body, printFoot);
}
