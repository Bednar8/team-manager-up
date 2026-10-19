---
date: 2026-10-19T09:52:52+02:00
researcher: unknown
git_commit: 40953bad88b0dcbc9af6f7733aed4a5031c28c33
branch: main
repository: team-manager-up
topic: "Ground test-plan Phase 2 for risks #3, #4, and #6"
tags: [research, codebase, ranking, submissions, trainings]
status: complete
last_updated: 2026-10-19
last_updated_by: unknown
---

# Research: Ground test-plan Phase 2 for risks #3, #4, and #6

**Date**: 2026-10-19T09:52:52+02:00
**Researcher**: unknown
**Git Commit**: 40953bad88b0dcbc9af6f7733aed4a5031c28c33
**Branch**: main
**Repository**: team-manager-up

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` for risks #3, #4, and #6. For each risk, find the real failure path in code, check the response guidance, locate existing tests, name the cheapest useful test layer, and flag speculative or misleading hot-spot evidence. Do not treat `src/components/calendar/` or `src/pages/` churn as the owner of the failure.

`context/foundation/lessons.md` is absent (workspace glob `**/lessons.md` returned no file).

This pass read the repository. It did not query the running database and did not run the Vitest suite.

## Summary

The three protections live in Postgres functions reached by HTTP. The calendar directories are not the gates.

- **Risk #3.** `public.team_km_ranking()` sums `distance_km` for the caller's team where `confirmed_at` is not null and `training_on` is less than or equal to the Warsaw civil date at readout. Athletes with no such row get `coalesce(..., 0)`. The coach membership row is not in that result. Today's confirmed kilometres are included. The replaced function body used a strict less-than and is not the current file. Ties are `rank()` over that sum; the PRD does not define ties. `record_training_readout` writes `distance_km` before confirmation. An unfiltered sum of `distance_km` includes that unconfirmed value; this function's `confirmed_at` predicate does not.
- **Risk #4.** Missing kilometres and `0` km are rejected before confirmation. A Warsaw-today date with no training row is rejected before insert. A second `begin` after `confirmed_at` is set is rejected and does not insert another row. The form hides the same cases; the HTTP and SQL paths still reject them. These four cases do not share one stored outcome.
- **Risk #6.** Past create and past delete are rejected when `training_on` is before the Warsaw civil date. A second training on the same team and day hits the unique constraint. Delete does not look at submissions. A today or future delete issues `delete from public.trainings`, and `training_submissions.training_id` is `on delete cascade`. That contradicts both the test-plan sentence and PRD FR-002 for today.

Cheapest layer for all three, on the paths below: Vitest in Node, HTTP against the running app, with the Phase 1 fixture and the data-preservation register. No browser snapshot. No TypeScript copy of `team_km_ranking()`.

Section 2 of the working-tree test plan needs a backport. The corrections are listed at the end of Detailed Findings. No anchor correction: the source column already says the hot spots are evidence, not owners.

## Detailed Findings

### Risk #3 — ranking sum

**Owner.** In `src/pages`, `supabase/migrations`, and the `*.{ts,tsx,astro,js,mjs,sql,md}` grep for `team_km_ranking`, the only application call is `src/pages/ranking.astro:28`. The function body that replacement migration installs is `supabase/migrations/20261003120000_immediate_km_ranking.sql:1-43`. The earlier file `supabase/migrations/20261003110000_team_km_ranking.sql:37` uses `training_on <` the Warsaw date. The later file is `create or replace` and uses `<=`. No other migration file in that grep names the function.

**Which rows enter the sum, in that later function.**

```30:42:supabase/migrations/20261003120000_immediate_km_ranking.sql
  left join (
    select
      s.user_id,
      sum(s.distance_km) as km_sum
    from public.training_submissions as s
    join public.trainings as t on t.id = s.training_id
    where t.team_id = v_team_id
      and t.training_on <= (timezone('Europe/Warsaw', now()))::date
      and s.confirmed_at is not null
    group by s.user_id
  ) as km on km.user_id = m.user_id
  where m.team_id = v_team_id
    and m.role = 'athlete';
