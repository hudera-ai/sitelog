// One client interface, two transports:
//  • http  — talks to the Node server (/api/...)
//  • local — runs the same service code against SQLite in the browser (sql.js + IndexedDB)
// The app never knows which one it is using. `?mode=local` or a GitHub Pages host forces local;
// otherwise we try the server and fall back to local if it isn't there.

import * as svc from "../shared/service.js";
import { wrap } from "../shared/dbx.js";
import { applySeed } from "../shared/seed.js";

export const MODE_KEY = "sitelog.mode";
const TOKEN_KEY = "sitelog.token";
const SESSION_KEY = "sitelog.session";

// ---- http transport --------------------------------------------------------------
function httpClient(base = "") {
  let token = localStorage.getItem(TOKEN_KEY) || "";
  async function call(method, url, body) {
    const res = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || data.error || res.statusText), { status: res.status, code: data.error });
    return data;
  }
  const q = o => { const s = new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v !== "" && v != null)).toString(); return s ? `?${s}` : ""; };
  return {
    mode: "http",
    async login(email, password) { const r = await call("POST", "/api/auth/login", { email, password }); token = r.token; localStorage.setItem(TOKEN_KEY, token); return r.user; },
    async logout() { try { await call("POST", "/api/auth/logout"); } catch {} token = ""; localStorage.removeItem(TOKEN_KEY); },
    me: () => call("GET", "/api/auth/me"), users: () => call("GET", "/api/users"), company: () => call("GET", "/api/company"),
    dashboard: () => call("GET", "/api/dashboard"), parse: text => call("POST", "/api/parse", { text }), audit: limit => call("GET", `/api/audit${q({ limit })}`),
    projects: {
      list: () => call("GET", "/api/projects"), get: id => call("GET", `/api/projects/${id}`), create: p => call("POST", "/api/projects", p), update: (id, p) => call("PATCH", `/api/projects/${id}`, p),
      addBoq: (id, it) => call("POST", `/api/projects/${id}/boq`, it), updateBoq: (id, i, it) => call("PATCH", `/api/projects/${id}/boq/${i}`, it), deleteBoq: (id, i) => call("DELETE", `/api/projects/${id}/boq/${i}`),
      manpowerTrend: (id, days) => call("GET", `/api/projects/${id}/manpower-trend${q({ days })}`), progressTrend: id => call("GET", `/api/projects/${id}/progress-trend`),
    },
    reports: {
      list: o => call("GET", `/api/reports${q(o)}`), get: id => call("GET", `/api/reports/${id}`), create: p => call("POST", "/api/reports", p), update: (id, p) => call("PATCH", `/api/reports/${id}`, p),
      remove: id => call("DELETE", `/api/reports/${id}`), submit: id => call("POST", `/api/reports/${id}/submit`), approve: id => call("POST", `/api/reports/${id}/approve`), return: (id, comment) => call("POST", `/api/reports/${id}/return`, { comment }),
    },
    inbox: {
      list: o => call("GET", `/api/inbox${q(o)}`), receive: p => call("POST", "/api/inbox", p), reparse: (id, p) => call("POST", `/api/inbox/${id}/reparse`, p), apply: (id, p) => call("POST", `/api/inbox/${id}/apply`, p), ignore: id => call("POST", `/api/inbox/${id}/ignore`),
    },
  };
}

