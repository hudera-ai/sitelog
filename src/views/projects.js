import { h, ic, chip, statusChip, table, progressBar, lineChart, modal, toast, field, inp, sel, confirm } from "../ui.js";
import { t, pick, fmtNum, fmtMoney, fmtDate, lex } from "../i18n.js";
import { render } from "../main.js";

export async function projects(app) {
  const list = await app.api.projects.list();
  const canEdit = ["pm", "admin"].includes(app.user.role);
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Projects")), canEdit ? h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => projectForm(app) }, ic("plus"), t("New project"))) : null),
    h("div", { class: "grid g3" }, ...list.map(p => h("a", { class: "card", href: `#/project/${p.id}`, style: { textDecoration: "none", display: "block" } },
      h("div", { class: "bd col", style: { gap: "10px" } },
        h("div", { class: "row" }, h("span", { class: "mono xs muted" }, p.code), h("span", { class: "sp" }), statusChip(p.status)),
        h("h2", {}, pick(p, "name")), h("div", { class: "small muted" }, p.client, " · ", p.city),
        h("div", {}, h("div", { class: "row", style: { justifyContent: "space-between" } }, h("span", { class: "small", style: { fontWeight: 600 } }, `${p.progress_pct}%`), h("span", { class: "xs faint" }, fmtMoney(p.earned_value))), progressBar(p.progress_pct)),
        h("div", { class: "row xs muted" }, h("span", {}, `${fmtNum(p.reports)} ${t("Reports").toLowerCase()}`), "·", h("span", {}, `${fmtNum(p.last_manpower)} ${t("Manpower").toLowerCase()}`), "·", p.open_issues ? h("span", { style: { color: "var(--red)" } }, `${p.open_issues} ${t("Open issues").toLowerCase()}`) : h("span", {}, `0 ${t("Open issues").toLowerCase()}`)))))));
}

export async function project(app, route) {
  const p = await app.api.projects.get(route.id);
  const [mp, pt] = await Promise.all([app.api.projects.manpowerTrend(p.id, 30), app.api.projects.progressTrend(p.id)]);
  const canEdit = ["pm", "admin"].includes(app.user.role);
  const totals = p.boq.reduce((a, b) => ({ v: a.v + b.qty * b.rate, e: a.e + Math.min(b.executed, b.qty) * b.rate }), { v: 0, e: 0 });
  // manpower by trade: pivot into series for top 4 trades
  const byTrade = {}; for (const r of mp) (byTrade[r.trade] ||= []).push({ x: r.d, y: r.n });
  const top = Object.entries(byTrade).sort((a, b) => b[1].reduce((s, q) => s + q.y, 0) - a[1].reduce((s, q) => s + q.y, 0)).slice(0, 4);
  return h("div", {},
    h("div", { class: "crumb" }, h("a", { href: "#/projects" }, t("Projects")), " / ", p.code),
    h("div", { class: "topbar" }, h("h1", {}, pick(p, "name")), h("div", { class: "actions row" }, h("a", { class: "btn", href: `#/reports?project_id=${p.id}` }, ic("rep"), t("Reports")), h("a", { class: "btn primary", href: `#/reports/new?project_id=${p.id}` }, ic("plus"), t("New report")), canEdit ? h("button", { class: "btn", onclick: () => projectForm(app, p) }, ic("edit"), t("Edit")) : null)),
    h("div", { class: "grid g4", style: { marginBottom: "14px" } },
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Overall progress")), h("div", { class: "val" }, `${p.progress_pct}%`), progressBar(p.progress_pct), h("div", { class: "sub" }, t("value-weighted"))),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Earned value")), h("div", { class: "val", style: { fontSize: "22px" } }, fmtMoney(totals.e)), h("div", { class: "sub" }, `${t("of")} ${fmtMoney(totals.v)}`)),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Reports")), h("div", { class: "val" }, fmtNum(p.reports)), h("div", { class: "sub row", style: { gap: "4px" } }, p.submitted ? chip(`${p.submitted} ${t("submitted")}`, "amber") : null, p.returned ? chip(`${p.returned} ${t("returned")}`, "red") : null)),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Manpower")), h("div", { class: "val" }, fmtNum(p.last_manpower)), h("div", { class: "sub" }, `${t("Last report")}: ${fmtDate(p.last_report)}`))),
    h("div", { class: "grid g2", style: { marginBottom: "14px" } },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Progress trend"))), h("div", { class: "bd" }, lineChart([{ points: pt.map(x => ({ x: x.d, y: x.pct })), area: true }], { pct: true }))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Manpower by trade"))), h("div", { class: "bd col" }, lineChart(top.map(([, pts]) => ({ points: pts }))), h("div", { class: "legend" }, ...top.map(([tr], i) => h("span", {}, h("i", { style: { background: `var(--chart-${i + 1})` } }), lex(tr))))))),
    h("div", { class: "card", style: { marginBottom: "14px" } }, h("div", { class: "hd" }, h("h2", {}, t("BOQ & progress")), h("span", { class: "sp" }), canEdit ? h("button", { class: "btn sm", onclick: () => boqForm(app, p) }, ic("plus"), t("Add item")) : null),
      table([
        { l: t("Item"), v: b => h("span", { class: "mono small" }, b.code) }, { l: t("Description"), v: b => pick(b, "desc") }, { l: t("Unit"), v: b => lex(b.unit) },
        { l: t("Qty"), v: b => fmtNum(b.qty), r: true, num: true }, { l: t("Executed"), v: b => fmtNum(b.executed, 1), r: true, num: true },
        { l: t("Progress"), v: b => h("div", { style: { minWidth: "120px" } }, h("div", { class: "xs num", style: { textAlign: "end" } }, `${b.pct}%`), progressBar(b.pct, b.pct >= 100 ? "g" : b.pct > 60 ? "" : "a")) },
        { l: t("Rate"), v: b => fmtNum(b.rate), r: true, num: true },
        ...(canEdit ? [{ l: "", v: b => h("span", { class: "row", style: { gap: "4px" } }, h("button", { class: "btn ghost sm", onclick: () => boqForm(app, p, b) }, ic("edit")), h("button", { class: "btn ghost sm", onclick: async () => { if (await confirm(t("Delete"), `${b.code} — ${pick(b, "desc")}`)) { await app.api.projects.deleteBoq(p.id, b.id); render(); } } }, ic("trash"))) }] : []),
      ], p.boq)),
    h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Project"))), h("div", { class: "bd" }, h("dl", { class: "kv" },
        ...[["Code", p.code], ["Client", p.client], ["Consultant", p.consultant], ["City", p.city], ["Start", fmtDate(p.start_date)], ["End", fmtDate(p.end_date)], ["Contract value", fmtMoney(p.contract_value)], ["Project manager", p.pm_name], ["Status", t(p.status)]].flatMap(([k, v]) => [h("dt", {}, t(k)), h("dd", {}, v || "—")])))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Team"))), table([{ l: t("Name"), v: m => m.name }, { l: t("Role"), v: m => chip(t(m.role), "blue", false) }, { l: t("Email"), v: m => h("span", { class: "small muted" }, m.email) }], p.members))));
}

