# Team role for one squad Implementation Plan

## Overview

A signed-in account can become the coach of one team. Email-and-password login stays as it is. Athlete membership is representable in the database, and the join-by-code flow that fills it stays in S-02.

## Current State Analysis

Sign-in is Supabase email and password. The session user is `locals.user` from `getUser()`, and the identifier a membership can attach to is `user.id`. `PROTECTED_ROUTES` is only `/dashboard`. A successful sign-in redirects to `/`, and `/dashboard` renders that user's email with no team and no role.

There is no domain schema. `supabase/migrations/` does not exist. `README.md` states that the app uses `auth.users` only. `supabase/config.toml` loads `./seed.sql` on reset, and that file is absent. The app reads only `SUPABASE_URL` and `SUPABASE_KEY` (the anon key), so Postgres row-level security is the access model. There is no service-role client.

`scripts/smoke.mjs` signs up a fresh account and expects `GET /dashboard` to return 200. After this change that account has no team, so that assertion is wrong until the account creates one.

### Key Discoveries:

- Session identity is the Supabase Auth UUID on `locals.user.id` (`src/middleware.ts`, `src/env.d.ts`). App UI currently prints `user.email` only (`src/pages/dashboard.astro`).
- New authenticated pages must be added to `PROTECTED_ROUTES` (`src/middleware.ts`, `AGENTS.md`).
- Migrations are `YYYYMMDDHHmmss_short_description.sql` under `supabase/migrations/`, with RLS and per-operation, per-role policies (`AGENTS.md`). Create the file with `npx supabase migration new team_role_for_one_squad` so the timestamp comes from the CLI.
- Forms that need no client behavior are Astro posts to an API route (`src/pages/dashboard.astro` sign-out). Errors on auth pages arrive as `?error=` (`src/pages/auth/signin.astro`).
- CI applies local migrations with `supabase start` and then runs `npm run smoke` (`.github/workflows/ci.yml`).

## Desired End State

Anna signs in with email and password and still lands on `/`. She opens `/dashboard` and is sent to `/team/new`. She submits display name `Anna` and team name `KS Bieg`. `/dashboard` then shows that name, the coach role, and `KS Bieg`.

Bartek cannot be attached to `KS Bieg` in this change. Celina, a second account, can create `Inny klub`. Anna cannot create a second team, and neither account sees a team list or a switcher.

### Key Discoveries:

- The gate is on protected pages. `/` and the auth pages stay public, which keeps the sign-in redirect at `/` (`src/pages/api/auth/signin.ts`).
- One row in `team_members` per `user_id` is the "one team per account" rule. A second account is a different `user_id`, so Celina's team is allowed.
- The creator is the only coach of that team. The athlete role exists on the membership so S-02 can insert it later; this change grants no insert for that role.

## What We're NOT Doing

- Invite codes, attaching Bartek, or any screen where an account chooses "I am an athlete".
- An insert policy or function path for `role = 'athlete'`, and a query that lists other members of the team (S-02 roster).
- A team switcher, a "my teams" list, or a global lock of one team in the whole database.
- Editing or deleting the team name, the display name, the membership, or the team after creation. A typo stands until a later change.
- Changing the signup form, the sign-in success redirect (`/`), or the login mechanism.
- Trainings, the calendar, photos, or the ranking.
- Seeding a real squad, or applying the migration to a hosted Supabase project. Local reset is the check. Production SQL stays a human step.

## Implementation Approach

One security-invoker Postgres function creates the team and the coach membership in a single transaction. The Astro API route calls it with the signed-in user's cookie client. Row-level security runs as that user. A security-definer function in `public` is the wrong tool: Supabase exposes `public`, and a definer function there bypasses RLS. Two separate inserts from the app can leave a team with no coach if the second insert fails.

The create-team page is an Astro form, same pattern as sign-out, because the page only posts two fields. Copy the visual shell from `src/pages/auth/signin.astro`. Keep the existing English chrome (`Dashboard`, `Sign out`).

Middleware keeps the anonymous redirect to `/auth/signin`. It adds a membership check: `/dashboard` without a membership redirects to `/team/new`; `/team/new` with a membership redirects to `/dashboard`. `POST /api/team` is not in that "must already have a team" bucket, or the create request would bounce forever.

## Critical Implementation Details

### RLS must not recurse

The `teams` select policy may look up `team_members` to see whether `auth.uid()` is a member. The `team_members` select policy must be only `user_id = auth.uid()`. If that policy also reads `teams`, Postgres recurses and the select fails closed. S-02 is what widens member visibility to the rest of the squad; this change does not.

### The function runs as the signed-in user

`create_coach_team` is `security invoker` with a fixed `search_path`. Both inserts must satisfy the insert policies below. Do not mark it `security definer`, and do not read the role from `user_metadata`.

### The current smoke step asserts the pre-team dashboard

