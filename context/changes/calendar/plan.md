# Month calendar Implementation Plan

## Overview

Replace the `/calendar` placeholder with a large month grid that a signed-in coach or athlete can page and click. A click opens a popup for that day. The coach sees a placeholder for adding a training; the athlete sees a placeholder for uploading a training photo. This change stops at look and interaction.

## Current State Analysis

`/calendar` is already in the team shell, the sidebar, and `PROTECTED_ROUTES`. The page renders only the heading "Kalendarz". There is no month grid, no date library, and no trainings table. Dashboard and calendar both require a membership. The role is `coach` or `athlete` on `team_members`.

The product already decided that a logged-in person sees a calendar, including days without a training (FR-004, FR-005). Adding, editing, and deleting a training is a later change (`coach-upcoming-training`). Uploading a photo is later still.

## Desired End State

A signed-in member opens `/calendar` and sees the current local month: six weeks, Monday through Sunday, Polish labels, today marked, no popup. Previous and next move by one month. "Dziś" selects the viewer's local today.

Clicking 27 September 2026 sets the address to `/calendar?date=2026-09-27`, marks that day, and opens a popup titled "27 września 2026". A coach reads "Tutaj będzie dodanie treningu". An athlete reads "Tutaj będziesz wrzucał zdjęcie z treningu". The day cell shows only the number. Closing the popup, or pressing Escape, or clicking the backdrop, removes `date` and leaves the month with no popup. Refreshing a valid `date` opens that popup again. `/calendar`, `/calendar?date=`, and `/calendar?date=2026-02-31` all show the local current month, mark today, and show no popup.

While September 2026 is visible, the first cell is Monday 31 August 2026 and the last is Sunday 11 October 2026. Clicking 31 August switches the grid to August and opens that day's popup. Today stays recognizable when it is also the selected day. The same seven columns fit a phone without horizontal scrolling. Desktop uses the column beside the sidebar.

### Key Discoveries:

- `/calendar` is a centered title inside `TeamShell` (`src/pages/calendar.astro`). The nav link and active state already exist (`src/components/team/TeamNav.astro`).
- Anonymous visitors are redirected to `/auth/signin`. Smoke requires the response body to contain `Kalendarz` (`scripts/smoke.mjs`). The document title `Kalendarz · Team Manager` satisfies that (`src/layouts/Layout.astro`).
- Client interactivity is a React island with `client:load` and no `"use client"` (`src/pages/auth/signin.astro`).
- The mobile nav is a native `<dialog>` (`src/layouts/TeamShell.astro`). The day popup should follow that, not a new dialog library.
- Role is loaded per page from `team_members.role` (`src/pages/dashboard.astro`). `TeamShell` does not pass the role into the slot.
- There is no unit-test runner. Automated checks are `npm run lint`, `npm run build`, and `npm run smoke`.

## What We're NOT Doing

- Creating or editing a training, blocking past dates, or enforcing one training per day. That is `coach-upcoming-training`.
- Uploading a photo, showing a file picker, or reading an image.
- A training icon, a day description in the cell, or a summary under the grid.
- A second calendar on the dashboard.
- A month or year dropdown.
- A database migration or a date library.
- Different grids for coach and athlete.
- Changing ranking, dashboard, or team membership.

## Implementation Approach

Keep the page on `/calendar` and fill the content column. One React island owns the month, the selection, and the popup, because paging and clicking are client state. A small pure helper builds the 42-day Monday-first grid and accepts or rejects a `YYYY-MM-DD` string. The Astro page reads `team_members.role` the same way the dashboard does and passes `coach` or `athlete` into the island.

The address is the selection. A valid `date` query means that day is selected and the popup is open. Removing `date` closes the popup. "Dziś" and a click both set `date` to a civil date. The month on screen is the month of that date, or the viewer's local month when no valid date is present. Each new selection is a history entry, so Back returns to the previous address. If the member landed already on a `date` URL, Close drops the parameter and stays on `/calendar`.

Use the platform Polish locale and a native dialog. Do not add `date-fns`, `react-day-picker`, or a shadcn dialog.

## Critical Implementation Details

