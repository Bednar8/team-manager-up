# Ranking, odrzucenie zgłoszenia i data treningu — Plan Brief

> Full plan: `context/changes/testing-ranking-submission-and-dates/plan.md`
> Research: `context/changes/testing-ranking-submission-and-dates/research.md`

## What & Why

Faza 2 planu testów ma złapać zły ranking, zgłoszenie poza regułami i złą datę treningu, zanim wejdą na produkcję. Wyrocznią jest HTTP do lokalnej aplikacji, nie wygląd kalendarza i nie kopia funkcji liczącej.

## Starting Point

Runner, fixture trzech zawodników i lista oddanych już stoją. Ranking na stronie jest czytany tylko jako przypomnienie o treningu. Reguły odrzucenia zgłoszenia i daty nie mają testu. Sprzątanie własnych zasobów jest kontraktem z zamkniętej zmiany ochrony danych.

## Desired End State

`npm test` pokazuje wspólne miejsce `1` i `5 km` dla dwóch potwierdzonych zawodników, miejsce `3` i `0 km` dla milczącego, oraz brak trenera. Przyszłe `100` km i niepotwierdzone `6,5` nie wchodzą do sumy. Puste kilometry, dzień bez treningu i drugie zdjęcie po potwierdzeniu zostawiają trzy różne ślady w danych. Data wsteczna, duplikat dnia i usunięcie wczoraj zostają odrzucone. Cookbook mówi wprost, że usunięcia dziś ze zgłoszeniami test nie oczekuje.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Usunięcie dziś ze zgłoszeniami | Poza asercją | Kod kasuje kaskadą, FR-002 każe odmówić; test nie utrwala luki i nie zostaje czerwony | Plan |
| Remis | Wspólne miejsce i polska kolejność | PRD remisu nie definiuje; kod i archiwum rankingu już tak robią | Research |
| Warstwa | Vitest HTTP, bez przeglądarki | Bramki są w funkcjach SQL za trasami, a HTML `<li>` wystarcza jako odczyt | Research |
| Data rankingu | Warszawski dzień w chwili odczytu | Funkcja nie przyjmuje daty; obcięcie „następnego dnia” jest starym ciałem | Research |
| Puste kilometry | Zostaje niepotwierdzony wiersz | To nie jest „drugie oddanie” ani potwierdzone 0 km | Research |
| Dzień bez treningu | Nic nie wstawia | Osobny skutek od pustych kilometrów | Research |
| Drugie zdjęcie po potwierdzeniu | Jeden wiersz zostaje | Drugie `begin` nie dokłada wiersza | Research |

## Scope

**In scope:** odczyt rankingu z remisem i wykluczeniami; trzy odrzucenia zgłoszenia; utworzenie wstecz, duplikat dnia, usunięcie wczoraj; cookbook §6.4 i §6.5.

**Out of scope:** poprawka FR-002, asercja kaskady dziś, S-06, cudzy dostęp, bramka CI, żywy model, Playwright, nowa migracja.

## Architecture / Approach

Test zakłada własny zespół, pisze przez te same trasy co aplikacja i czyta albo HTML rankingu, albo wiersz service role. Dzień, którego produkt nie przyjmie, wstawia service role. Sprzątanie idzie rejestrem przebiegu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Odczyt rankingu | Miejsca, 5 km, 0 km, brak trenera, bez przyszłości i bez niepotwierdzonego odczytu | Wyrocznia skopiowana z funkcji albo stary próg następnego dnia |
| 2. Odrzucenie zgłoszenia | Trzy różne skutki pustych kilometrów, braku treningu i drugiego begin | Jeden szczęśliwy upload zamiast odrzucenia |
| 3. Data treningu | Wstecz, duplikat i usunięcie wczoraj | Asercja luki FR-002 jako sukces albo porażka |
| 4. Cookbook | §6.4 i §6.5 zgodne z tymi wyroczniami | Następny test wraca do remisu „z PRD” |

**Prerequisites:** lokalny Supabase, `npm run dev` z niepustym `OPENROUTER_API_KEY`, zielona faza 1 testów.
**Estimated effort:** jedna sesja implementacji na cztery fazy, bez zmiany schematu.

## Open Risks & Assumptions

- Lokalna baza musi mieć ciało `team_km_ranking()` z progiem `<=`, nie starsze `<`. Research czytał migracje w repozytorium, nie `pg_proc`.
- Drugie `begin` i niepotwierdzony odczyt padną na 503, gdy w procesie dev brakuje klucza odczytu. To nie jest wynik testu reguły.

## Success Criteria (Summary)

- Ranking na stronie zgadza się z literalnymi kilometrami, w tym ze wspólnym miejscem 1 i miejscem 3.
- Odrzucenie zgłoszenia i daty widać w statusie oraz w tym, co zostało w wierszach.
- Cookbook nie każe oczekiwać odrzucenia usunięcia dziś ze zgłoszeniami.