`scripts/smoke.mjs` expects `GET /dashboard` to return 200 for an account that has only just signed in. That account has no membership, so the step becomes 302 to `/team/new`, and a later step creates the team before expecting 200.

## Phase 1: Team and coach membership in Postgres

### Overview

Add the team, the membership, the one-account and one-coach constraints, RLS, and the function Anna's screen will call. No UI in this phase.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_team_role_for_one_squad.sql` (from `npx supabase migration new team_role_for_one_squad`)

**Intent**: Give S-01 a way to know who the coach of a team is, and give S-02 a membership row to fill, without letting this change attach an athlete.

**Contract**:

- `public.teams`: `id uuid` primary key, `name text` not null, `created_by uuid` not null references `auth.users(id)` on delete cascade, `created_at timestamptz` not null default `now()`.
- `public.team_members`: `id uuid` primary key, `team_id uuid` not null references `public.teams(id)` on delete cascade, `user_id uuid` not null references `auth.users(id)` on delete cascade, `role text` not null, `display_name text` not null, `created_at timestamptz` not null default `now()`.
- `user_id` is unique (one membership per account).
- `role` is `coach` or `athlete`.
- Partial unique index on `team_id` where `role = 'coach'` (one coach per team).
- `name` and `display_name` are the trimmed value, length 1 through 80. A blank or whitespace-only value fails the check.
- RLS is enabled on both tables. `anon` has no policies. `authenticated` has select and insert only. No update and no delete policies.
- `teams` select: a `team_members` row exists for this team with `user_id = auth.uid()`.
- `teams` insert: `created_by = auth.uid()` and `auth.uid()` has no membership yet.
- `team_members` select: `user_id = auth.uid()` only.
- `team_members` insert: `user_id = auth.uid()`, `role = 'coach'`, `auth.uid()` has no membership yet, the team's `created_by` is `auth.uid()`, and that team has no coach yet.
- `public.create_coach_team(team_name text, display_name text) returns uuid`, `language plpgsql`, `security invoker`, `search_path` fixed to `public`. It requires `auth.uid()`, trims both arguments, rejects an existing membership, inserts the team and the coach row, and returns the team id. Execute is granted to `authenticated` and revoked from `public` and `anon`.

```sql
create function public.create_coach_team(team_name text, display_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
```

#### 2. Seed path the reset already expects

**File**: `supabase/seed.sql`

**Intent**: `supabase/config.toml` already loads `./seed.sql` on reset, and the file is missing. Reset has to be able to finish after the migration is applied.

**Contract**: The file exists and inserts nothing. It does not create a user, a team, or a membership.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies `supabase/migrations/*_team_role_for_one_squad.sql` and exits 0

#### Manual Verification:

- Two auth users can each create one team, and the same user cannot create a second
- A request without a signed-in user cannot read `teams` or `team_members`
- Inserting a membership with role `athlete` is rejected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Create-team gate and dashboard

### Overview

Anna, signed in and without a team, is sent to the create-team screen. After she submits, the dashboard shows her name, the coach role, and the team name. Signup and the sign-in redirect stay untouched.

### Changes Required:

#### 1. Membership gate

**File**: `src/middleware.ts`

**Intent**: A protected coach page is only reachable once this account is the coach of a team. The create screen is the opposite: it is for accounts that do not have one yet.

**Contract**: `PROTECTED_ROUTES` includes `/dashboard` and `/team/new`. Anonymous access to either still redirects to `/auth/signin`. A signed-in user with no membership who opens `/dashboard` redirects to `/team/new`. A signed-in user who already has a membership and opens `/team/new` redirects to `/dashboard`. Do not apply the "must have a team" redirect to `POST /api/team`.

#### 2. Create-team screen and action

**File**: `src/pages/team/new.astro`

**Intent**: Collect the two fields this change decided to ask for, on the first protected screen.

**Contract**: Astro form, `POST` to `/api/team`, fields `team_name` and `display_name`, both required. Show `Astro.url.searchParams.get("error")` the way `src/pages/auth/signin.astro` reads `error`. An account that already has a team never stays on this page (the middleware redirect).

**File**: `src/pages/api/team.ts`

**Intent**: Call the phase 1 function as the signed-in user and send Anna to the dashboard.

**Contract**: `POST` only. No session redirects to `/auth/signin`. An existing membership redirects to `/dashboard` and does not call the function. Otherwise call `create_coach_team` with `team_name` and `display_name`. Success redirects to `/dashboard`. A failed call (blank, whitespace, over 80 characters, or a second team) redirects to `/team/new?error=` with the message. Use `createClient` from `src/lib/supabase.ts`.

#### 3. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Show that the gate worked: this account is the coach of the team just created.

**Contract**: Load the signed-in user's own membership and that team's name. Render the display name, the word Coach, and the team name, and keep sign-out. This page is only served when the membership exists.

