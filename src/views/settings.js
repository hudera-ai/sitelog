import { h, ic, chip, table, toast, confirm } from "../ui.js";
import { t, LANG, setLang, fmtDateTime } from "../i18n.js";
import { render, setTheme } from "../main.js";
import { MODE_KEY } from "../api.js";

export async function settings(app) {
  const isPm = ["pm", "admin"].includes(app.user.role);
  const [users, audit] = await Promise.all([app.api.users().catch(() => []), isPm ? app.api.audit(40).catch(() => []) : []]);
  const theme = localStorage.getItem("sitelog.theme") || "system";
  const seg = (opts, cur, on) => h("div", { class: "seg" }, ...opts.map(([v, l]) => h("button", { class: v === cur ? "on" : "", onclick: () => on(v) }, l)));
  const c = app.company || {};
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Settings"))),
    h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Language"), " / ", t("Theme"))), h("div", { class: "bd col", style: { gap: "14px" } },
        h("div", { class: "row" }, h("span", { class: "small muted", style: { width: "90px" } }, t("Language")), seg([["en", "English"], ["ar", "العربية"]], LANG, v => { setLang(v); render(); })),
        h("div", { class: "row" }, h("span", { class: "small muted", style: { width: "90px" } }, t("Theme")), seg([["system", t("System")], ["light", t("Light")], ["dark", t("Dark")]], theme, v => { setTheme(v); render(); })))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Data"))), h("div", { class: "bd col" },
        h("p", { class: "small muted" }, app.api.mode === "local" ? t("Running in your browser (SQLite via WebAssembly). Your changes stay on this device.") : t("Connected to the SiteLog server.")),
        app.api.mode === "local" ? h("div", { class: "row" }, h("button", { class: "btn", onclick: async () => { if (await confirm(t("Reset sample data"), t("Sample data. Company, people and figures are fictional."))) { await app.api.reset(); toast(t("Saved")); render(); } } }, ic("refresh"), t("Reset sample data"))) : null,
        h("p", { class: "xs faint" }, t("Sample data. Company, people and figures are fictional.")))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Company"))), h("div", { class: "bd" }, h("dl", { class: "kv" }, ...[["Name (AR)", c.name_ar], ["Name (EN)", c.name_en], ["City", c.city], ["Email", c.email]].flatMap(([k, v]) => [h("dt", {}, t(k)), h("dd", {}, v || "—")])))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Users"))), table([{ l: t("Name"), v: u => u.name }, { l: t("Role"), v: u => chip(t(u.role), "blue", false) }, { l: t("Email"), v: u => h("span", { class: "small muted" }, u.email) }], users))),
    isPm ? h("div", { class: "card", style: { marginTop: "14px" } }, h("div", { class: "hd" }, h("h2", {}, t("Audit log"))), table([{ l: t("When"), v: a => h("span", { class: "small mono" }, fmtDateTime(a.at)) }, { l: t("By"), v: a => a.user_name || "—" }, { l: t("Action"), v: a => h("span", {}, chip(a.action, "grey", false), " ", h("span", { class: "small muted" }, `${a.entity} #${a.entity_id ?? ""}`)) }, { l: t("Description"), v: a => h("span", { class: "xs muted mono" }, a.detail || "") }], audit)) : null);
}
