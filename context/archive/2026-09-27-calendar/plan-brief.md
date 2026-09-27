# Month calendar — Plan Brief

> Full plan: `context/changes/calendar/plan.md`

## What & Why

Signed-in members need a large month they can page and click, on a phone and on a desktop. A click opens a placeholder popup: the coach will later add a training there, and the athlete will later upload a photo. This change is only the grid and that click.

## Starting Point

`/calendar` is already in the team nav and behind login, and it renders the heading "Kalendarz". There is no grid, no date library, and no trainings table. Coach and athlete are already stored on the membership.

## Desired End State

Opening `/calendar` shows the current local month, six Monday-first weeks, with today marked and no popup. Clicking a day puts that civil date in the address and opens a popup titled with the Polish date. The coach reads "Tutaj będzie dodanie treningu". The athlete reads "Tutaj będziesz wrzucał zdjęcie z treningu". Closing removes the date. The same seven columns fit a phone without sideways scrolling.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Placement | The whole `/calendar` column | The route, nav, and auth gate already exist, and the dashboard stays the squad list. |
| Click | Popup for the selected day | The click has to leave a place for the later training and photo actions. |
| Coach copy | `Tutaj będzie dodanie treningu` | Placeholder only; this change does not add a training. |
| Athlete copy | `Tutaj będziesz wrzucał zdjęcie z treningu` | Placeholder only; this change does not upload a photo. |
| Cell contents | Day number only | Descriptions and a training icon come later. |
| Weeks | Always six, starting Monday | The height stays still while paging, and the product locale starts the week on Monday. |
| Adjacent day | Switch to that month and select it | A visible day on the edge is clickable. |
| Address | `?date=YYYY-MM-DD` opens the popup | Refresh and Back can restore the day the popup is showing. |
| Empty or invalid date | Local current month, today marked, no popup | A popup appears only after a real day is selected. Example: `date=2026-02-31`. |
| Close | `Zamknij`, Escape, or backdrop removes `date` | Refresh then stays closed. |
| Month controls | Previous, next, and "Dziś" | "Dziś" selects the viewer's local today and opens that popup. |
| Phone | Same seven columns, no horizontal scroll | The month stays a calendar, with cells at least 44px tall. |

## Scope

**In scope:**

- Month grid on `/calendar` for coach and athlete
- Polish month and weekday labels, Monday first, six weeks
- Today mark, selection mark, previous, next, and "Dziś"
- Role-specific placeholder popup driven by `?date=`

**Out of scope:**

- Adding, editing, or deleting a training
- Photo upload
- Training icons or day descriptions
- A calendar on the dashboard
- A month/year dropdown, a migration, or a date library

## Architecture / Approach

`calendar.astro` keeps the team shell and passes the membership role into one React island. A pure helper builds the 42-day grid and checks civil dates. The island updates the address and opens a native dialog. Local today is applied after mount so the Worker UTC clock cannot mark the wrong day.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Month grid | Pageable six-week month, today marked, no popup | Server render using UTC instead of the viewer's local today |
| 2. Day popup | Click, `?date=`, and the role placeholder | History and close disagreeing about when the popup is open |

**Prerequisites:** A signed-in coach or athlete membership. `/calendar` is already protected.
**Estimated effort:** About 1–2 sessions across 2 phases.

## Open Risks & Assumptions

- The popup title is the Polish date (`27 września 2026`) so the placeholder says which day was clicked. The body text stays the two sentences above.
- `coach-upcoming-training` will replace the placeholder with real actions. This plan does not reserve an icon in the cell.
- The day dialog and the mobile nav dialog stay separate.

## Success Criteria (Summary)

- Coach and athlete can page a large Monday-first month on `/calendar` on a phone and on a desktop.
- A click opens the role placeholder for that day, and the address keeps the day.
- Closing, an invalid date, and a bare `/calendar` leave the month visible with no popup.
