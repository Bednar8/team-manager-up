<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Coach upcoming training

- **Plan**: context/changes/coach-upcoming-training/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Past in-month days use adjacent-month chrome

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/calendar/MonthCalendar.tsx:234
- **Detail**: The day cell class is `inMonth && !isPast`, so a past day inside the current month gets the muted adjacent-month chrome. The phase 2 contract covers the Footprints marker, the `trening` label, and the read-only day window. It leaves in-month cell chrome as it was. `isPastCivil` in `src/components/calendar/month.ts:109` is the write-gate helper the plan already named; this change added it because it was not in the file yet. The mute is the extra visible behavior.
- **Fix**: Drop `&& !isPast` from the in-month class so past days in the current month keep the card chrome. Read-only stays in the day window.
- **Decision**: FIXED

### F2 — Manual checks marked done without the contract runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/coach-upcoming-training/plan.md:220
- **Detail**: `npm run lint` and `npm run build` passed in this review (exit 0). Progress marks 1.3 and 2.3–2.6 done. A local `npx supabase db reset` applied `20260928200436_coach_trainings.sql`. That session does not show the phase 1 contract calls (past date, empty description, second training the same day, coach insert for today). Steps 2.3–2.6 are the browser walks (coach add at `lg` and below, edit and delete, past day, athlete) and they were checked on the implementation commit `0e03f96`, with no separate verification in the diff.
- **Fix**: Re-run the phase 1 function checks and the four phase 2 browser checks before treating 1.3 and 2.3–2.6 as verified.
- **Decision**: SKIPPED

### F3 — Calendar error without a date stays invisible

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/trainings/create.ts:12
- **Detail**: Create, update, and delete redirect to `/calendar?error=...` when Supabase is missing or `training_on` fails `parseCivilDate` (`create.ts:12` and `:23`, same shape in `update.ts` and `delete.ts`). `showNotice` in `MonthCalendar.tsx:154` renders that text only when the open day equals the entry date. A redirect without `date` leaves the month grid with no message. Form RPC failures include `date` and do show in the dialog. `/team/new` renders its `error` query on the page.
- **Fix**: Render `error` in a banner on the calendar when no day is open, the same way the team page shows its error query.
- **Decision**: FIXED
