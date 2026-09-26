# Athlete joins with code Implementation Plan

## Overview

A signed-in account with no team chooses coach or athlete. The coach creates one team and receives a single reusable code. An athlete enters name and surname plus that code and joins immediately. Everyone on the team sees the squad list. Only the coach sees the code, and replacing it takes a confirmation.

## Current State Analysis

F-01 is done. `public.teams` and `public.team_members` exist, with one membership per account and one coach per team. The only write path is `public.create_coach_team`, which inserts a coach row. The `athlete` role is allowed by the check and has no insert path. `team_members` select is own-row only, so nobody can list the squad. There is no update grant.

A signed-in user with no membership who opens `/dashboard` is sent to `/team/new`, which only creates a team. The dashboard hardcodes the label "Coach" and does not read `role`. Sign-in still returns to `/`. Signup still ends on `/auth/confirm-email`.

## Desired End State

Anna signs in as today and lands on `/`. Opening `/dashboard` shows two choices, Coach and Athlete. She chooses Coach, enters `Anna Kowalska` and `KS Bieg`, and the dashboard shows that name, Coach, `KS Bieg`, an 8-character team code, and a squad list containing `Anna Kowalska`.

Bartek, on his own account, opens `/dashboard`, chooses Athlete, enters `Bartek Nowak` and Anna's code, and joins on that submit. His dashboard shows Athlete, `KS Bieg`, and the same squad names. It does not show the code. Anna's list now includes `Bartek Nowak`.

A second athlete who also enters `Anna Kowalska` joins as a second row. Celina can still create `Inny klub` on her own account. Reloading `/team/new` before a successful submit shows the choice again. After Anna confirms a replacement, the old code no longer joins anyone and Bartek stays on the team.

### Key Discoveries:

- `create_coach_team` is `security invoker` and is the pattern for a signed-in write (`supabase/migrations/20260926162547_team_role_for_one_squad.sql`).
- An athlete cannot select `teams` until a membership exists (`teams_select_member`, same file). A join that looks up a code has to be `security definer`.
- `team_members_select_own` is `user_id = auth.uid()` only. A policy that subqueries `team_members` to find teammates recurses under RLS. F-01 already put that kind of check in `private` as a security-definer helper.
- Authenticated has select and insert only. Replacement cannot be a table update from the client.
- Smoke posts straight to `POST /api/team` and expects the dashboard body to include the display name, `Coach`, and the team name (`scripts/smoke.mjs`).

## What We're NOT Doing

- Removing a member, leaving a team, renaming a display name, or editing a team name
- A coach approval step before the athlete appears
- A new code per athlete, or a code that cannot be replaced
- Separate given-name and surname columns, a unique display name, or any way to tell two identical names apart
- Showing the join code to athletes
- Saving the coach-or-athlete choice before create or join succeeds, including in the URL
- Changing signup, the confirm-email page, or the sign-in redirect to `/`
- Email invites, a second coach, a team switcher, or more than one membership per account
- Trainings, photos, and ranking
- Rate limiting or a captcha on the code

## Implementation Approach

The team code lives in its own table, readable by the coach of that team and not by an athlete's select on `teams`. Creating a team writes a code in the same transaction. Joining and replacing are security-definer functions granted to `authenticated`. The squad list is a wider select on `team_members`, gated by a `private` helper so the policy does not read `team_members` under RLS.

`/team/new` is still the page for an account with no membership. It offers Coach and Athlete. The coach form is the current create form with the person field labeled `Name and surname`. The athlete form posts name and surname plus the code. The pick is not stored. `/dashboard` reads `role`, lists every display name on the team for every member, and shows the code plus a confirmation step only when the member is the coach.

## Critical Implementation Details

- **The code is not a column on `teams`.** Members can select their team row. A column there would let an athlete read the code with the anon key. Keep it in `team_join_codes`, with select only for the coach.
- **Do not widen `team_members` select with a subquery on `team_members`.** Use a `private` security-definer helper that returns the caller's `team_id`. The same recursion trap is why F-01's coach check lives in `private`.
- **A failed create or join redirects to `/team/new?error=` and that load shows the choice, not the form just submitted.** Do not put the chosen role in the query string. A reload before success shows Coach and Athlete again.
- **`create_coach_team` stays `security invoker`.** It calls a security-definer helper to insert the code after the coach row exists, in the same transaction. A team without a code cannot be created.
- **Join compares a normalized code and raises one message when nothing matches.** Trim, remove spaces and hyphens, then uppercase. Unknown codes and codes that are not 8 characters from the team alphabet both raise `That code does not match a team`. Do not include the submitted code or the team name in the error.

