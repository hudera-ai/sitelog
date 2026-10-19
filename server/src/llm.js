// Optional language-model parsing. When LLM_API_KEY is set the server asks an
// OpenAI-compatible chat endpoint to extract report lines; the rule-based parser in
// shared/parser.js stays the fallback and the validator for whatever comes back.

import { parseMessage } from "../../shared/parser.js";

const SYSTEM = `You extract construction daily-report lines from a site foreman's message (Arabic or English).
Return ONLY JSON with keys manpower[{trade,count}], equipment[{name,count,status}], activities[{activity,description,qty,unit,location}],
materials[{material,qty,unit,supplier,delivery_note}], issues[{type,severity,description}].
trade ∈ carpenter|steel_fixer|mason|labour|electrician|plumber|welder|operator|driver|surveyor|engineer|foreman|safety_officer|plasterer|tiler|painter|cutting_tech.
equipment status ∈ working|idle|breakdown. unit ∈ m3|m2|m|ton|bag|nos|trip|ltr|roll|kg. issue type ∈ delay|safety|quality|client|material|other; severity ∈ low|medium|high.`;

export function llmEnabled() { return !!process.env.LLM_API_KEY; }

export async function parseWithLlm(text) {
  if (!llmEnabled()) return parseMessage(text);
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }] }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const out = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const base_ = parseMessage(text);
    for (const k of ["manpower", "equipment", "activities", "materials", "issues"]) if (!Array.isArray(out[k])) out[k] = base_[k];
    out.unmatched = []; out.engine = model;
    return out;
  } catch (e) {
    console.warn("[llm] falling back to rule-based parser:", e.message);
    return parseMessage(text);
  }
}
