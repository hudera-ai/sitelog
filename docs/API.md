# SiteLog REST API

Base URL: `http://localhost:8787`. All `/api/*` routes except login/health require `Authorization: Bearer <token>`.
Errors are JSON: `{ "error": "code", "message": "…" }` with an HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 state conflict).

## Auth
| Method | Path | Body / Query | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{email, password}` | → `{token, user}` |
| POST | `/api/auth/logout` | | |
| GET | `/api/auth/me` | | current user |
| GET | `/api/users` | | all users (any role) |
| GET | `/api/company` | | company header data |
| GET | `/api/health` | | `{ok, llm, time}` |

## Projects
| Method | Path | Body | Role |
|---|---|---|---|
| GET | `/api/projects` | | member / admin / viewer |
| POST | `/api/projects` | `{code, name_en, name_ar?, client?, consultant?, city?, start_date?, end_date?, contract_value?, pm_id?, member_ids?}` | pm+ |
| GET | `/api/projects/:id` | | → project + `boq[]` with `executed`, `pct` + `members[]` + stats |
| PATCH | `/api/projects/:id` | any project fields, `member_ids` | pm+ |
| POST | `/api/projects/:id/boq` | `{code, desc_en, desc_ar?, unit, qty, rate}` | pm+ |
| PATCH | `/api/projects/:id/boq/:item` | BOQ fields | pm+ |
| DELETE | `/api/projects/:id/boq/:item` | | pm+ |
| GET | `/api/projects/:id/manpower-trend?days=30` | | `[{d, trade, n}]` |
| GET | `/api/projects/:id/progress-trend` | | `[{d, pct}]` cumulative value-weighted |

## Daily reports
| Method | Path | Body / Query | Role |
|---|---|---|---|
| GET | `/api/reports` | `project_id, status, from, to, limit, offset` | → `{total, rows}` |
| POST | `/api/reports` | `{project_id, report_date, shift?, weather?, temp_c?, notes?, safety_notes?, manpower?[], equipment?[], activities?[], materials?[], issues?[], photos?[]}` | foreman+ |
| GET | `/api/reports/:id` | | report + all line tables + `can_edit` |
| PATCH | `/api/reports/:id` | header fields and/or any line array (an array **replaces** that table) | foreman+ (drafts/returned), pm+ any |
| DELETE | `/api/reports/:id` | | drafts only (admin any) |
| POST | `/api/reports/:id/submit` | | needs ≥1 manpower or activity line |
| POST | `/api/reports/:id/approve` | | pm+, only `submitted` |
| POST | `/api/reports/:id/return` | `{comment}` | pm+ |

Line shapes: `manpower {trade, count, hours}` · `equipment {name, count, hours, status: working|idle|breakdown}` · `activities {boq_item_id?, description, location?, qty, unit}` · `materials {material, qty, unit, supplier?, delivery_note?}` · `issues {type, severity, description, status}` · `photos {caption, url}`.

Report numbers are generated as `DPR-<last 3 of project code>-<YYYYMMDD>[N]`.

## Inbox (field messages)
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/inbox` | `status, project_id` | messages with `parsed` |
| POST | `/api/inbox` | `{project_id?, sender, body, channel?, received_at?}` | parses immediately; without `project_id` the sender's phone is matched to a user's project |
| POST | `/api/inbox/:id/reparse` | `{project_id?}` | |
| POST | `/api/inbox/:id/apply` | `{report_date?, shift?, lines?}` | merges into (or creates) that day's draft; manpower/equipment update by trade/name, other lines append |
| POST | `/api/inbox/:id/ignore` | | |
| POST | `/api/parse` | `{text}` | parse only (no storage); uses the LLM when configured |

## WhatsApp webhook (Meta Cloud API)
- `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<WEBHOOK_TOKEN>&hub.challenge=…` → echoes the challenge.
- `POST /webhook/whatsapp` with the standard `entry[].changes[].value.messages[]` payload; text messages are stored and parsed. Sender `+<wa_id>` is matched to `users.phone` to find the project.

## Dashboard & audit
- `GET /api/dashboard` → `{projects[], pending_approvals, open_issues[], new_messages, manpower_trend[], equipment_today[]}`
- `GET /api/audit?limit=100` (pm+)

## Environment
See `.env.example`: `PORT`, `DATA_DIR`, `WEBHOOK_TOKEN`, optional `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`.
