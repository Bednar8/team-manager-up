# Athlete joins with code — Plan Brief

> Full plan: `context/changes/athlete-joins-with-code/plan.md`

## What & Why

An athlete joins the coach's one team with a code, and the coach can see who is on the squad. Later slices need that squad before they can show who missed a photo and who has 0 km.

## Starting Point

A signed-in account can create one team and become its only coach. The `athlete` role exists on `team_members` and nothing can insert it. Members can read only their own row. `/dashboard` without a team goes to `/team/new`, which only creates a team. The dashboard always says Coach. Sign-in still returns to `/`.

## Desired End State

Anna opens `/dashboard`, chooses Coach, and enters `Anna Kowalska` and `KS Bieg`. She sees that name, Coach, the team, a code, and herself on the squad list. Bartek chooses Athlete, enters `Bartek Nowak` and the code, and joins immediately. Both of them see both names. Bartek does not see the code. A second `Anna Kowalska` is a second row. After Anna confirms a new code, the old one stops working and Bartek stays.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| What the code is | One code per team; the coach can replace it after confirmation; members stay | Four athletes in US-01 can share one code, and a leak can be cut off |
| When a valid code joins | Immediately, in that submit | The squad is complete when the athlete submits; this slice does not remove members |
| Who sees the squad | Every member sees every display name, including the coach | The slice outcome is a squad list, and ranking later is what adds kilometres |
| Who sees the code | The coach only, including through the API | Athletes can share names without being able to keep issuing the code |
| No-team screen | `/dashboard` asks Coach or Athlete; sign-in still returns to `/` | The choice happens once they are signed in, and login stays as F-01 left it |
| A half-finished choice | Asked again; nothing is stored until create or join succeeds | A wrong tap does not stick, and a reload shows Coach and Athlete |
| The person field | One text field labeled Name and surname, stored in `display_name` | The same 1–80 name is what the squad list shows |
| Identical names | Allowed; telling them apart is later | Two real people can share a name, and this slice does not add another identifier |

## Scope

**In scope:**

- A join code created with the team, replaceable by the coach after confirmation
- `join_team_with_code` for an account with no team
- Squad select for members of that team
- The who-are-you step, the athlete form, the coach label Name and surname, the dashboard role, the list, and the coach's code
- Smoke coverage of a wrong code and a successful join

**Out of scope:**

- Removing a member, leaving, or renaming
- Coach approval, one-time codes, and showing the code to athletes
- Separate name columns or unique display names
- Signup, confirm-email, and the sign-in redirect
- Trainings, photos, and ranking

## Architecture / Approach

The code is in `team_join_codes`, not on `teams`, so an athlete's team select cannot return it. `create_coach_team` stays security invoker and writes the code through a security-definer helper in the same transaction. Join and replace are security-definer functions because the caller cannot see the code and there is no update grant. The squad policy uses a `private` helper so it does not recurse on `team_members`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Join code and athlete membership in Postgres | Code, join, replace, and squad read | A `team_members` policy that reads itself fails closed |
| 2. Who-are-you gate and join | Choice, coach create, athlete join | A role stored in the URL would survive the reload this plan forbids |
| 3. Dashboard roster and coach code | Role, list, coach code, confirmed replace, smoke | The athlete dashboard treats a hidden code as an error |

**Prerequisites:** F-01 is done. Local Supabase and email-and-password login work (`README.md`).
**Estimated effort:** About two or three sessions across three phases.

## Open Risks & Assumptions

- Someone who already joined with a leaked code stays until a later change can remove members.
- The 8-character alphabet is the only guess barrier. This slice adds no rate limit.
- Two identical name-and-surname rows stay indistinguishable.
- A failed submit returns to the choice, so the person picks Coach or Athlete again.
- Applying the migration on hosted Supabase is a human step outside this change.

## Success Criteria (Summary)

- Anna can create `KS Bieg`, see a code, and see Bartek on the squad after he joins with that code.
- Bartek sees the same names and Athlete, and he does not see the code.
- A wrong code joins nobody. A replaced code joins nobody new. People already on the team stay. Sign-in still lands on `/`.
