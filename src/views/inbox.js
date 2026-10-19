import { h, ic, chip, statusChip, modal, toast, field, inp, sel } from "../ui.js";
import { t, pick, fmtDateTime, lex } from "../i18n.js";
import { render } from "../main.js";
import { INBOX_SAMPLES } from "../../shared/seed.js";

function parsedView(p) {
  if (!p) return null;
  const box = (title, items, fmt) => items?.length ? h("div", { class: "box" }, h("b", {}, title), h("ul", {}, ...items.map(i => h("li", {}, fmt(i))))) : null;
  return h("div", { class: "parsed" },
    box(t("Manpower"), p.manpower, i => `${lex(i.trade)} × ${i.count}`),
    box(t("Equipment"), p.equipment, i => h("span", {}, `${lex(i.name)} × ${i.count} `, chip(t(i.status), { working: "green", idle: "amber", breakdown: "red" }[i.status], false))),
    box(t("Activities"), p.activities, i => `${lex(i.activity)}: ${i.qty} ${lex(i.unit)}${i.location ? ` · ${i.location}` : ""}`),
    box(t("Materials received"), p.materials, i => `${lex(i.material)} ${i.qty} ${lex(i.unit)}${i.supplier ? ` · ${i.supplier}` : ""}${i.delivery_note ? ` · DN ${i.delivery_note}` : ""}`),
    box(t("Issues & notes"), p.issues, i => h("span", {}, chip(t(i.severity), { high: "red", medium: "amber", low: "grey" }[i.severity], false), " ", `${t(i.type)}: ${i.description}`)),
    box(t("Unmatched"), p.unmatched, i => h("span", { class: "muted" }, i)));
}

export async function inbox(app, route) {
  const [msgs, projs] = await Promise.all([app.api.inbox.list({ status: route.params.status || "" }), app.api.projects.list()]);
  const act = async (fn, msg) => { try { const r = await fn(); toast(typeof msg === "function" ? msg(r) : msg); render(); } catch (e) { toast(t(e.message), true); } };
  const compose = () => {
    const ta = h("textarea", { placeholder: t("Paste a WhatsApp message"), style: { minHeight: "120px" } });
    const pr = sel(projs.map(p => [p.id, pick(p, "name")]), projs[0]?.id);
    const sender = inp({ value: app.user.phone || app.user.name });
    const preview = h("div", {});
    let timer; ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(async () => preview.replaceChildren(parsedView(await app.api.parse(ta.value)) || ""), 250); });
    modal(t("Paste a WhatsApp message"), h("div", { class: "col" }, h("div", { class: "form" }, field(t("Project"), pr), field(t("Sender"), sender)), ta,
      h("div", { class: "row" }, h("span", { class: "xs muted" }, t("Try a sample"), ":"), ...INBOX_SAMPLES.slice(0, 3).map((s, i) => h("button", { class: "btn sm ghost", onclick: () => { ta.value = s.body; pr.value = projs.find(p => p.code === s.project)?.id || pr.value; ta.dispatchEvent(new Event("input")); } }, `#${i + 1}`))),
      h("div", { class: "small muted" }, t("Parsed lines")), preview),
      [{ label: t("Cancel") }, { label: t("Send"), cls: "primary", onClick: async () => { if (!ta.value.trim()) return false; await act(() => app.api.inbox.receive({ project_id: +pr.value, sender: sender.value, body: ta.value, channel: "app" }), t("Saved")); } }]);
  };
  const filters = h("div", { class: "seg" }, ...[["", t("View all")], ["parsed", t("parsed")], ["applied", t("applied")], ["ignored", t("ignored")]].map(([v, l]) => h("button", { class: (route.params.status || "") === v ? "on" : "", onclick: () => location.hash = `#/inbox${v ? `?status=${v}` : ""}` }, l)));
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Inbox")), h("div", { class: "actions row" }, filters, h("button", { class: "btn primary", onclick: compose }, ic("chat"), t("Paste a WhatsApp message")))),
    h("p", { class: "small muted", style: { marginBottom: "14px" } }, t("Field messages"), " — WhatsApp → ", t("Parsed lines"), " → ", t("Apply to report")),
    h("div", { class: "col", style: { gap: "12px" } }, ...(msgs.length ? msgs.map(m => {
      const pr = sel([["", t("Assign to project")], ...projs.map(p => [p.id, pick(p, "name")])], m.project_id || "", { style: { width: "auto" }, onchange: e => act(() => app.api.inbox.reparse(m.id, { project_id: +e.target.value || null }), t("Saved")) });
      const date = inp({ type: "date", value: m.received_at.slice(0, 10), style: { width: "auto" } });
      return h("div", { class: "msg" },
        h("div", { class: "row" }, h("span", { class: "avatar", style: { width: "28px", height: "28px", fontSize: "11px" } }, "WA"), h("div", {}, h("div", { class: "small", style: { fontWeight: 600 } }, m.sender), h("div", { class: "xs muted" }, `${fmtDateTime(m.received_at)} · ${m.channel}`)), h("span", { class: "sp" }), m.project_code ? chip(m.project_code, "blue", false) : null, statusChip(m.status)),
        h("div", { class: "body", dir: "auto" }, m.body),
        parsedView(m.parsed),
        m.status === "applied" ? h("div", { class: "row small", style: { marginTop: "8px" } }, h("span", { class: "muted" }, t("Applied to")), h("a", { href: `#/report/${m.report_id}`, class: "mono" }, m.report_no || `#${m.report_id}`)) :
        m.status === "ignored" ? null : h("div", { class: "row", style: { marginTop: "10px" } }, pr, date,
          h("button", { class: "btn primary sm", disabled: !m.project_id, onclick: () => act(() => app.api.inbox.apply(m.id, { report_date: date.value }), r => `${t("Lines added")}: ${Object.values(r.added).reduce((a, b) => a + b, 0)} → ${r.report_no}`) }, ic("check"), t("Apply to report")),
          h("button", { class: "btn sm", onclick: () => act(() => app.api.inbox.reparse(m.id), t("Saved")) }, ic("refresh"), t("Re-parse")),
          h("button", { class: "btn sm ghost", onclick: () => act(() => app.api.inbox.ignore(m.id), t("Saved")) }, t("Ignore"))));
    }) : [h("div", { class: "card" }, h("div", { class: "empty" }, t("No messages")))])));
}