```

For this `return query`: the caller must be a coach or athlete of `private.caller_team_id()` (`20261003120000_immediate_km_ranking.sql:15-20`). `caller_team_id()` reads `team_members.team_id` where `user_id = auth.uid()` (`supabase/migrations/20260926184325_athlete_joins_with_code.sql:283-294`). The summed submissions are those joined to a training of that team, with `training_on` less than or equal to `(timezone('Europe/Warsaw', now()))::date`, and with `confirmed_at` not null. The outer row set is `team_members` of that team whose `role` equals `athlete`. A membership row with `role = 'coach'` is outside that predicate. `team_members.user_id` is unique (`supabase/migrations/20260926162547_team_role_for_one_squad.sql:25`), so this schema has one membership row per user. The displayed total is `coalesce(km.km_sum, 0)` (`20261003120000_immediate_km_ranking.sql:27`).

**"Brak zgłoszenia to 0 km"** holds for an athlete row in this result when the left join finds no qualifying submission. It does not mean "missed today". A confirmed submission on an earlier `training_on` that still satisfies `<=` stays inside `sum(s.distance_km)`. The function has no date argument. "Ustalona data" in the test plan cannot be passed into the RPC. A fixture chooses `training_on` relative to Warsaw `now()`, the same civil date `tests/support.ts:72-78` formats with `timeZone: "Europe/Warsaw"`.

**The sum of every kilometre row is not this ranking.** `record_training_readout` copies its `distance_km` argument onto `training_submissions.distance_km` while `confirmed_at` is still null (`supabase/migrations/20261001171356_training_photo.sql:235-247`). The check constraint allows that combination: `confirmed_at is null or distance_km > 0` (`20261001171356_training_photo.sql:16-18`). The ranking join then drops that row because `confirmed_at is not null` fails. A future `training_on` fails the date predicate even when `confirmed_at` is set. Those two rows are the cases that falsify "sum every kilometre row" without reimplementing the function.

**Places.** The place column is `(rank() over (order by coalesce(km.km_sum, 0) desc))::integer` (`20261003120000_immediate_km_ranking.sql:28`). The window has no display-name key. `ranking.astro` reads `place` from the row (`src/pages/ranking.astro:99-104`) and does not compute a new place. It sorts the already-numbered rows by total kilometres descending, then `localeCompare(..., "pl")`, then `user_id` (`src/pages/ranking.astro:35-39`). PRD US-01, FR-010, FR-011, and FR-014, as read in `context/foundation/prd.md`, order distinct distances (6.5, 6, 4.8, 0) and do not mention a tie. "Miejsca przy remisie są zgodne z PRD" is not a check the PRD can score. The tie behavior that is still in this SQL and this page is the one the archived ranking plan recorded: shared place, next place skipped, Polish list order (`context/archive/2026-10-03-km-ranking-publication/plan.md:5` and `:28`, `plan-brief.md:25`). That archive's next-day publication rule is a different claim and is contradicted by the `<=` body and by current PRD FR-014.

**Page text.** Each row is one `<li>` containing the place, the display name, and `formatKm` (`src/pages/ranking.astro:128-140`). `formatKm` uses `Intl.NumberFormat("pl-PL", { maximumFractionDigits: 10, minimumFractionDigits: 0 })` and appends ` km` (`src/pages/ranking.astro:59-64`). In this agent's Node, that formatter without the suffix returned `0`, `4,8`, `6`, `6,5`, and `10` for the inputs 0, 4.8, 6, 6.5, and 10. The archived plan stated the page strings `15 km`, `6,5 km`, and `0 km` (`context/archive/2026-10-03-km-ranking-publication/plan.md:101`). This pass did not render the Astro page.

**Cheapest test.** `GET /ranking` with the caller's cookies. Seed one team through the existing fixture. Use literal expectations from the seed, not a helper that repeats the SQL filters: a confirmed athlete shows that confirmed distance; an athlete who has `record_training_readout` and no confirm shows `0 km`; an athlete with no submission row shows `0 km`; a future training's confirmed kilometres, inserted outside `confirm_training_photo` because that function requires Warsaw today (`supabase/migrations/20261002224800_coach_sees_submissions.sql:50-51`), stay out of the confirmed athlete's total. Assert inside the `<li>` from `listItemContaining` (`tests/support.ts:419-427`). The coach's display name is absent from those items. A tie, if the plan locks the archive rule rather than the PRD, is two equal confirmed sums, the same `place` number on both items, and Polish name order. Do not encode `training_on < today` as the expected cutoff.

A unit test that reimplements the filters would not execute this function. There is no shared TypeScript sum in the grep above.

### Risk #4 — submission rejected

**Owner.** The form predicates in `src/components/calendar/MonthCalendar.tsx` are not the gate a crafted POST uses. `athleteCanUpload` requires a training and `selected === warsawToday` (`MonthCalendar.tsx:515`). `canConfirm` requires `distanceValue > 0` (`MonthCalendar.tsx:1007`). The server paths are `POST /api/trainings/photo/begin` and `POST /api/trainings/photo/confirm`.

**Missing kilometres and 0 km.** `readConfirmInput` returns 400 `"Podaj liczbę kilometrów większą od zera."` when `distance_km` is missing, null, or a number `<= 0` (`src/pages/api/trainings/photo/confirm.ts:7`, `:79-81`). That check runs before the storage-exists check (`confirm.ts:24-37`). The current `confirm_training_photo` repeats `distance_km is null or distance_km <= 0` with the same Polish sentence (`supabase/migrations/20261002224800_coach_sees_submissions.sql:86-88`). The original function in `20261001171356_training_photo.sql:183-185` had the same predicate and is replaced by this `create or replace`. The check constraint blocks a confirmed row unless `distance_km > 0` (`20261001171356_training_photo.sql:16-18`). No later migration in the `training_submissions_confirmed_has_km` grep drops that constraint.

Stored state on this path: `begin_training_photo` inserts one unconfirmed row when none exists (`20261001171356_training_photo.sql:110-115`). A later confirm that fails the kilometre check returns before `update`, so that row keeps `confirmed_at` null. Ranking's `0 km` for a missing person is not a confirmed distance of 0. This confirm path rejects 0.

**Day without a training.** Both functions require `training_on = (timezone('Europe/Warsaw', now()))::date` before they look up the training (`20261001171356_training_photo.sql:70-72` for begin; `20261002224800_coach_sees_submissions.sql:50-52` for confirm). On that date, a missing training raises `"Tego dnia nie ma treningu."` (`20261001171356_training_photo.sql:80-81`, `20261002224800_coach_sees_submissions.sql:60-61`). A different civil date fails the date predicate first, with `"Zdjęcie można wgrać tylko w dniu treningu."`. `begin` does not insert when the training lookup fails. `begin.ts` maps the RPC error to HTTP 400 (`src/pages/api/trainings/photo/begin.ts:29-33`). `begin.ts` calls `photoConfigError()` before the RPC (`begin.ts:6-8`). That error is `"Odczyt zdjęcia nie jest skonfigurowany."` when `OPENROUTER_API_KEY` is empty (`src/lib/training-photo.ts:12`, `:29-33`). `confirm.ts` does not call `photoConfigError`, so the no-training confirm case does not depend on that key. A no-training begin case does.

**Second photo after confirmation.** When a row exists and `confirmed_at` is not null, `begin_training_photo` raises `"To zdjęcie jest już potwierdzone."` and does not insert (`20261001171356_training_photo.sql:90-93`). The unique key `(training_id, user_id)` is the table backstop (`20261001171356_training_photo.sql:15`), not the branch this function takes. `confirm_training_photo` raises the same sentence when already confirmed (`20261002224800_coach_sees_submissions.sql:82-83`). `begin.ts` removes the storage object only after the RPC returns a path (`begin.ts:41-46`), so this rejection does not reach that remove. The stored confirmed row stays that one row.

A second `begin` while `confirmed_at` is still null is a different branch: the same row is cleared and its path is returned (`20261001171356_training_photo.sql:95-107`). That is not the "after confirmation" case. FR-009 same-day replacement is still proposed as roadmap S-06 (`context/foundation/roadmap.md:52`). No replace route was found under `src/pages/api/trainings/photo/` in this inspection (`begin`, `confirm`, plus the readout route the Phase 1 plan says tests must not call).

**Cheapest test.** HTTP, four assertions, no browser:

1. After `begin` on Warsaw today, `POST /api/trainings/photo/confirm` with `distance_km` omitted, null, or 0 returns 400 and the row's `confirmed_at` is null. Upload is not required for this input check.
2. With no training on Warsaw today, `POST /api/trainings/photo/confirm` returns 400 `"Tego dnia nie ma treningu."` and there is no submission row. The same message from `begin` needs a configured photo key or the route returns 503 first.
3. After a confirmed row for Warsaw today, a second `POST /api/trainings/photo/begin` returns 400 `"To zdjęcie jest już potwierdzone."` and the confirmed row is unchanged. This call needs the photo key.
4. Do not treat one successful confirm as the proof.

`record_training_readout` remains the fake readout when a case needs a readout before confirm. Do not call `POST /api/trainings/photo/readout`.

### Risk #6 — training date, duplicate day, delete

**Owner.** `POST /api/trainings/create`, `update`, and `delete` are thin wrappers (`src/pages/api/trainings/create.ts` delegates to `trainingAction`). `trainingAction` parses the form date and calls `create_training`, `update_training_description`, or `delete_training` (`src/lib/training-action.ts:6-34`). With `Accept: application/json`, an RPC error becomes HTTP 400 and `{ error: error.message }` (`training-action.ts:17-19`, `:33-34`). Authenticated clients have `select` on `trainings` and no insert, update, or delete grant in `supabase/migrations/20260928200436_coach_trainings.sql:14-15`. The coach check inside the functions uses `auth.uid()` (`20260926184325_athlete_joins_with_code.sql:23-28`). A service-role insert, which Phase 1 uses for yesterday, does not run this predicate.

**Past date.** `create_training`, `update_training_description`, and `delete_training` each raise `"Trening można dodać, zmienić albo usunąć tylko na dziś lub później."` when `training_on < (timezone('Europe/Warsaw', now()))::date` (`20260928200436_coach_trainings.sql:39-41`, `:75-77`, `:111-113`). No later migration in the function-name grep replaces these three functions. The Phase 1 quotation of that sentence still matches this file.

**Second training the same day.** The table has `unique (team_id, training_on)` (`20260928200436_coach_trainings.sql:6`). `create_training` maps `unique_violation` to `"Tego dnia trening już jest."` (`20260928200436_coach_trainings.sql:50-52`).

**Delete does not consult submissions.** After the date check, `delete_training` runs:

```115:117:supabase/migrations/20260928200436_coach_trainings.sql
  delete from public.trainings
  where team_id = v_team_id
    and public.trainings.training_on = delete_training.training_on;
