# Charging, invoices & payments (Ticketify-only)

CRM holds the **service request**; **invoices, payment attempts, and receipts** live only in Ticketify PostgreSQL.

## Field workflow (technician) — spec §11

1. **Charge required?** (optional — never forced if no extra work).
2. **Yes** → select predefined items + **quantity** → **Preview** (subtotal, tax from `TICKETIFY_GST_RATE`, total).
3. Payment mobile defaults from **CRM**; override only with explicit confirmation (audited).
4. **Create invoice** + BML link → **SMS to customer** with item list, total, and pay link (`PAYMENT_REQUEST` template).
5. CRM gets a structured **note** (items, invoice no., AWAITING_PAYMENT).
6. **Awaiting payment** until BML confirms → receipt in Ticketify → CRM note on confirm.
7. Technician **completes work** → **close ticket** (blocked until billing rules pass).
8. **Resend SMS** reuses the same pending link (no new invoice).

**Development without BML:** Invoice + SMS still work locally. Links in SMS must use a **phone-reachable** URL:

- **Best:** `BML_ENABLED=true` — SMS uses the bank’s hosted pay URL.
- **Local laptop only:** `http://127.0.0.1:3333/api/v1/payments/public/:ref/open` shows the invoice summary (or redirects to BML when configured). Use **http** on port **3333**, not `https://localhost:3000`.
- **Real handset testing:** `PAYMENT_SMS_LINK_BASE=https://YOUR-TUNNEL.ngrok-free.app/api/v1` pointing at port **3333**.

SMS is sent before CRM notes/audit so it arrives sooner.

CRM is **not** used for invoices, payment links, or receipts.

## BML Connect (real customer pay link)

Implementation matches **`medianet-voucher/backend/src/services/bmlPaymentService.js`**: `POST /public/transactions`, JWT in `Authorization` **without** a `Bearer` prefix (BML returns `401 PP-C-004` if Bearer is added).

Add to `ticketify-core-api-main/.env` (same merchant credentials as voucher, or from BML portal):

```env
BML_ENABLED=true
BML_API_BASE_URL=https://api.merchants.bankofmaldives.com.mv
BML_API_MODE=v1
BML_AUTH_TOKEN=<JWT from BML Connect>
BML_API_KEY=<merchant API key for request signature>
BML_REDIRECT_URL=http://127.0.0.1:3000/payments/return
BML_WEBHOOK_URL=https://YOUR-PUBLIC-API/api/v1/payments/webhooks/bml
```

When `BML_ENABLED=true` and credentials are valid:

1. **Create invoice & SMS** calls `POST /public/transactions` on BML.
2. The **SMS `[LINK]`** opens **`/payments/checkout?reference=TKT-PAY-…`** (invoice lines, BML only — no coupon/referral). **Pay Now** → API → **`pay.bml.com.mv`**. `BML_REDIRECT_URL` is **after** payment only (`/payments/return`), never in SMS.
3. **Resend SMS** and **`GET /payments/public/:ref/open`** refresh or reuse the same BML session when possible.
4. After pay, BML hits **webhook** (or technician **Check payment**) → receipt in Ticketify.

Restart the API after changing `.env`. Use **Resend SMS** on existing tickets that were created before BML was enabled.

## System flow

1. Technician selects catalog charges → **Invoice** (`INV-YYYY-######`) with GST (`TICKETIFY_GST_RATE`, default 8%).
2. **Payment** (`TKT-PAY-…`) links to invoice → BML hosted page.
3. BML webhook / reconcile → payment `CONFIRMED` → invoice `PAID` → **Receipt** (`RCP-YYYY-######`).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/billing/tickets/:crmTicketId/workflow` | Step + can-close flags |
| PATCH | `/api/v1/billing/tickets/:crmTicketId/decision` | `{ "chargeable": true\|false }` |
| POST | `/api/v1/billing/tickets/:crmTicketId/check-payment` | Reconcile pending payment |
| GET | `/api/v1/charges/catalog` | Active charge codes |
| POST | `/api/v1/invoices/tickets/:crmTicketId` | `{ "charge_codes": ["PATCH_CORD"] }` |
| GET | `/api/v1/invoices/tickets/:crmTicketId` | List invoices for SR |
| GET | `/api/v1/invoices/:id` | Invoice detail |
| POST | `/api/v1/payments/tickets/:crmTicketId` | `{ "charge_codes": [...] }` or `{ "invoice_id": "..." }` |
| GET | `/api/v1/payments/tickets/:crmTicketId` | Payments for SR |
| POST | `/api/v1/payments/:reference/reconcile` | Poll BML |
| GET | `/api/v1/receipts/payments/:reference` | Receipt after paid |

## Mobile

Activity details → **Collect payment** → BML URL (invoice created automatically).
