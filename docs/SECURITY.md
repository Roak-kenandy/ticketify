# Ticketify application security architecture

Security model: **defense in depth** + **zero trust at the API boundary** (every request authenticated/authorized unless explicitly public) + **shift-left** validation on inputs.

## Threat surface

| Surface | Risk | Controls |
|---------|------|----------|
| Mobile / admin clients | Token theft, MITM | HTTPS in prod, JWT expiry, secure storage (Keychain) |
| Core API | Broken auth, injection, abuse | JWT + RBAC, ValidationPipe, throttling, Helmet |
| Public feedback POST | Spam, fake reviews | Rate limit, ticket must be CLOSED, userId must match assigned technician |
| CRM adapter | Credential leak, SSRF | API key in env only, single client, no user-controlled URLs |
| SMS / third parties | Secret in code | Env-based credentials |

## Architecture components (AppSec)

1. **Identity & access** — JWT (`JwtGuard`), role checks (`RolesGuard`), technician vs admin routes.
2. **Secure development** — DTOs with `class-validator`; strict `ValidationPipe` on API bootstrap.
3. **Data protection** — Passwords hashed (argon2); CRM PII stays in CRM; feedback in PostgreSQL.
4. **Monitoring** — Structured logging via `LoggerService`; security-relevant events (login failures, feedback abuse).
5. **Rate limiting** — `@nestjs/throttler` on auth and public feedback endpoints.

## Framework mapping (practical subset)

| Framework | How we use it |
|-----------|----------------|
| **OWASP ASVS** | Input validation, authn/z on APIs, no secrets in source |
| **OWASP API Top 10** | Broken auth (guards), unrestricted access (RBAC), lack of resource validation (feedback + tickets) |
| **NIST SSDF** | Validate inputs at build/runtime; protect secrets in env |
| **Zero trust** | No implicit trust by network; JWT on protected routes |

## Environment variables (secrets & policy)

See `ticketify-core-api-main/.env.example`. Never commit `.env`.

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Sign access tokens |
| `CRM_API_KEY` | CRM adapter |
| `CORS_ORIGINS` | Allowed browser origins (admin) |
| `CUSTOMER_REVIEW_BASE_URL` | Feedback link in SMS |
| `SMS_*` | SMS provider credentials |

## SDLC checklist (shift-left)

- [ ] Run `npm run lint` / tests before merge
- [ ] New endpoints: DTO + guards + throttling if public
- [ ] New CRM calls: use `CrmApiClient`
- [ ] Dependency audit: `npm audit` on API and admin (schedule fixes)

## Incident response (minimal)

1. Rotate `JWT_SECRET` and CRM key if leaked.
2. Revoke compromised user passwords via admin reset.
3. Review logs for abnormal `POST /auth/login` or `POST /feedbacks/*` volume.
