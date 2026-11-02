# TaxKontrol — Session Crash Recovery (2026-11-02)

Status keys: **PASS · FAIL · NOT TESTED · BLOCKED**. Everything below was re-checked in this
session from git, the session transcripts and test runs — not taken over from earlier reports.

## 1. Recovered state

| Evidence | Finding |
|---|---|
| Git | Branch `release/rc2-hardening` = `origin/release/rc2-hardening` = `2f68d49`. Working tree clean except the user's untracked `TaxKontrol-Audit-Report.docx` (left untouched). No stash. `origin/main` = `2de2527` (RC1, nothing merged). |
| Implementation transcript `84c4dbe1…` | Last activity 2026-11-01 18:52 UTC: final remediation handover delivered after CI run 41338517079 turned green. **No edit, test or commit was in progress.** |
| Review transcript (`taxkontrol-independent-review`, `c907649b…`) | Review completed 2026-11-01 ~16:50 UTC, report `docs/release/INDEPENDENT-REVIEW-2026-11-01.md` (uncommitted in that worktree; read only, not modified). |
| Current transcript | Started 2026-11-01 23:50 UTC with this brief; no earlier attempt of it existed. |
| Migrations | `20261102090000_tax_status_history_soll_ist` present and committed (additive). No new migration was in progress. |

**Conclusion: no work was lost.** IR-01..IR-20 had been remediated and pushed in `eae4df4`,
`969b7b4`, `2f68d49` (see `REMEDIATION-HANDOVER-2026-11-02.md`). What was missing was a
re-verification by someone other than the implementing session, plus three open items:
IR-19 rest (write rate limits, CSP), and five reviewer reproductions that had only been
re-checked indirectly (they are covered by unit/integration tests in the new input shape).

## 2. Baseline re-run on `2f68d49` (2026-11-02 00:54 Berlin)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors, 8 known warnings |
| `npm test` | **FAIL — 10 failed / 307 passed** (a second run at 00:58: 14 failed). Unit 186/186 PASS; all failures in integration. |
| `npm audit --omit=dev` | PASS — 0 |
| `npm run build` | PASS |
| `npm run test:e2e` | BLOCKED in this run (port 3217 held by another process) — re-run later, see handover |

### The baseline failure is a real product defect (R-032)

The previous green runs were all made in the evening. Calendar dates are stored at 12:00 UTC
of their Berlin day, but "is it in the future?" was decided against the current instant. From
00:00 Berlin until 13:00 (CET) / 14:00 (CEST) **every record dated today counted as future**:
missing from dashboard, tax position and safe-to-spend, and payments dated today — the Tax
page default — were refused with "cannot be dated in the future". Fixed in `60966ba`
(`endOfBerlinToday` / `isAfterBerlinToday`), regression tests pin the clock to three Berlin
mornings (9/12 fail on the old code). Full suite afterwards at 01:07 Berlin: **329/329 PASS**.
The independent finance reviewer found the same defect independently (its NF-11).

## 3. Work continued in this session

See `docs/release/RELEASE-HARDENING-2026-11-02.md` for findings, fixes and evidence of the
fresh independent review round, and the commit list.