- **Timing & lifecycle** — "Today" is the browser's local civil date. The Worker clock is UTC, so a server render that calls `new Date()` can mark the wrong day between midnight and 02:00 in Poland. The server HTML and the first client render must not read the worker clock. Apply the local today only after the island mounts. A `date` value is a calendar day with no time-zone conversion: `2026-09-27` is 27 September 2026.

## Phase 1: Month grid

### Overview

Show a large, stable month on `/calendar` for both roles. Arrows and "Dziś" change the visible month. Day cells are not clickable yet, and no popup exists.

### Changes Required:

#### 1. Month rules

**File**: `src/components/calendar/month.ts`

**Intent**: Put the calendar arithmetic in one place so the island and the later click behavior share one definition of a valid day and a six-week grid.

**Contract**: A civil date is `YYYY-MM-DD` only when that day exists. `2026-02-31` and any other shape are rejected. Given a year and month, the grid is 42 civil dates starting on Monday. September 2026 therefore runs from 31 August 2026 through 11 October 2026. Weekday labels are `Pn Wt Śr Cz Pt So Nd` in the narrow layout and the full Polish names from `lg`. The month heading and the later popup title use `pl-PL` (`Wrzesień 2026`, `27 września 2026`).

#### 2. Month island

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Render the month the member pages through, with today marked, and leave click handling for the next phase.

**Contract**: Props are only the optional initial civil date from the query. The island is mounted with `client:load`. The grid is six rows and seven columns, stretches across the content column, and does not scroll horizontally. Each day cell shows the day number and nothing else. Days outside the visible month are muted. Today gets a mark that is not a selection fill. Previous and next move one month. "Dziś" shows the month that contains the local today and marks that day. It does not write `date` and does not open a popup. Cells are at least 44px tall. There is no popup and no training icon.

#### 3. Calendar page

**File**: `src/pages/calendar.astro`

**Intent**: Replace the centered title with the island so the existing route, nav, and auth gate stay as they are.

**Contract**: Keep `TeamShell` title `Kalendarz`, so the document title still contains that word for smoke. The main region fills the shell column (`flex-1`) with page padding, not the dashboard's `max-w-md` card. Pass a valid `date` query through as the initial civil date; omit it when the parameter is missing, empty, or invalid. Do not load the role in this phase.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm run smoke` passes, including the anonymous redirect from `/calendar` and a body that contains `Kalendarz`

#### Manual Verification:

- A signed-in coach and a signed-in athlete each see a six-week, Monday-first month filling the `/calendar` column, with a Polish month heading and no day descriptions or training icons
- Previous and next change the month; "Dziś" returns to the month of the viewer's local today and marks that day; the grid stays six weeks, including the August and October days around September 2026
- A narrow screen shows seven columns without horizontal scrolling and day cells at least 44px tall; a wide screen shows the same grid in the column beside the sidebar

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Day popup

### Overview

Make each day clickable. The address holds the selected day, and that day opens a role-specific placeholder popup.

### Changes Required:

#### 1. Role on the page

**File**: `src/pages/calendar.astro`

**Intent**: The popup copy depends on who is looking, and the shell does not provide that role to the page slot.

**Contract**: Load `team_members.role` for the signed-in user the same way `src/pages/dashboard.astro` does. Pass only `coach` or `athlete` into the island. Any other role throws, as the dashboard does. Keep passing the valid initial `date`.

#### 2. Selection and popup

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: A click selects a civil day, shows it in the address, and opens the placeholder the later training and photo actions will replace.

