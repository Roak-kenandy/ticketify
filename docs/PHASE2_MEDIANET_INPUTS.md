# Phase 2 — What Medianet needs to provide

Before hard-coding workflows, confirm the items below. The spec (v2.0, 21 Sep 2026) requires **configurable CRM mapping**; development can start on foundations, but **P0 go-live** needs these answers.

## Critical (block CRM workflow coding)

| # | Item | Why |
|---|------|-----|
| 1 | **CRM queue / team / stage / status IDs** for Access Network (Fault, New Connection, Relocation) | Start, schedule, close, No Response, and LM handoff must use live IDs—not labels. |
| 2 | **CRM mapping for Transport / Last Mile** (Pending LM, return to Access) | Handoff changes owning team/queue; needs exact API actions + IDs. |
| 3 | **No Response** representation in CRM | Status vs tag vs activity vs hold—and whether any SMS is approved. |
| 4 | **Staging CRM + test SRs** | One Fault, one New Connection, one Relocation, one LM round-trip ticket. |
| 5 | **CRM test users** | Technicians (Access + LM), supervisor, admin—for assignment tests. |

## Assignment & technician state

| # | Item | Why |
|---|------|-----|
| 6 | **Manual vs auto assignment** per department/region/queue (not only global) | Spec §5.1, §7. |
| 7 | **Auto-assignment ranking rules** | Priority/SLA vs workload vs proximity weights; YELLOW fallback. |
| 8 | **Self-assignment (“claim from pool”)** | Keep or disable; which pools. |
| 9 | **YELLOW → GREEN auto-expiry** | Auto-return at `busy_until` or reminder only. |
| 10 | **Technician phone in schedule SMS** | Which field (corporate vs personal); sample approved text. |

## Charging & payments (P1 — blocks charge module completion)

| # | Item | Why |
|---|------|-----|
| 11 | **Payment gateway** | API docs, sandbox keys, webhook URL for “paid” confirmation. |
| 12 | **Invoice source of truth** | **Ticketify-only** — invoices/receipts in Postgres; CRM not used for payments. |
| 13 | **Applicable tax rate(s)** | Central config; effective dates. |
| 14 | **Overrides / waivers / refunds** | Roles and approval trail (Finance). |
| 15 | **Confirm charge labels** | e.g. “Patch Code” vs “Patch Cord” (spec §18). |

## Communications

| # | Item | Why |
|---|------|-----|
| 16 | **Approved SMS templates** (final Dhivehi/English if needed) | Schedule, LM, payment, feedback—§12. |
| 17 | **SMS sender / provider** | Production credentials (dev uses `.env`). |
| 18 | **Customer review URL** | Production domain for feedback links. |

## Dashboard & reporting

| # | Item | Why |
|---|------|-----|
| 19 | **Malé vs Hulhumalé** mapping | How CRM encodes location/region for AC-17 tiles. |
| 20 | **Ticket type taxonomy** | Fault / Relocation / New Connection (+ others) in CRM fields. |
| 21 | **SLA / aging rules** | Timezone, working hours, thresholds for dashboard vs CRM reconciliation. |

## Privacy & location

| # | Item | Why |
|---|------|-----|
| 22 | **Location / 8-hour path policy** | Consent, retention, who can view (spec + earlier scope). |

## Deliverables from Medianet (documentation)

- CRM **field mapping sheet** (SR, assignment, schedule comment, attachments, LM handoff).
- **Notification trigger matrix** (which action sends which template, once only).
- **Finance sign-off** on charge catalogue amounts (table in spec §11).
- **UAT owners** for acceptance criteria AC-01–AC-20.

---

**Implemented in repo (see also [PHASE2_ROADMAP.md](./PHASE2_ROADMAP.md)):**

- DB migration `phase2_foundation` (presence, schedules, templates, charges, audit, assignment policy).
- **GREEN / YELLOW / RED** — mobile + `PATCH /users/presence`; admin map shows busy (yellow) + busy note on click.
- **Schedule visit** — CRM note + templated SMS (`VISIT_SCHEDULED`).
- **Last Mile handoff** — CRM Last Mile Cabling activity → Transport Network **team pool**; blocks SR until LM `COMPLETED`.
- `GET /charges/catalog` + `npm run seed:phase2`.
- Ticket start/progress/close (CRM stages); integration audit for key actions.
- **Auto-assign v1 (spec §5.1):** Supervisor/Admin **toggle** on the dispatch map (`PATCH /api/v1/assignments/settings` `{ "enabled": true|false }`). While **enabled**, the API polls every `AUTO_ASSIGN_POLL_INTERVAL_MS` (default 60s) and assigns unassigned **NEW** team tickets; turning **off** stops all automatic assignment. Candidates are **`presence === ONLINE` only** — **BUSY** excluded. Settings persist in `system_config` key `dispatch.auto_assign`.
- **Finance (Ticketify-only):** Invoices + receipts + BML payments — see [FINANCE_TICKETIFY.md](./FINANCE_TICKETIFY.md). Mobile **Collect payment** on ticket details.
- **No Response:** CRM tag + **No Response activity type** from workflow mapping.
- **Dispatch:** `GET /api/v1/dispatch/overview`, admin `/dispatch` page; manual `POST /dispatch/assign/:ticketId`.
- **Operations dashboard (AC-17 v1):** `GET /api/v1/dashboard/operations` (Malé/Hulhumalé unassigned counts, presence, finance counters).
- **busy_until:** cron releases BUSY → ONLINE.
- **Still open:** Full AC-17 SLA tiles, workflow-specific mobile UX per queue, LM return stage sync, auto-assign ranking/proximity, finance waivers/PDF receipts, formal AC-01–20 UAT.

**Next dev (needs Medianet mapping + auto-assign rules):** Slice 1 No Response + config → Slice 2 **auto-assign** → Supervisor dispatch UI → P1 charges/payments → dashboard.
