# Globalny ranking kilometrów — Plan Brief

> Full plan: `context/changes/km-ranking-publication/plan.md`

## What & Why

Trener i zawodnik dostają jeden ranking zespołu: sumę potwierdzonych kilometrów ze wszystkich treningów. Chodzi o motywację z łącznego dystansu, nie o osobną listę każdego dnia. Kilometry treningu wchodzą do tej sumy dopiero następnego dnia, żeby wynik z dnia zdjęcia nie przetasował miejsc, zanim dzień się skończy.

## Starting Point

Potwierdzone kilometry są już w `training_submissions.distance_km`. `/ranking` to pusty nagłówek w tym samym menu co kalendarz. Zawodnik nie może czytać zgłoszeń kolegów, a trener może czytać potwierdzone wiersze, łącznie ze ścieżką zdjęcia. Nic jeszcze tych kilometrów nie sumuje.

## Desired End State

Obie role otwierają `/ranking` i widzą obecnych zawodników: miejsce, imię, suma kilometrów. Trenera na liście nie ma. Zawodnik bez policzonych kilometrów ma 0 km i widzi wyraźniej własny wiersz.

Wieczorem 3 października Anna ma z wcześniejszych treningów 5 km, Bartek 8 km, a jej świeżo potwierdzone 10 km z tego dnia jeszcze nie wchodzą: Bartek miejsce 1 (8 km), Anna miejsce 2 (5 km). Rano 4 października Anna ma 15 km i miejsce 1, Bartek 8 km i miejsce 2. Przy remisie Anna 15 km, Bartek 15 km i Celina 10 km mają miejsca 1, 1 i 3.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Co jest rankingiem | Jedna suma potwierdzonych km ze wszystkich treningów zespołu | Notatka zmiany i FR-010/FR-011 mówią o rankingu globalnym, nie o liście jednego dnia | Change note, PRD |
| Kiedy kilometry wchodzą | `training_on` wcześniejsze niż dziś, Europa/Warszawa, liczone przy odczycie | Wybrana publikacja następnego dnia; przykład US-01 „od razu” nie obowiązuje | Plan, PRD FR-014 |
| Remis | To samo miejsce, następne przeskakuje; na liście alfabet polski | Równy wynik ma być widoczny jako remis | Plan |
| Kto jest wierszem | Obecni zawodnicy; brak sumy to 0 km; trener tylko ogląda | US-01 ustawia czterech zawodników, w tym osobę z 0 km | PRD |
| Skąd odczyt | Jedna funkcja `security definer`, bez szerszego `SELECT` na zgłoszenia | Inaczej zawodnik dostałby ścieżki zdjęć kolegów | Plan |

## Scope

**In scope:**

- Funkcja odczytu sumy, miejsc i zer dla zespołu wywołującego
- Strona `/ranking` dla trenera i zawodnika, z wyróżnieniem własnego wiersza

**Out of scope:**

- Czas i szybkość, ranking jednego treningu, rozbicie sumy na dni
- Kilometry z dzisiejszego treningu warszawskiego
- Trener na liście, osoby spoza aktualnego składu, zdjęcia na tej stronie
- Okno poprawki zdjęcia (S-06) i przeredagowanie US-01 w PRD

## Architecture / Approach

Strona woła `team_km_ranking()`. Funkcja składa obecnych zawodników zespołu, dokleja sumę potwierdzonych kilometrów z minionych dni i nadaje `rank()` tylko po tej sumie. Strona sortuje remisy alfabetycznie i nie liczy miejsc drugi raz.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Odczyt rankingu | Funkcja z sumą, zerem, datą warszawską i miejscem z przeskokiem | `rank()` z nazwiskiem w oknie zepsułby remis |
| 2. Strona rankingu | `/ranking` pokazuje ten odczyt obu rolom | Błąd odczytu narysowany jako pusta lista |

**Prerequisites:** potwierdzone `distance_km` z S-03; lokalny Supabase bez resetu bazy
**Estimated effort:** około 1–2 sesje w dwóch fazach

## Open Risks & Assumptions

- US-01 w PRD nadal opisuje ranking od razu po zgłoszeniach. Obowiązuje reguła następnego dnia z tego planu.
- S-06 nie jest zrobione. Odczyt bierze aktualne potwierdzone kilometry dni już opublikowanych.
- Kolejność remisu jest polskim sortowaniem na stronie, nie kolacją bazy.
- Nie ma runnera, który sam sprawdzi miejsca. Te przypadki są ręczne.
- Osoba, która zniknie ze składu, schodzi z rankingu razem z historią kilometrów. Osobnego odejścia ze składu dziś nie ma.

## Success Criteria (Summary)

- Wieczór potwierdzenia nie zmienia sumy; następny warszawski dzień już ją zmienia.
- Remis ma jedno miejsce, a kolejna osoba dostaje numer z przeskokiem; brak kilometrów to widoczne 0.
- Trener i zawodnik widzą tę samą listę, bez trenera na niej, a zawodnik odróżnia własny wiersz.
