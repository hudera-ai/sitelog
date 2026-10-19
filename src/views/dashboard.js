import { h, ic, chip, statusChip, table, progressBar, lineChart, barChart } from "../ui.js";
import { t, pick, fmtNum, fmtDate, lex } from "../i18n.js";

const stat = (label, value, sub, color) => h("div", { class: "card stat" }, h("div", { class: "lbl" }, label), h("div", { class: "val", style: color ? { color: `var(--${color})` } : null }, value), sub ? h("div", { class: "sub" }, sub) : null);

export async function dashboard(app) {
  const d = await app.api.dashboard();
  const isPm = ["pm", "admin"].includes(app.user.role);
  const pending = isPm ? (await app.api.reports.list({ status: "submitted", limit: 8 })).rows : [];
  const eq = Object.fromEntries(d.equipment_today.map(e => [e.status, e.n]));
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Dashboard")), h("div", { class: "actions row" }, h("a", { class: "btn primary", href: "#/reports/new" }, ic("plus"), t("New report")))),
    h("div", { class: "grid g4", style: { marginBottom: "14px" } },
      stat(t("Active projects"), d.projects.length, `${fmtNum(d.projects.reduce((a, p) => a + (p.last_manpower || 0), 0))} ${t("Manpower").toLowerCase()}`),
      stat(t("Pending approvals"), d.pending_approvals, isPm ? t("needs your review") : "", d.pending_approvals ? "amber" : null),
      stat(t("Open issues"), d.open_issues.length, d.open_issues.filter(i => i.severity === "high").length ? `${d.open_issues.filter(i => i.severity === "high").length} ${t("high")}` : "", d.open_issues.some(i => i.severity === "high") ? "red" : null),
      stat(t("New messages"), d.new_messages, t("Field messages"), d.new_messages ? "primary" : null)),
    h("div", { class: "grid g2", style: { marginBottom: "14px" } },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Manpower (last 30 days)"))), h("div", { class: "bd" }, lineChart([{ points: d.manpower_trend.map(p => ({ x: p.d, y: p.manpower })), area: true }]))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Equipment today"))), h("div", { class: "bd" }, barChart([{ l: t("working"), v: eq.working || 0, color: "var(--chart-2)" }, { l: t("idle"), v: eq.idle || 0, color: "var(--chart-3)" }, { l: t("breakdown"), v: eq.breakdown || 0, color: "var(--red)" }])))),
    h("div", { class: "card", style: { marginBottom: "14px" } }, h("div", { class: "hd" }, h("h2", {}, t("Projects")), h("span", { class: "sp" }), h("a", { class: "btn sm", href: "#/projects" }, t("View all"))),
      table([
        { l: t("Project"), v: p => h("div", {}, h("div", { style: { fontWeight: 600 } }, pick(p, "name")), h("div", { class: "xs muted mono" }, p.code)) },
        { l: t("Progress"), v: p => h("div", { style: { minWidth: "140px" } }, h("div", { class: "row", style: { justifyContent: "space-between" } }, h("span", { class: "small num" }, `${p.progress_pct}%`), h("span", { class: "xs faint" }, t("value-weighted"))), progressBar(p.progress_pct)) },
        { l: t("Manpower"), v: p => fmtNum(p.last_manpower), r: true, num: true },
        { l: t("Reports"), v: p => h("span", { class: "row", style: { gap: "4px" } }, p.submitted ? chip(`${p.submitted} ${t("submitted")}`, "amber") : null, p.returned ? chip(`${p.returned} ${t("returned")}`, "red") : null, chip(`${p.approved} ${t("approved")}`, "green")) },
        { l: t("Open issues"), v: p => p.open_issues ? chip(p.open_issues, "red") : h("span", { class: "faint" }, "0"), r: true },
        { l: t("Last report"), v: p => fmtDate(p.last_report) },
      ], d.projects, { onRow: p => location.hash = `#/project/${p.id}` })),
    h("div", { class: "grid g2" },
      isPm ? h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Approvals queue")), h("span", { class: "sp" }), h("a", { class: "btn sm", href: "#/reports?status=submitted" }, t("View all"))),
        table([{ l: t("Report"), v: r => h("div", {}, h("div", { class: "mono small", style: { fontWeight: 600 } }, r.report_no), h("div", { class: "xs muted" }, pick(r, "project_name"))) }, { l: t("Date"), v: r => fmtDate(r.report_date) }, { l: t("Manpower"), v: r => fmtNum(r.manpower), r: true, num: true }, { l: t("Created by"), v: r => r.created_by_name }], pending, { onRow: r => location.hash = `#/report/${r.id}`, empty: t("No pending approvals") })) : null,
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Open issues"))),
        table([{ l: t("Severity"), v: i => statusChip(i.severity) }, { l: t("Description"), v: i => h("div", {}, h("div", {}, i.description), h("div", { class: "xs muted" }, `${i.project_code} · ${fmtDate(i.report_date)} · ${t(i.type)}`)) }], d.open_issues.slice(0, 8), { onRow: i => location.hash = `#/report/${i.report_id}` }))));
}
