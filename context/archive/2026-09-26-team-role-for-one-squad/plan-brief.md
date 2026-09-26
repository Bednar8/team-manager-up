# Team role for one squad — Plan Brief

> Full plan: `context/changes/team-role-for-one-squad/plan.md`

## What & Why

A signed-in account becomes the coach of one team, with a display name, before any training or athlete flow exists. S-01 and S-02 both need to know who the coach is. Join-by-code stays in S-02.

## Starting Point

Email-and-password login works. Middleware protects only `/dashboard`, and that page shows the email and nothing else. There are no tables beyond `auth.users`. Sign-in still returns to `/`. A brand-new smoke account is currently expected to see `/dashboard` with status 200.

## Desired End State

Anna signs in as today and lands on `/`. Opening `/dashboard` sends her to a form. She enters `Anna` and `KS Bieg`. The dashboard then shows that name, Coach, and `KS Bieg`. Celina can create `Inny klub` on her own account. Bartek is not on either team yet. Nobody gets a team switcher.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Who can be an athlete here | The role exists on the membership; nothing attaches Bartek | S-02 already owns join-by-code, and S-01 only needs to know the coach |
| Second coach | Celina gets `Inny klub`; one membership per account; no switcher | "One team" binds the account, so a later squad does not need a new schema |
| Coaches per team | The creator is the only coach | The outcome is the coach who creates that team, and no screen adds another |
| When the team is created | First protected screen; signup and the `/` redirect stay | Existing login stays unchanged, including accounts that already exist |
| Account with no team | `/dashboard` redirects to `/team/new` | A protected coach page means this account already has a team |
| What we call Anna | Required display name on that form, stored on her membership | Later roster and ranking need a person name; athletes enter theirs in S-02 |
| How the rows are written | One security-invoker function on the cookie client | The app only has the anon key, and the team plus the coach row must commit together |

## Scope

**In scope:**

- `teams` and `team_members`, with one membership per account and one coach per team
- `create_coach_team` for the signed-in user, under RLS
- `/team/new`, `POST /api/team`, the dashboard gate, and the dashboard summary
- Smoke coverage of that redirect and create, plus an empty `supabase/seed.sql` so local reset can finish

**Out of scope:**

- Invite codes, attaching an athlete, athlete insert policies, and listing other members
- Renaming or deleting a team or a display name after creation
- A team switcher, or a rule that the database may hold only one team
- Changes to signup, to the sign-in redirect, or to the login mechanism
- Trainings, photos, ranking, and pushing the migration to hosted Supabase

## Architecture / Approach

The signed-in user posts `team_name` and `display_name` to `/api/team`. That route calls `create_coach_team`, which inserts the team and the coach membership in one transaction. RLS runs as that user: they can read their own membership and their team, and they can insert a coach row only for a team they just created and only when they have no membership yet. Middleware sends `/dashboard` to `/team/new` until that row exists, and sends `/team/new` back to `/dashboard` once it does.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Team and coach membership in Postgres | Tables, constraints, RLS, and `create_coach_team` | A `team_members` policy that reads `teams` recurses and the select fails closed |
| 2. Create-team gate and dashboard | `/team/new`, the redirect, the dashboard summary, updated smoke | The old smoke step expects 200 on `/dashboard` before any team exists |

**Prerequisites:** Local Supabase and working email-and-password login (`README.md`). No earlier roadmap slice.
**Estimated effort:** About one or two sessions across two phases.

## Open Risks & Assumptions

- A typo in the team name or the display name cannot be fixed here. Update and delete are deferred.
- `supabase/config.toml` points at `./seed.sql`, which is missing today. Phase 1 adds an empty file so `npx supabase db reset` can finish. The seed creates no squad.
- Verification is local. Applying the migration on a hosted project is a human step and is outside this change.
- The 80-character cap on both names is the plan's limit so the check has a boundary. Names are stored trimmed.

## Success Criteria (Summary)

- Anna can create `KS Bieg`, see herself as Coach under that name, and cannot create a second team.
- Celina can create `Inny klub`. Bartek still cannot join.
- Sign-in still uses email and password and still lands on `/`.