```

`training_submissions.training_id` references `public.trainings (id) on delete cascade` (`20261001171356_training_photo.sql:3`). That foreign-key action is what removes referencing submission rows when this `delete` removes the training row. This pass did not execute the delete. A grep of `create trigger` and `storage.objects` in `supabase/migrations` returned no matches, so those files do not name a bucket-object delete on this path. `tests/training-actions.test.ts:38-41` already expects HTTP 200 and an empty `trainings` set after deleting Warsaw today, and that test does not insert a submission.

PRD FR-002 says the coach may delete a training with a future date only (`context/foundation/prd.md:66-67`). This function's predicate allows today as well as the future, with or without submissions. FR-003's future-only edit (`prd.md:68-69`) meets the same today-inclusive predicate in `update_training_description`. The test-plan sentence "usunięcie treningu ze zgłoszeniami są odrzucone" matches neither the function nor FR-002. A past training with submissions is rejected because the date is past, including when the submission count is zero. That case does not show a submission guard.

**UI is not this write.** `coachCanWrite` is true when the role is coach, the client `today` is known, and `isPastCivil(selected, today)` is false (`MonthCalendar.tsx:513-514`). `isPastCivil` is string less-than on `YYYY-MM-DD` (`src/components/calendar/month.ts:131-135`). The client `today` is `localTodayCivil()`, which uses the Date local year, month, and day (`MonthCalendar.tsx:110-112`, `:146`). The server snapshot is `null` (`MonthCalendar.tsx:122-124`), so in the server HTML `todayKnown` is false and `coachCanWrite` is false. `warsawToday` gates the squad list and athlete upload (`MonthCalendar.tsx:507-515`), not `coachCanWrite`. A calendar screenshot can hide the form while `POST /api/trainings/delete` still runs the SQL predicate. When the browser's civil date and the Warsaw civil date differ, `coachCanWrite` and the SQL `<` check are different comparisons. This pass did not measure a machine where those dates differ.

**Cheapest test.** The same JSON POST shape as `tests/training-actions.test.ts:11-22`, as the coach:

- `create` with `warsawYesterday()` returns 400 and that Polish date sentence; the training row is absent.
- `create` twice for the same `training_on` returns 400 `"Tego dnia trening już jest."` on the second call; one row remains.
- `delete` of a past training returns 400 and the submission seeded for that day is still there.
- Do not assert that delete-with-submissions is rejected for today or a future day. On this function those calls proceed to the `delete`. Whether a test should expect that cascade, or should fail until the product matches FR-002 for today, is a planning choice in Open Questions. A green assertion that today-with-submissions returns 200 would record the FR-002 gap as intended behavior.

### Existing tests

The inspected `tests/**/*.ts` set is: `harness.test.ts`, `test-resources.test.ts`, `training-actions.test.ts`, `attendance-past.test.ts`, `attendance-today.test.ts`, `support.ts`, `test-data-preservation.test.ts`.

Grep of `ranking`, `team_km`, `Tego dnia trening`, and `już potwierdzone` under `tests/` hit `attendance-today.test.ts:42-50`, which `GET`s `/ranking` and checks the training-reminder `<aside>`, not place or kilometres. `training-actions.test.ts` covers today's create, update, empty-description rejection, and delete without a submission. `attendance-past.test.ts` inserts yesterday with the service role and reads the coach list. None of those files assert the four risk #4 rejections or the past-create, duplicate-day, or past-delete rejections.

Cookbook §6.2 and §6.4 already describe the runner, the register, loopback, `record_training_readout`, and the `<li>` oracle. §6.5 is still the TBD line for this phase. New tests follow the preservation contract in `context/archive/2026-10-15-preserve-local-test-data/plan.md`: register `.test-runs/<run-id>.json` before create, clean that run's resources, do not reset or truncate. The Phase 1 plan's "leave the team" sentence is marked historical at the top of `context/archive/2026-10-05-testing-attendance-and-confirm/plan.md`.

### Test-plan §2 backport

Working tree `context/foundation/test-plan.md`, read this session (`Last updated: 2026-10-19`). `git status --short` showed that file modified against `40953bad`. These corrections belong in a later `--refresh` or an explicit edit; this research does not edit the plan.

- Response-guidance correction: risk #3 "miejsca przy remisie są zgodne z PRD" — the PRD text read here does not define a tie; `team_km_ranking()` assigns `rank()` over the coalesced sum alone, and `ranking.astro` orders equal sums with Polish `localeCompare` then `user_id`.
- Response-guidance correction: risk #3 "brak zgłoszenia to 0 km" and "z ustaloną datą" — `0` is `coalesce` when that athlete has no confirmed submission on `training_on <=` the Warsaw date inside `team_km_ranking()`; the function takes no date; a missed day does not clear earlier confirmed kilometres. The archived next-day `<` cutoff is not this function body.
- Response-guidance correction: risk #4 "nie dają drugiego oddania" — omitted or `0` km leaves an existing unconfirmed begin-row unconfirmed; a Warsaw-today date with no training inserts nothing; a second begin after `confirmed_at` is set does not insert a second row. Those are three stored outcomes, not one "second submission".
- Response-guidance correction: risk #6 "usunięcie treningu ze zgłoszeniami są odrzucone" — `delete_training` rejects `training_on` before the Warsaw date and does not read submissions; a today or future delete cascades `training_submissions`. PRD FR-002's future-only delete is not what this function does for today.

No anchor correction. The hot-spot cells already say they are evidence. They are misleading if read as owners: this inspection's gates are the SQL functions above, not directory churn.

No separate speculative-risk line beyond the tie sentence. The tie sentence is the speculative one, and it is the first correction above. The delete-with-submissions risk is not speculative: the cascade path is in the schema. The guidance is what is wrong.

## Code References

- `supabase/migrations/20261003120000_immediate_km_ranking.sql:27-42` — current sum, athlete rows, `rank()`, Warsaw `<=`
- `supabase/migrations/20261003110000_team_km_ranking.sql:37` — replaced next-day `<`
- `src/pages/ranking.astro:28-40` — RPC call and display sort
- `src/pages/ranking.astro:59-64` — `pl-PL` kilometre text
- `supabase/migrations/20261001171356_training_photo.sql:15-18` — one row per user per training; confirmed implies `distance_km > 0`
- `supabase/migrations/20261001171356_training_photo.sql:70-115` — begin date, missing training, confirmed block, unconfirmed reuse
- `supabase/migrations/20261001171356_training_photo.sql:239-247` — readout writes `distance_km` before confirm
- `supabase/migrations/20261002224800_coach_sees_submissions.sql:50-88` — current confirm date, missing training, 0 km
- `src/pages/api/trainings/photo/confirm.ts:79-81` — HTTP kilometre check before storage
- `src/pages/api/trainings/photo/begin.ts:6-33` — photo-config 503, then RPC 400
- `supabase/migrations/20260928200436_coach_trainings.sql:6` — one training per team per day
- `supabase/migrations/20260928200436_coach_trainings.sql:39-52` — past create rejected; duplicate mapped
- `supabase/migrations/20260928200436_coach_trainings.sql:111-117` — delete is date-only, then `delete from trainings`
- `src/lib/training-action.ts:17-34` — JSON 400 carries the RPC message
- `src/components/calendar/MonthCalendar.tsx:110-124` — browser-local today; server snapshot null
- `src/components/calendar/MonthCalendar.tsx:513-515` — write visibility vs upload visibility
- `tests/training-actions.test.ts:38-41` — today delete without submissions returns 200
- `tests/attendance-today.test.ts:42-50` — `/ranking` reminder markup, not places

## Architecture Insights

The product write is an authenticated HTTP form or JSON body that calls a `security definer` function. The function compares `training_on` with `(timezone('Europe/Warsaw', now()))::date` at call time. The calendar component's write visibility uses a different clock, and the server HTML does not show the write form because its today snapshot is null. A test of the rule posts to the route. A test of the pixels does not run the function.

Ranking is the same shape: one RPC, one page that prints `place` and a formatted total. The number under test is the seeded confirmed distance, or `0` when this function's join misses. It is not a second implementation of `sum`.

Phase 1's service-role insert remains the way to put a row on a date `create_training` or `confirm_training_photo` will not accept. Using that insert as the act under test skips the rejection.

## Historical Context (from prior changes)

- `context/archive/2026-10-03-km-ranking-publication/plan.md:5` says a training's kilometres enter on the next Warsaw day. **Contradicted** by `20261003120000_immediate_km_ranking.sql:37` (`<=`) and by current PRD FR-014 (`context/foundation/prd.md:96-97`) and roadmap S-04 (`context/foundation/roadmap.md:40`). The exception is the whole publication-day rule, not the rest of that plan.
- `context/archive/2026-10-03-km-ranking-publication/plan.md:28` and `plan-brief.md:25` say a tie shares a place, the next place skips, and the list is Polish alphabetical. **Supported** by `rank()` with no name in the window (`20261003120000_immediate_km_ranking.sql:28`) and by the page sort (`src/pages/ranking.astro:35-39`). The PRD still does not say this. That is support for the archive and the code, not for a PRD sentence.
- `context/archive/2026-10-03-km-ranking-publication/plan-brief.md:45` says the sum is confirmed kilometres from past days. **Partial:** confirmed is supported (`confirmed_at is not null`); "past days" is the contradicted `<` rule. The current predicate includes the Warsaw today row.
- `context/archive/2026-10-05-testing-attendance-and-confirm/plan.md:37-39` defers ranking, out-of-rule submissions, and training-date scenarios to Phase 2, and uses the past-date rejection only to justify the service-role insert. **Supported** by the still-present `create_training` date check and by the `tests/` grep in Existing tests, which did not find those rejection messages.
- `context/archive/2026-10-05-testing-attendance-and-confirm/plan.md:25` says the new team stays after the run. **Contradicted** as a current procedure by the 2026-10-15 note at the top of that file and by `context/archive/2026-10-15-preserve-local-test-data/plan.md`. The historical Progress checkboxes stay as that note describes.
- PRD FR-001 (`prd.md:64-65`) matches `create_training`'s past-date check and the unique pair. **Supported** for those two writes.
- PRD FR-002 (`prd.md:66-67`) says delete only a future date. **Contradicted** for today by `delete_training`'s `<` check (`20260928200436_coach_trainings.sql:111-113`). Past delete and future delete match that sentence's past-versus-future split; today is the exception.
- Roadmap line `context/foundation/roadmap.md:194` records that, at archive time, immediate versus next-day was unsettled. **Historical snapshot.** The current S-04 outcome in the same file (`roadmap.md:122`) says confirmed kilometres enter immediately, including today's Warsaw training. That current sentence matches the `<=` function.

## Related Research

No `research.md` under `context/changes/` or `context/archive/` (glob `context/**/research.md` returned no file). The plans cited above are the prior decisions.

## Open Questions

- **Delete oracle for the planner.** The code path for today or a future day with submissions is cascade, not rejection. PRD FR-002 wants today rejected. A test that expects 400 on that case is red against this function. A test that expects 200 freezes the gap. This phase can still lock past create, duplicate day, and past delete, which this function does reject. Choosing whether today-with-submissions is in this phase is a product-oracle decision, not a missing code fact. It does not block `/10x-plan`.
- **Tie case.** The implementation and the 2026-10-03 archive define it. The PRD does not. Include it against that code and archive rule, or leave it out. Do not cite the PRD as the oracle.
- **Installed database.** This pass did not read `pg_proc` or the local migration history. If `20261003120000` is not applied, a running database can still have the `<` body from `20261003110000`. The findings above are the repository definitions.