**Contract**: Clicking any cell, including a muted day from the adjacent month, sets `date` to that civil day, shows that day's month, marks the day as selected, and opens the popup. "Dziś" does the same for the viewer's local today. The popup title is the Polish date (`27 września 2026`). The body is exactly `Tutaj będzie dodanie treningu` for `coach` and exactly `Tutaj będziesz wrzucał zdjęcie z treningu` for `athlete`. The cell still shows only the number. Today keeps its own mark when it is selected. Close is a `Zamknij` button, Escape, and a click on the backdrop. Close removes `date`. A selection made on this page is a history entry, so Back returns to the previous address. When the member arrived already on a `date` URL, Close stays on `/calendar` with the parameter removed. A missing, empty, or invalid `date` shows the local current month, marks today, and shows no popup. Use a native dialog, opened after mount, and do not leave it nested inside the team-nav dialog. On close, return focus to the day button that opened it.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm run smoke` passes, including the anonymous redirect from `/calendar` and a body that contains `Kalendarz`

#### Manual Verification:

- Clicking a day in the visible month sets `?date=` to that civil day, highlights it, and opens a popup titled with the Polish date; a coach sees `Tutaj będzie dodanie treningu` and an athlete sees `Tutaj będziesz wrzucał zdjęcie z treningu`; the cell shows only the day number
- `Zamknij`, Escape, and the backdrop each remove `date` and leave the month with no popup; Back returns to the previous address; refreshing a valid `date` reopens that popup; `/calendar`, an empty `date`, and `date=2026-02-31` show the local current month, mark today, and show no popup
- Clicking the muted 31 August 2026 cell while September 2026 is showing switches to August and opens that popup; "Dziś" sets `date` to the viewer's local today and opens today's popup; today remains distinguishable when it is also selected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit runner is configured. The September 2026 grid (31 August through 11 October, Monday first) and the rejection of `2026-02-31` are checked by hand in the browser.

### Integration Tests:

- `npm run smoke` covers the anonymous redirect and the `Kalendarz` document title. It does not click a day.

### Manual Testing Steps:

1. Sign in as a coach, open `/calendar`, and confirm the local month, six weeks, Monday first, and a marked today with no popup.
2. Page to September 2026 and back with the arrows, then use "Dziś".
3. Narrow the window below the sidebar breakpoint and confirm seven columns, no horizontal scroll, and 44px cells.
4. Click 27 September 2026 and confirm `/calendar?date=2026-09-27`, the title `27 września 2026`, and `Tutaj będzie dodanie treningu`.
5. Close with each of `Zamknij`, Escape, and the backdrop. Refresh the dated URL and confirm the popup returns. Open `date=2026-02-31` and confirm no popup.
6. From September 2026, click 31 August 2026 and confirm the August grid and popup. Repeat the click as an athlete and confirm `Tutaj będziesz wrzucał zdjęcie z treningu`.

## Performance Considerations

The grid is 42 buttons. It does not need virtualization, caching, or a date library.

## Migration Notes

No schema change and no backfill. Existing accounts see the grid as soon as the page is deployed.

## References

- Change notes: `context/changes/calendar/change.md`
- Calendar kept, empty days visible: `context/foundation/prd.md` (FR-004, FR-005)
- Training actions are a different change: `context/foundation/roadmap.md` (`coach-upcoming-training`)
- Placeholder page: `src/pages/calendar.astro`
- Role load: `src/pages/dashboard.astro`
- Native dialog: `src/layouts/TeamShell.astro`
- Island pattern: `src/pages/auth/signin.astro`
- Smoke: `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Month grid

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` passes
- [x] 1.3 `npm run smoke` passes, including the anonymous redirect from `/calendar` and a body that contains `Kalendarz`

#### Manual

- [ ] 1.4 A signed-in coach and a signed-in athlete each see a six-week, Monday-first month filling the `/calendar` column, with a Polish month heading and no day descriptions or training icons
- [ ] 1.5 Previous and next change the month; "Dziś" returns to the month of the viewer's local today and marks that day; the grid stays six weeks, including the August and October days around September 2026
- [ ] 1.6 A narrow screen shows seven columns without horizontal scrolling and day cells at least 44px tall; a wide screen shows the same grid in the column beside the sidebar

### Phase 2: Day popup

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npm run build` passes
- [x] 2.3 `npm run smoke` passes, including the anonymous redirect from `/calendar` and a body that contains `Kalendarz`

#### Manual

- [ ] 2.4 Clicking a day in the visible month sets `?date=` to that civil day, highlights it, and opens a popup titled with the Polish date; a coach sees `Tutaj będzie dodanie treningu` and an athlete sees `Tutaj będziesz wrzucał zdjęcie z treningu`; the cell shows only the day number
- [ ] 2.5 `Zamknij`, Escape, and the backdrop each remove `date` and leave the month with no popup; Back returns to the previous address; refreshing a valid `date` reopens that popup; `/calendar`, an empty `date`, and `date=2026-02-31` show the local current month, mark today, and show no popup
- [ ] 2.6 Clicking the muted 31 August 2026 cell while September 2026 is showing switches to August and opens that popup; "Dziś" sets `date` to the viewer's local today and opens today's popup; today remains distinguishable when it is also selected