---

## Phase 1: Join code and athlete membership in Postgres

### Overview

Add the code, the athlete insert, code replacement, and squad visibility. No pages in this phase. Verify with the database and a signed-in RPC call.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_athlete_joins_with_code.sql` (from `npx supabase migration new athlete_joins_with_code`)

**Intent**: Give every team one code the coach can replace, let a signed-in account with no team become an athlete by that code, and let members read the squad. Existing teams created by F-01 receive a code in this migration.

**Contract**:

- `public.team_join_codes`: `team_id uuid` primary key references `public.teams(id)` on delete cascade, `code text` not null unique. `code` is stored uppercase, with no spaces or hyphens, length 8, using only `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0`, `O`, `1`, or `I`).
- RLS is enabled. `anon` has no grants. `authenticated` has select only. No insert, update, or delete grant.
- Select policy: the caller is the coach of `team_id`. Implement that check in a `private` security-definer helper so the policy does not subquery `team_members` under RLS. An athlete's select returns no row.
- `private` helper, security definer, `search_path` fixed, execute revoked from `public` and `anon`: issues a new code for a team whose caller is the coach and which has no code yet. `create_coach_team` calls it after the coach insert. Retry on a unique collision.
- `public.create_coach_team(team_name text, display_name text)` keeps its current signature, `security invoker`, and grants. It still trims both names to the existing 1–80 rule. It now also issues the join code before it returns. A failure rolls back the team and the coach row.
- Backfill: every existing `teams` row with no `team_join_codes` row gets a code in this migration.
- `public.join_team_with_code(join_code text, display_name text) returns uuid`, `language plpgsql`, `security definer`, `search_path` fixed to `public`. Execute granted to `authenticated` and revoked from `public` and `anon`. Requires `auth.uid()`. Trims `display_name` with the same 1–80 rule as `create_coach_team`. Rejects an existing membership with the same meaning as `already a member of a team`. Normalizes `join_code` as above. On no match, raises `That code does not match a team` and inserts nothing. On match, inserts `team_members` with `role = 'athlete'`, `user_id = auth.uid()`, and the trimmed display name, and returns `team_id`. Duplicate display names on one team are allowed. There is no unique constraint on `display_name`.
- `public.replace_team_join_code() returns text`, `language plpgsql`, `security definer`, `search_path` fixed to `public`. Execute granted to `authenticated` and revoked from `public` and `anon`. Requires `auth.uid()` and a coach membership. Replaces that team's code. Returns the new code. Previous members stay. The previous code no longer matches `join_team_with_code`.
- Replace `team_members_select_own` with a select policy for `authenticated`: `team_id` equals the caller's team, from a `private` security-definer helper. Coach and athlete both see every row on their team and no row from any other team. Insert policy for `role = 'coach'` stays as F-01 left it. Do not add an athlete insert policy; the join function is the only athlete write.

```sql
create function public.join_team_with_code(join_code text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
```

```sql
create function public.replace_team_join_code()
returns text
language plpgsql
security definer
set search_path = public
```

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies `supabase/migrations/*_athlete_joins_with_code.sql` and exits 0

#### Manual Verification:

- A signed-in account with no team joins an existing team with its code and gets role `athlete`
- A code that does not match creates no membership
- After the coach replaces the code, the old code does not join and the existing members are still on the team
- A member can read every display name on their team; an athlete cannot read the join code
- Two athletes who submit the same display name both join

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Who-are-you gate and join

### Overview

An account with no team chooses coach or athlete on `/team/new`. Coach creates a team as today, with the person field labeled `Name and surname`. Athlete joins with name and surname plus the code. Signup and the sign-in redirect stay as they are.

### Changes Required:

#### 1. No-team page

**File**: `src/pages/team/new.astro`

**Intent**: The first protected screen asks who the person is, then shows only that form. A reload before success asks again.

**Contract**: Astro page. Two choices, labeled `Coach` and `Athlete`. The pick is not written to the URL, the session, or the database. A fresh load of `/team/new`, including a reload, shows the two choices and does not show a previously picked form. The coach form posts to `/api/team` with required fields `display_name` and `team_name`. Its person label is `Name and surname`. Its team label stays `Team name`. The athlete form posts to `/api/team/join` with required fields `display_name` and `join_code`. Its labels are `Name and surname` and `Team code`. Show `Astro.url.searchParams.get("error")` on the choice step. Do not add `"use client"`. A client island with `client:load` is appropriate if the pick cannot be done in static HTML without storing it in the URL.

#### 2. Join action

**File**: `src/pages/api/team/join.ts`

**Intent**: Call the phase 1 join function as the signed-in user.

**Contract**: `POST` only. No session redirects to `/auth/signin`. An existing membership redirects to `/dashboard` and does not call the function. Otherwise call `join_team_with_code` with `join_code` and `display_name`. Success redirects to `/dashboard`. A no-match redirects to `/team/new?error=` with `That code does not match a team`. Any other failure redirects to `/team/new?error=` with the message. Use `createClient` from `src/lib/supabase.ts`. This route is not added to `PROTECTED_ROUTES`; the handler checks the session, same as `src/pages/api/team.ts`.

#### 3. Create action copy

**File**: `src/pages/api/team.ts`

**Intent**: Keep the coach create path, and send its errors back to the choice screen.

**Contract**: Still `POST` to `create_coach_team` with `team_name` and `display_name`. Success still redirects to `/dashboard`. An existing membership still redirects to `/dashboard`. Failures still redirect to `/team/new?error=`. No new fields.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm run smoke` passes, and sign-in still redirects to `/`

#### Manual Verification:

- A signed-in account with no team opens `/dashboard`, sees Coach and Athlete, and a reload shows that choice again
- The coach submits Name and surname plus a team name and lands on the dashboard as Coach
- The athlete submits Name and surname plus a valid code and `/dashboard` returns 200 instead of redirecting to `/team/new`
- A failed submit returns to the choice with an error, and sign-in itself still returns to `/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard roster and coach code

### Overview

The dashboard shows the real role and the squad to every member. The coach also sees the code and can replace it after a confirmation page. Smoke covers a second account joining.

### Changes Required:

#### 1. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Show who this person is, the team, and every display name on that team. Show the code only to the coach.

**Contract**: Select `display_name`, `role`, and `team_id` for the signed-in membership. Show `Coach` when `role` is `coach` and `Athlete` when `role` is `athlete`. Select teammate `display_name` values and render them in order `display_name` ascending, then `created_at` ascending, then `id` ascending. The coach's own name is included. Select the join code from `team_join_codes`. Render it only when the membership role is `coach` and a row came back. Put the stored 8-character code on one element as `data-team-code`. An athlete select returns no code row; that is not an error and the attribute is absent. The coach gets a link to `/team/code`. The athlete does not.

#### 2. Replace confirmation

**File**: `src/pages/team/code.astro`

**Intent**: The current code stops working only after the coach confirms.

**Contract**: Astro page. Add `/team/code` to `PROTECTED_ROUTES` in `src/middleware.ts`. No session still redirects to `/auth/signin`. No membership redirects to `/team/new`. A signed-in athlete who opens this page redirects to `/dashboard`. The page states that the current code will stop working and that people already on the team stay. It shows the current code. The confirm control posts to `/api/team/code`. There is no replace control on the dashboard itself.

**File**: `src/pages/api/team/code.ts`

**Intent**: Replace the code only for the coach, after that confirmation post.

**Contract**: `POST` only. No session redirects to `/auth/signin`. A caller who is not the coach redirects to `/dashboard` and does not call the function. Otherwise call `replace_team_join_code`. Success redirects to `/dashboard`. Failure redirects to `/team/code?error=` with the message.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Keep the coach path, and prove a second account can fail a wrong code and then join.

**Contract**: The existing steps stay, including sign-in to `/` and the coach dashboard body containing the display name, `Coach`, and the team name. Add a second cookie jar. After the coach dashboard, read `data-team-code`. Sign out. Sign up and sign in a second account. `POST /api/team/join` with a wrong code and a display name redirects to `/team/new?error=That code does not match a team`, and `GET /dashboard` for that account still redirects to `/team/new`. `POST /api/team/join` with the captured code and a different display name redirects to `/dashboard`. That dashboard body includes `Athlete`, the team name, both display names, and does not include `data-team-code`. Sign in as the coach again. That dashboard body includes both display names and `data-team-code`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm run smoke` passes, including a second account that fails a wrong code and then joins, and both dashboards show both display names

#### Manual Verification:

- Anna's dashboard shows her name, Coach, `KS Bieg`, the code, and a squad list that includes her
- Bartek's dashboard shows Athlete, `KS Bieg`, and the same names, and does not show the code
- Replacing the code asks for confirmation first; after confirmation the dashboard shows a different code and Bartek is still on the team
- A second athlete named Anna Kowalska appears as a second row

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No unit runner is configured. Do not add one for this change. The database rules are checked by the phase 1 manual steps. The HTTP path is checked by `scripts/smoke.mjs`.

### Integration Tests:

`npm run smoke` against a local server whose Supabase has the migration applied. That is the same shape CI uses (`.github/workflows/ci.yml`: `supabase start`, then `BASE_URL=http://localhost:4321 npm run smoke`).

### Manual Testing Steps:

1. Reset the local database so the migration has run.
2. Sign in as Anna. Confirm sign-in landed on `/`. Open `/dashboard`, choose Coach, submit `Anna Kowalska` / `KS Bieg`, and confirm the dashboard shows that name, Coach, `KS Bieg`, a code, and her name on the squad list.
3. Reload `/team/new` on a new account before submitting and confirm the choice is showing. Submit a code that does not match and confirm the choice is showing again with `That code does not match a team`.
4. As Bartek, choose Athlete, submit `Bartek Nowak` and Anna's code, and confirm his dashboard says Athlete, lists both names, and has no code. Confirm Anna's list includes him.
5. Join once more as `Anna Kowalska` and confirm two rows with that name. Confirm a replacement on `/team/code`, then confirm the old code fails and Bartek is still listed.
6. Sign in as Celina and create `Inny klub`. Confirm she does not see Anna's squad.

## Performance Considerations

The squad is one select of `team_members` by `team_id`. That column is already indexed. One team of a handful of athletes does not need a cache or pagination.

## Migration Notes

Teams created before this migration have no code. The migration backfills one code per existing team. Auth users with no membership still reach `/team/new` on `/dashboard`.

The migration is forward-only. Apply it locally with `npx supabase db reset` for this change. Pushing it to a hosted Supabase project is a separate human step.

Deleting an auth user still cascades to their membership and, when they are `created_by`, to that team, its memberships, and its join code.

## References

- Roadmap outcome: `context/foundation/roadmap.md` (S-02, change id `athlete-joins-with-code`)
- Access control: `context/foundation/prd.md` (Access Control, "kod od trenera"; US-01)
- Prior contract: `context/archive/2026-09-26-team-role-for-one-squad/plan.md`
- Issue: `context/foundation/tasks-github.md` (GitHub #3)
- Membership gate: `src/middleware.ts`
- Create team: `src/pages/api/team.ts`, `src/pages/team/new.astro`
- Dashboard today: `src/pages/dashboard.astro`
- Smoke: `scripts/smoke.mjs`
- Migration: `supabase/migrations/20260926162547_team_role_for_one_squad.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Join code and athlete membership in Postgres

#### Automated

- [x] 1.1 `npx supabase db reset` applies `supabase/migrations/*_athlete_joins_with_code.sql` and exits 0

#### Manual

- [x] 1.2 A signed-in account with no team joins an existing team with its code and gets role `athlete`
- [x] 1.3 A code that does not match creates no membership
- [x] 1.4 After the coach replaces the code, the old code does not join and the existing members are still on the team
- [x] 1.5 A member can read every display name on their team; an athlete cannot read the join code
- [x] 1.6 Two athletes who submit the same display name both join

### Phase 2: Who-are-you gate and join

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `npm run smoke` passes, and sign-in still redirects to `/`

#### Manual

- [ ] 2.4 A signed-in account with no team opens `/dashboard`, sees Coach and Athlete, and a reload shows that choice again
- [ ] 2.5 The coach submits Name and surname plus a team name and lands on the dashboard as Coach
- [ ] 2.6 The athlete submits Name and surname plus a valid code and `/dashboard` returns 200 instead of redirecting to `/team/new`
- [ ] 2.7 A failed submit returns to the choice with an error, and sign-in itself still returns to `/`

### Phase 3: Dashboard roster and coach code

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes
- [ ] 3.3 `npm run smoke` passes, including a second account that fails a wrong code and then joins, and both dashboards show both display names

#### Manual

- [ ] 3.4 Anna's dashboard shows her name, Coach, `KS Bieg`, the code, and a squad list that includes her
- [ ] 3.5 Bartek's dashboard shows Athlete, `KS Bieg`, and the same names, and does not show the code
- [ ] 3.6 Replacing the code asks for confirmation first; after confirmation the dashboard shows a different code and Bartek is still on the team
- [ ] 3.7 A second athlete named Anna Kowalska appears as a second row