#### 4. Smoke and the local-database note

**File**: `scripts/smoke.mjs`

**Intent**: The fresh smoke account has no team, so the old "dashboard returns 200" step would fail for the right reason.

**Contract**: After the successful sign-in (still 302 to `/`), `GET /dashboard` expects 302 to `/team/new`. `GET /team/new` expects 200. `POST /api/team` with a non-empty `team_name` and `display_name` expects 302 to `/dashboard`. The following `GET /dashboard` expects 200. A second `POST /api/team` expects 302 to `/dashboard` and must not create a second team. Sign-out and the anonymous dashboard redirect stay as they are.

**File**: `README.md`

**Intent**: The sentence that says the app uses `auth.users` only becomes false once the migration exists.

**Contract**: Replace that sentence so a local setup knows `teams` and `team_members` exist and that `npx supabase db reset` (or `supabase start` on a fresh stack) applies them. Leave the email-and-password login description in place.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm run smoke` passes, including the redirect from `/dashboard` to `/team/new` and the create that then renders `/dashboard`

#### Manual Verification:

- A new account opens `/dashboard`, lands on the create-team form, submits a name and a team name, and the dashboard shows that name, Coach, and the team name
- An empty or too-long name stays on the form with an error, and an existing coach who opens `/team/new` returns to `/dashboard`
- A second coach account creates a different team, and the UI has no team list or switcher

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No unit runner is configured. Do not add one for this change. The database rules are checked by the phase 1 manual steps, and the HTTP path is checked by `scripts/smoke.mjs`.

### Integration Tests:

`npm run smoke` against a local server whose Supabase has the migration applied. That is the same shape CI uses (`.github/workflows/ci.yml`: `supabase start`, then `BASE_URL=http://localhost:4321 npm run smoke`).

### Manual Testing Steps:

1. Reset the local database so the migration and the empty seed have run.
2. Sign in as Anna, open `/dashboard`, submit `Anna` / `KS Bieg`, and confirm the dashboard shows those three facts. Confirm sign-in itself still landed on `/` before she opened the dashboard.
3. Submit a blank name and a name longer than 80 characters; both stay on `/team/new` with an error. Open `/team/new` again after success and confirm it returns to `/dashboard`.
4. Sign in as Celina and create `Inny klub`. Confirm Anna still has only `KS Bieg`, and that neither UI offers a switcher.
5. Confirm Bartek has no way to join `KS Bieg` from the UI.

## Performance Considerations

The gate is one lookup of `team_members` by `user_id`. That column is unique, so the lookup is a single index read on each protected request. One squad does not need a cache.

## Migration Notes

No domain rows exist today. Auth users who already signed up have no membership; the next time they open `/dashboard` they get `/team/new`.

The migration is forward-only. `npx wrangler rollback` does not undo it. Apply it locally for this change. Pushing it to a hosted Supabase project is a separate human step, same as the other production SQL in `context/foundation/infrastructure.md`.

Deleting an auth user cascades to their membership and, when they are `created_by`, to that team and its memberships.

## References

- Roadmap outcome: `context/foundation/roadmap.md` (F-01, change id `team-role-for-one-squad`)
- Access control: `context/foundation/prd.md` (Access Control; non-goal "Wiele zespołów")
- Issue: `context/foundation/tasks-github.md` (GitHub #1)
- Auth gate: `src/middleware.ts`
- Sign-in redirect: `src/pages/api/auth/signin.ts`
- Dashboard today: `src/pages/dashboard.astro`
- Smoke assertion to replace: `scripts/smoke.mjs`
- Migration rule: `AGENTS.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Team and coach membership in Postgres

#### Automated

- [x] 1.1 `npx supabase db reset` applies `supabase/migrations/*_team_role_for_one_squad.sql` and exits 0 — 0fb983f

#### Manual

- [x] 1.2 Two auth users can each create one team, and the same user cannot create a second — 559893b
- [x] 1.3 A request without a signed-in user cannot read `teams` or `team_members` — 559893b
- [x] 1.4 Inserting a membership with role `athlete` is rejected — 559893b

### Phase 2: Create-team gate and dashboard

#### Automated

- [x] 2.1 `npm run lint` passes — 559893b
- [x] 2.2 `npm run build` passes — 559893b
- [x] 2.3 `npm run smoke` passes, including the redirect from `/dashboard` to `/team/new` and the create that then renders `/dashboard` — 559893b

#### Manual

- [x] 2.4 A new account opens `/dashboard`, lands on the create-team form, submits a name and a team name, and the dashboard shows that name, Coach, and the team name — 559893b
- [x] 2.5 An empty or too-long name stays on the form with an error, and an existing coach who opens `/team/new` returns to `/dashboard` — 559893b
- [x] 2.6 A second coach account creates a different team, and the UI has no team list or switcher — 559893b
