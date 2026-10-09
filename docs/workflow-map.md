# Workflow Map — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
| Status | Complete |

## 1. User Actions

| Flow | Steps | Entry point |
|---|---|---|
| Register & onboard | register → login → choose VAT status (explicit) → Jobcenter yes/no → dashboard | `/register`, `/onboarding` |
| Record money | choose in/out → business / private / mixed / not sure → amount (+VAT if Regelbesteuerung) → live preview → save | `/input` |
| Receipt | upload (validated) → AI suggestion → user checks every field → approve & book once (or reject) | `/input`, `/documents/[id]` |
| Bank import | upload PDF → AI lists lines → each line "not sure" until classified → atomic import, duplicates skipped | `/import` |
| Classify / correct | "Needs your decision" filter → correct inline (audited) → delete (receipt reopens) | `/transactions` |
| See position | dashboard: left from this month, step-by-step flow, reserve per period, commitments, limitations | `/dashboard`, `/money` |
| Tax reserve | see estimated need per period → enter what was actually set aside | `/tax` |
| Spend decision | quick check (`/money`) or decision centre with obligations and risk signals | `/money`, `/decision-center` |
| Jobcenter | pick months, provisional/final EKS, child flag → monthly breakdown | `/jobcenter` |
| Report | pick month → overview → download text for Steuerberater | `/reports` |
| Settings / privacy | VAT status & period, church tax, Jobcenter flag, data export, account deletion | `/settings` |

## 2. System Actions

- Server start: environment report (names only).
- Every financial mutation: `AuditEvent` row (before/after of changed fields).
- Tax reserve GET: ensures one row per current period; never rewrites older periods.
- Contact form: delivered to Telegram or answered 503 (never silently dropped).

## 3. API Flows

| Route | Methods | Notes |
|---|---|---|
| `/api/v1/transactions` | GET (filters: type, review, month, paging), POST (+`documentId` claim) | validated, audited |
| `/api/v1/transactions/[id]` | GET (+history), PATCH, DELETE | owner-scoped |
| `/api/v1/transactions/import` | POST | atomic, duplicate-safe, UNSURE default |
| `/api/v1/documents`, `/[id]`, `/[id]/review` | upload/list/read/approve/reject | race-safe single booking |
| `/api/v1/bank-statement` | POST | suggestions only |
| `/api/v1/dashboard`, `/decisions`, `/warnings` | GET/POST/GET | shared position engine |
| `/api/v1/tax-reserve` | GET, PATCH | per period |
| `/api/v1/reports`, `/reports/pdf` | GET `?month=YYYY-MM` | text export |
| `/api/v1/jobcenter` | GET, POST | §11b estimate |
| `/api/v1/receivables`, `/payables` | GET, POST, PATCH (`addPayment`/`paidAmount`), DELETE | shared handler |
| `/api/v1/fixed-costs`, `/employees`, `/daily-close`, `/settings`, `/onboarding` | CRUD | validated |
| `/api/v1/account`, `/account/export` | DELETE, GET | GDPR |
| `/api/v1/guidance/*`, `/decision-center/*` | various | premium gates behind `ENTITLEMENTS_ENFORCED` |
| `/api/health` | GET | public |