export async function projectForm(app, p = {}) {
  const users = await app.api.users();
  const f = { code: inp({ value: p.code || "", placeholder: "UB-2026-040", disabled: !!p.id }), name_en: inp({ value: p.name_en || "" }), name_ar: inp({ value: p.name_ar || "", dir: "rtl" }), client: inp({ value: p.client || "" }), consultant: inp({ value: p.consultant || "" }), city: inp({ value: p.city || "" }),
    start_date: inp({ type: "date", value: p.start_date || "" }), end_date: inp({ type: "date", value: p.end_date || "" }), contract_value: inp({ type: "number", value: p.contract_value || "" }), status: sel([["active", t("active")], ["on_hold", t("on_hold")], ["closed", t("closed")]], p.status || "active"),
    pm_id: sel(users.filter(u => ["pm", "admin"].includes(u.role)).map(u => [u.id, u.name]), p.pm_id || app.user.id) };
  const memberBoxes = users.filter(u => u.role !== "viewer").map(u => h("label", { class: "row small", style: { fontWeight: 500 } }, h("input", { type: "checkbox", value: u.id, checked: (p.members || []).some(m => m.id === u.id), style: { width: "auto", height: "auto" } }), u.name, h("span", { class: "xs muted" }, t(u.role))));
  const body = h("div", { class: "form" }, field(t("Code"), f.code), field(t("Status"), f.status), field(t("Name (EN)"), f.name_en, { class: "wide" }), field(t("Name (AR)"), f.name_ar, { class: "wide" }), field(t("Client"), f.client), field(t("Consultant"), f.consultant), field(t("City"), f.city), field(t("Project manager"), f.pm_id), field(t("Start"), f.start_date), field(t("End"), f.end_date), field(t("Contract value"), f.contract_value), h("div", { class: "wide col", style: { gap: "4px" } }, h("span", { class: "small muted", style: { fontWeight: 600 } }, t("Members")), ...memberBoxes));
  modal(p.id ? t("Edit") : t("New project"), body, [{ label: t("Cancel") }, { label: t("Save"), cls: "primary", onClick: async () => {
    const payload = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])); payload.member_ids = memberBoxes.filter(b => b.firstChild.checked).map(b => +b.firstChild.value);
    try { const r = p.id ? await app.api.projects.update(p.id, payload) : await app.api.projects.create(payload); toast(t("Saved")); location.hash = `#/project/${r.id}`; render(); } catch (e) { toast(t(e.message), true); return false; }
  } }]);
}

function boqForm(app, p, b = {}) {
  const f = { code: inp({ value: b.code || "" }), desc_en: inp({ value: b.desc_en || "" }), desc_ar: inp({ value: b.desc_ar || "", dir: "rtl" }), unit: sel(["m3", "m2", "m", "ton", "nos", "kg", "ltr", "bag", "roll", "trip"].map(u => [u, lex(u)]), b.unit || "m3"), qty: inp({ type: "number", value: b.qty ?? "" }), rate: inp({ type: "number", value: b.rate ?? "" }) };
  modal(b.id ? t("Edit") : t("Add item"), h("div", { class: "form" }, field(t("Item"), f.code), field(t("Unit"), f.unit), field(t("Description (EN)"), f.desc_en, { class: "wide" }), field(t("Description (AR)"), f.desc_ar, { class: "wide" }), field(t("Qty"), f.qty), field(t("Rate"), f.rate)),
    [{ label: t("Cancel") }, { label: t("Save"), cls: "primary", onClick: async () => { const payload = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])); try { b.id ? await app.api.projects.updateBoq(p.id, b.id, payload) : await app.api.projects.addBoq(p.id, payload); toast(t("Saved")); render(); } catch (e) { toast(t(e.message), true); return false; } } }]);
}