// ---- local transport (sql.js in the browser) ------------------------------------------
const IDB = { name: "sitelog", store: "db", key: "main" };
function idb() { return new Promise((ok, err) => { const r = indexedDB.open(IDB.name, 1); r.onupgradeneeded = () => r.result.createObjectStore(IDB.store); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); }
async function idbGet() { try { const d = await idb(); return await new Promise((ok, err) => { const t = d.transaction(IDB.store).objectStore(IDB.store).get(IDB.key); t.onsuccess = () => ok(t.result); t.onerror = () => err(t.error); }); } catch { return null; } }
async function idbSet(bytes) { try { const d = await idb(); await new Promise((ok, err) => { const t = d.transaction(IDB.store, "readwrite").objectStore(IDB.store).put(bytes, IDB.key); t.onsuccess = ok; t.onerror = () => err(t.error); }); } catch {} }

async function localClient() {
  const SQL = await window.initSqlJs({ locateFile: f => `vendor/${f}` });
  const schema = await (await fetch("db/schema.sql")).text();
  const saved = await idbGet();
  const db = new SQL.Database(saved ? new Uint8Array(saved) : undefined);
  const dbx = wrap(db);
  dbx.exec(schema);
  if (!dbx.get("SELECT 1 FROM company")) applySeed(dbx);
  let t = null; const persist = () => { clearTimeout(t); t = setTimeout(() => idbSet(dbx.export()), 300); };
  for (const m of ["run", "exec", "tx"]) { const o = dbx[m]; dbx[m] = (...a) => { const r = o(...a); persist(); return r; }; }
  persist();

  let ctx = { user: JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") };
  const wrapErr = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (e instanceof svc.ApiError) throw Object.assign(new Error(e.message), { status: e.status, code: e.code }); throw e; } };
  const W = o => Object.fromEntries(Object.entries(o).map(([k, f]) => [k, wrapErr(f)]));
  return {
    mode: "local",
    ...W({
      async login(email, password) { const r = await svc.auth.login(dbx, { email, password }); ctx = { user: r.user }; sessionStorage.setItem(SESSION_KEY, JSON.stringify(r.user)); return r.user; },
      async logout() { ctx = { user: null }; sessionStorage.removeItem(SESSION_KEY); },
      async me() { if (!ctx.user) throw new svc.ApiError(401, "unauthenticated"); return ctx.user; },
      users: () => svc.auth.users(dbx, ctx), company: () => svc.company(dbx), dashboard: () => svc.dashboard.summary(dbx, ctx),
      parse: async text => (await import("../shared/parser.js")).parseMessage(text), audit: limit => svc.auditLog(dbx, ctx, limit),
      async reset() { applySeed(dbx); },
    }),
    projects: W({
      list: () => svc.projects.list(dbx, ctx), get: id => svc.projects.get(dbx, ctx, +id), create: p => svc.projects.create(dbx, ctx, p), update: (id, p) => svc.projects.update(dbx, ctx, +id, p),
      addBoq: (id, it) => svc.projects.addBoq(dbx, ctx, +id, it), updateBoq: (id, i, it) => svc.projects.updateBoq(dbx, ctx, +id, +i, it), deleteBoq: (id, i) => svc.projects.deleteBoq(dbx, ctx, +id, +i),
      manpowerTrend: (id, days) => svc.dashboard.manpowerTrend(dbx, ctx, +id, days), progressTrend: id => svc.dashboard.progressTrend(dbx, ctx, +id),
    }),
    reports: W({
      list: o => svc.reports.list(dbx, ctx, o), get: id => svc.reports.get(dbx, ctx, +id), create: p => svc.reports.create(dbx, ctx, p), update: (id, p) => svc.reports.update(dbx, ctx, +id, p),
      remove: id => svc.reports.remove(dbx, ctx, +id), submit: id => svc.reports.submit(dbx, ctx, +id), approve: id => svc.reports.approve(dbx, ctx, +id), return: (id, comment) => svc.reports.return(dbx, ctx, +id, { comment }),
    }),
    inbox: W({
      list: o => svc.inbox.list(dbx, ctx, o), receive: p => svc.inbox.receive(dbx, ctx, p), reparse: (id, p) => svc.inbox.reparse(dbx, ctx, +id, p), apply: (id, p) => svc.inbox.apply(dbx, ctx, +id, p), ignore: id => svc.inbox.ignore(dbx, ctx, +id),
    }),
  };
}

export async function createApi() {
  const params = new URLSearchParams(location.search);
  const forced = params.get("mode") || localStorage.getItem(MODE_KEY);
  const onPages = /github\.io$/.test(location.hostname) || location.protocol === "file:";
  if (forced === "local" || (onPages && forced !== "http")) return localClient();
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    if (r.ok) return httpClient();
  } catch {}
  return localClient();
}
