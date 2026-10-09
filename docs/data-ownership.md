# Data Ownership — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
| Status | Complete |

## 1. Data Inventory

| Table | Owner field | Server-side ownership | API protected | PII | Classification | Retention |
|---|---|---|---|---|---|---|
| User | id | yes | yes | name, email, Steuernummer, USt-IdNr | PII | until account deletion |
| TaxProfile, UserPersonaProfile | userId | yes | yes | indirect | Sensitive | until deletion |
| Transaction | userId | yes (`findFirst {id,userId}`) | yes | financial | Sensitive | until deletion (user keeps own copy via export) |
| Document (+ R2 file) | userId, key prefix | yes | yes | receipts, letters, OCR text | Sensitive/PII | until deletion |
| TaxReserve, FixedCost, Receivable, Payable, DailyClose, JobcenterRecord | userId | yes | yes | financial, customer/supplier names | Sensitive | until deletion |
| Employee, EmployeePayment | userId (via employee) | yes | yes | employee names, salaries | PII (third parties) | until deletion |
| GuidanceCase/Event/Task, DecisionEvaluation | userId | yes | yes | letter content summaries | Sensitive | until deletion |
| AuditEvent | userId | yes (cascade) | read via transaction detail | change history | Sensitive | until deletion |
| Purchase, Entitlement | userId | yes | not exposed yet | payment refs | Financial | **open:** must be retained per HGB/AO once payments exist (currently cascade-deleted; no rows exist) |
| Category | – (system) | n/a | public read | none | Public | permanent |

## 2. PII Handling

- No PII in logs (contact route logs source/delivered flag only; errors log messages, not bodies).
- Startup log reports variable names only.
- AI: receipt/bank/letter content is sent to Anthropic for reading (see Datenschutz §4); results stored as suggestions.
- Contact-form data goes to Telegram (to be documented in Datenschutz — action list #8).

## 3. Retention Policy

User-initiated deletion removes all rows and stored files (`DELETE /api/v1/account`). Users are
told to export first because they must keep business receipts (8 years, §147 AO) themselves.
Backups follow Neon PITR retention (to be confirmed, action list #12).
