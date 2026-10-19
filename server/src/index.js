// SiteLog API + static web app. Run with `npm start` (http://localhost:8787).
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { ApiError, auth, company, projects, reports, inbox, dashboard, auditLog } from "../../shared/service.js";
import { parseWithLlm, llmEnabled } from "./llm.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || "change-me";

const dbx = await openDb();
const sessions = new Map(); // token → user (in-memory; swap for Redis/DB in production)

const app = express();
app.use(express.json({ limit: "1mb" }));
app.set("etag", false);

// ---- auth middleware -----------------------------------------------------------
app.use("/api", (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  req.ctx = { user: sessions.get(token) || null };
  next();
});
const h = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.code, message: e.message });
    console.error(e); res.status(500).json({ error: "server_error", message: e.message });
  }
};
const id = s => parseInt(s, 10);

// ---- auth --------------------------------------------------------------------------
app.post("/api/auth/login", h(async req => { const r = await auth.login(dbx, req.body || {}); sessions.set(r.token, r.user); return r; }));
app.post("/api/auth/logout", h(req => { sessions.delete((req.headers.authorization || "").replace(/^Bearer\s+/i, "")); return { ok: true }; }));
app.get("/api/auth/me", h(req => { if (!req.ctx.user) throw new ApiError(401, "unauthenticated"); return req.ctx.user; }));
app.get("/api/users", h(req => auth.users(dbx, req.ctx)));
app.get("/api/company", h(() => company(dbx)));
app.get("/api/health", h(() => ({ ok: true, llm: llmEnabled(), time: new Date().toISOString() })));

// ---- projects ----------------------------------------------------------------------
app.get("/api/projects", h(req => projects.list(dbx, req.ctx)));
app.post("/api/projects", h(req => projects.create(dbx, req.ctx, req.body)));
app.get("/api/projects/:id", h(req => projects.get(dbx, req.ctx, id(req.params.id))));
app.patch("/api/projects/:id", h(req => projects.update(dbx, req.ctx, id(req.params.id), req.body)));
app.post("/api/projects/:id/boq", h(req => projects.addBoq(dbx, req.ctx, id(req.params.id), req.body)));
app.patch("/api/projects/:id/boq/:item", h(req => projects.updateBoq(dbx, req.ctx, id(req.params.id), id(req.params.item), req.body)));
app.delete("/api/projects/:id/boq/:item", h(req => projects.deleteBoq(dbx, req.ctx, id(req.params.id), id(req.params.item))));
app.get("/api/projects/:id/manpower-trend", h(req => dashboard.manpowerTrend(dbx, req.ctx, id(req.params.id), id(req.query.days || 30))));
app.get("/api/projects/:id/progress-trend", h(req => dashboard.progressTrend(dbx, req.ctx, id(req.params.id))));

// ---- reports ---------------------------------------------------------------------------
app.get("/api/reports", h(req => reports.list(dbx, req.ctx, req.query)));
app.post("/api/reports", h(req => reports.create(dbx, req.ctx, req.body)));
app.get("/api/reports/:id", h(req => reports.get(dbx, req.ctx, id(req.params.id))));
app.patch("/api/reports/:id", h(req => reports.update(dbx, req.ctx, id(req.params.id), req.body)));
app.delete("/api/reports/:id", h(req => reports.remove(dbx, req.ctx, id(req.params.id))));
app.post("/api/reports/:id/submit", h(req => reports.submit(dbx, req.ctx, id(req.params.id))));
app.post("/api/reports/:id/approve", h(req => reports.approve(dbx, req.ctx, id(req.params.id))));
app.post("/api/reports/:id/return", h(req => reports.return(dbx, req.ctx, id(req.params.id), req.body || {})));

// ---- inbox -------------------------------------------------------------------------------
app.get("/api/inbox", h(req => inbox.list(dbx, req.ctx, req.query)));
app.post("/api/inbox", h(async req => { if (!req.ctx.user) throw new ApiError(401, "unauthenticated"); const r = inbox.receive(dbx, req.ctx, req.body); if (llmEnabled()) { const parsed = await parseWithLlm(req.body.body); dbx.run("UPDATE inbox_messages SET parsed_json=? WHERE id=?", [JSON.stringify(parsed), r.id]); r.parsed = parsed; } return r; }));
app.post("/api/inbox/:id/reparse", h(req => inbox.reparse(dbx, req.ctx, id(req.params.id), req.body || {})));
app.post("/api/inbox/:id/apply", h(req => inbox.apply(dbx, req.ctx, id(req.params.id), req.body || {})));
app.post("/api/inbox/:id/ignore", h(req => inbox.ignore(dbx, req.ctx, id(req.params.id))));
app.post("/api/parse", h(async req => parseWithLlm(String(req.body?.text || ""))));

// WhatsApp Cloud API webhook (Meta). Verify handshake + inbound text messages.
app.get("/webhook/whatsapp", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === WEBHOOK_TOKEN) return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const msgs = req.body?.entry?.flatMap(e => e.changes || []).flatMap(c => c.value?.messages || []) || [];
    for (const m of msgs) if (m.type === "text") {
      const r = inbox.receive(dbx, null, { sender: `+${m.from}`, body: m.text.body, channel: "whatsapp", received_at: new Date(m.timestamp * 1000).toISOString().slice(0, 19).replace("T", " ") });
      if (llmEnabled()) dbx.run("UPDATE inbox_messages SET parsed_json=? WHERE id=?", [JSON.stringify(await parseWithLlm(m.text.body)), r.id]);
    }
    res.sendStatus(200);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

// ---- dashboard / audit -------------------------------------------------------------------
app.get("/api/dashboard", h(req => dashboard.summary(dbx, req.ctx)));
app.get("/api/audit", h(req => auditLog(dbx, req.ctx, id(req.query.limit || 100))));

// ---- static web app (same files GitHub Pages serves) -----------------------------------
const webRoot = path.join(here, "..", "..");
app.use("/shared", express.static(path.join(webRoot, "shared")));
app.use(express.static(webRoot, { index: "index.html", extensions: ["html"] }));
app.get("/{*path}", (req, res) => res.sendFile(path.join(webRoot, "index.html")));

app.listen(PORT, () => console.log(`SiteLog running on http://localhost:${PORT}  (LLM parsing: ${llmEnabled() ? "on" : "off"})`));
