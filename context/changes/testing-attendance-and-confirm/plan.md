# Lista oddanych i zapis potwierdzenia — plan testów

## Overview

Faza 1 planu testów stawia pierwszy runner i udowadnia dwa ryzyka: trener widzi „Oddał” tylko przy potwierdzonym zgłoszeniu, a zapis po potwierdzeniu ma kilometry zatwierdzone przez zawodnika. Suite odpala się przeciwko już działającemu `npm run dev` i lokalnemu Supabase. Nie startuje ich i nie kasuje istniejących wierszy.

## Current State Analysis

W repozytorium nie ma Vitest, Jest ani Playwright. `package.json` nie ma skryptu `test`. CI puszcza lint, `astro check`, build i `scripts/smoke.mjs` przeciwko lokalnemu Supabase oraz `astro preview`. Bramka CI dla tych testów jest fazą 4 w `context/foundation/test-plan.md` i zostaje poza tą zmianą.

Lista trenera jest na `/calendar`. `calendar.astro` ładuje zawodników z `team_members` (`role = athlete`) i zgłoszenia z `training_submissions`, w których `confirmed_at` nie jest puste. Wyspa `MonthCalendar` (`client:load`) składa wiersze w `rowsForTrainingDay`. „Oddał” oznacza, że `user_id` jest w tym zbiorze dla wybranego dnia. Samo wgranie, przy pustym `confirmed_at`, zostaje „Nie oddał”, bo polityka `training_submissions_select_coach` takiego wiersza trenerowi nie oddaje.

„Dziś” listy to data cywilna `Europe/Warsaw` liczona w `calendar.astro`. Lista jest widoczna, gdy rola to `coach`, dzień ma trening i wybrany dzień jest wcześniejszy albo równy tej dacie. `?date=` ustawia wybrany dzień już w HTML. Na serwerze `useSyncExternalStore` zwraca `null`, więc `coachCanWrite` jest fałszywe, a lista i tak renderuje się w gałęzi tylko do odczytu (`!coachCanWrite && selectedHasTraining && !athleteCanUpload`). `GET /calendar?date=` zawiera więc „Oddał” i „Nie oddał” bez przeglądarki.

Zapis kilometrów idzie ścieżką `POST /api/trainings/photo/begin`, wgranie na podpisany URL, `record_training_readout` (tylko `service_role`) i `POST /api/trainings/photo/confirm`. `begin` zwraca 503, gdy w procesie dev brakuje niepustego `OPENROUTER_API_KEY`, choć test modelu nie woła. `create_training` i `confirm_training_photo` odrzucają dzień wcześniejszy niż dziś w Warszawie, więc dzień miniony da się wstawić tylko kluczem service role.

## Desired End State

`npm test` uruchamia Vitest w Node i rozmawia z `BASE_URL` (domyślnie `http://localhost:4321`). Każdy test zakłada własny zespół: trener i trzech zawodników o imionach `Potwierdza ${runId}`, `Wgrywa ${runId}`, `Milczy ${runId}`. Żadne imię nie jest podciągiem innego.

Dla treningu na dziś w Warszawie strona trenera wiąże `Potwierdza ${runId}` z „Oddał”, a `Wgrywa ${runId}` i `Milczy ${runId}` z „Nie oddał”. Wiersz `Potwierdza ${runId}` ma `distance_km` równe 7, `model_distance_km` równe 6.5, `athlete_edited` prawdziwe, `confirmed_at` ustawione i `training_on` równe temu dniu. Wiersz `Wgrywa ${runId}` ma `confirmed_at` puste.

Dla poprzedniego dnia cywilnego w Warszawie ta sama strona pokazuje opis wstawionego treningu, „Oddał” przy `Potwierdza ${runId}` i „Nie oddał” przy pozostałych dwóch. Istniejące zespoły zostają. Nowy zespół też zostaje.

### Key Discoveries:

- Status listy jest bramką `confirmed_at`, nie faktem wgrania: `src/pages/calendar.astro` (ładowanie zgłoszeń) i `training_submissions_select_coach` w `supabase/migrations/20261002224800_coach_sees_submissions.sql`.
- HTML z `GET` wystarcza, bo gałąź tylko do odczytu renderuje `SquadDayList` przy fałszywym `coachCanWrite` na serwerze (`src/components/calendar/MonthCalendar.tsx`).
- `record_training_readout` jest nadane wyłącznie `service_role` (`supabase/migrations/20261001171356_training_photo.sql`). Trasa `readout` woła model i w tej fazie nie występuje.
- `create_training` rzuca „Trening można dodać, zmienić albo usunąć tylko na dziś lub później.” dla daty wcześniejszej (`supabase/migrations/20260928200436_coach_trainings.sql`).
- Ciasteczka i formularze logowania są już opisane w `scripts/smoke.mjs`. Kod zespołu jest w `data-team-code` na tablicy trenera.
- Reguła lokalnej bazy: test dopisuje brakujący wiersz i nie woła `supabase db reset`, `TRUNCATE` ani `DELETE`.

## What We're NOT Doing

- Bramka CI, build preview i start albo stop Supabase z poziomu testu. To faza 4 planu testów.
- Ranking, odrzucenie zgłoszenia poza regułami i reguły daty treningu jako osobne scenariusze. To faza 2 planu testów. Strażnik daty jest tu tylko powodem, dla którego dzień miniony jest wstawiany.
- Cudzy dostęp do zdjęcia i zgłoszenia. To faza 3 planu testów.
- Osoba spoza aktualnego składu.
- Jakość OCR, żywy model i trasa `POST /api/trainings/photo/readout`.
- E2e, Playwright i snapshot wyglądu.
- Test jednostkowy `rowsForTrainingDay`. Wyrocznią jest HTML strony.
- `getViteConfig` i import modułów Astro. Testy nie wchodzą w `astro:env/server`.
- Czyszczenie lokalnej bazy i dopisywanie danych domenowych do `supabase/seed.sql`.
- Ręczna edycja kolumny Status w §3 `context/foundation/test-plan.md`. Odświeża ją `/10x-test-plan --refresh`.

## Implementation Approach

Vitest w środowisku Node woła aplikację po HTTP, tym samym stylem ciasteczek co `scripts/smoke.mjs`. Wyrocznia listy to `GET /calendar?date=` jako trener: status jest czytany w tym samym `<li>` co pełne imię. Wyrocznia zapisu to odczyt wiersza kluczem service role, porównanie liczbowe 7 i 6.5, nie status HTTP potwierdzenia.

Sztuczny odczyt to `record_training_readout` po `begin` i wgraniu pliku. Potwierdzenie wysyła 7 km oraz `null` dla czasu i prędkości, te same nulle poszły w odczycie, więc `athlete_edited` wynika wyłącznie z różnicy 7 wobec 6.5. Dzień miniony powstaje insertem service role, bo RPC produktu go odrzuca, a odczyt i tak idzie przez stronę trenera.

## Critical Implementation Details

**HTML z serwera jest wyrocznią listy.** `useSyncExternalStore` ma na serwerze snapshot `null`, więc `coachCanWrite` w odpowiedzi `GET` jest fałszywe. Lista i tak jest w gałęzi tylko do odczytu, gdy dzień ma trening i `selected <= warsawToday`. Test nie uruchamia przeglądarki. Status ma być w tym samym `<li>` co pełne imię. Samo wystąpienie słowa „Oddał” na stronie przechodzi, gdy oddała jedna osoba.

**Data i sztuczny odczyt.** Dziś w Warszawie licz tak jak `calendar.astro`. Dzień miniony to poprzedni dzień cywilny, nie odjęcie 24 godzin od parsowania UTC. `begin` zwraca 503, dopóki proces dev nie ma niepustego `OPENROUTER_API_KEY`. Test nie woła `POST /api/trainings/photo/readout`. Po `begin` i wgraniu woła `record_training_readout` jako service role z 6.5 km oraz pustym czasem i prędkością, potem `confirm` z 7 km i tymi samymi nullami. Kolumny liczbowe porównuje jako liczby. `athlete_edited` jest prawdziwe, bo 7 jest różne od 6.5.

**Kształt wgrania.** Podpisany URL idzie tak jak `uploadTrainingPhoto`: `PUT` z `FormData`, pole `cacheControl` równe `3600` i plik pod pustą nazwą pola.

## Phase 1: Runner i fixture

### Overview

Vitest wstaje, wspólny klient HTTP zakłada zespół i czytelnie przerywa pracę, gdy dev server albo service role nie są dostępne. Ta faza nie dotyka zdjęć ani listy oddanych.

### Changes Required:

#### 1. Runner

**File**: `package.json`, `vitest.config.ts`

**Intent**: Dodać skrypt `test`, który uruchamia Vitest raz i kończy proces. Konfiguracja trzyma testy w Node, poza bundlem Astro.

**Contract**: Skrypt `test` to `vitest run`. Konfiguracja obejmuje `tests/**/*.test.ts`, środowisko `node`, bez pluginu Astro i bez `getViteConfig`. DevDependency to `vitest`.

#### 2. Klient HTTP i fixture zespołu

**File**: `tests/support.ts`, `tests/harness.test.ts`

**Intent**: Jeden moduł zakłada trenera i trzech zawodników oraz trzyma sesje w słoiku ciasteczek, na wzór `scripts/smoke.mjs`. Test harnessu sprawdza, że trener wchodzi na kalendarz.

**Contract**: `BASE_URL` domyślnie `http://localhost:4321`. `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE` są czytane z procesu, potem z `.env`, potem z `.dev.vars`, bez nadpisywania wartości już ustawionej i bez wypisywania sekretów. Brak któregoś klucza przerywa test przed signupem. Brak połączenia z `BASE_URL` przerywa test przed signupem i podaje ten adres w błędzie. Sprawdzenie service role to `select id from teams limit 1`.

Rejestracja i logowanie idą formularzem na `/api/auth/signup` i `/api/auth/signin`, tak jak smoke. Trener woła `POST /api/team`, kod czyta z `data-team-code` na `/dashboard`, zawodnicy wchodzą przez `POST /api/team/join`. Imiona to dokładnie `Potwierdza ${runId}`, `Wgrywa ${runId}` i `Milczy ${runId}`. `runId` jest unikalny w przebiegu. Lookup service role szuka `team_members.display_name` równym temu ciągowi. Test nie wywołuje `DELETE`, `TRUNCATE` ani `supabase db reset`.

Dziś warszawskie, na później:

```ts
new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
```

### Success Criteria:

#### Automated Verification:

- `npm test` against the running dev server signs up a coach and three athletes on a new team
- Coach GET `/calendar` returns 200 and the body includes `Kalendarz`
- `npm run lint` passes

#### Manual Verification:

- A closed `BASE_URL` fails before signup and names the unreachable dev server
- Teams that already existed locally are still present after the run

**Implementation Note**: Po zielonym `npm test` i `npm run lint` zatrzymaj się na ręczne sprawdzenie dwóch punktów powyżej, zanim ruszysz fazę 2.

---

## Phase 2: Lista z dziś i zapisane kilometry

### Overview

Trening na dziś powstaje przez aplikację. Jeden zawodnik potwierdza 7 km po sztucznym odczycie 6.5. Drugi tylko wgrywa. Trzeci nie zaczyna. Strona trenera i wiersz w bazie mają się zgadzać z tym podziałem.

### Changes Required:

#### 1. Ścieżka zdjęcia w fixture

**File**: `tests/support.ts`

**Intent**: Dopisać do wspólnego modułu kroki, których faza 1 nie potrzebowała: trening na dziś, `begin`, wgranie, sztuczny odczyt, potwierdzenie i odczyt wiersza.

**Contract**: Trener wysyła formularz `POST /api/trainings/create` z `training_on` równym dziś warszawskiemu i opisem od 1 do 200 znaków. Odpowiedź to przekierowanie na `/calendar?date=` tego dnia.

`begin` to `POST /api/trainings/photo/begin` z JSON `{ training_on }` i ciasteczkami zawodnika. Odpowiedź 200 niesie `signedUrl`. Odpowiedź 503 z tekstem „Odczyt zdjęcia nie jest skonfigurowany.” jest błędem warunku wstępnego (brak `OPENROUTER_API_KEY` w procesie dev), nie błędem produktu.

Wgranie to `PUT` na `signedUrl`:

```ts
const body = new FormData();
body.append("cacheControl", "3600");
body.append("", file);
```

`record_training_readout` woła klient service role argumentami `user_id` tego zawodnika, `training_on` dziś, `distance_km` 6.5, `duration_seconds` null, `max_speed_kmh` null. `user_id` pochodzi z `team_members` po dokładnym imieniu. Wołanie następuje po `begin`, bo bez wiersza funkcja rzuca „Tego dnia nie ma zdjęcia.”

`confirm` to `POST /api/trainings/photo/confirm` z JSON `{ training_on, distance_km: 7, duration_seconds: null, max_speed_kmh: null }`. Odczyt wiersza idzie service role po `user_id` i treningu tego dnia. Porównanie `distance_km` i `model_distance_km` jest liczbowe.

#### 2. Test dnia dzisiejszego

**File**: `tests/attendance-today.test.ts`

**Intent**: Udowodnić listę trenera i zapis zatwierdzonych kilometrów na jednym przebiegu dnia dzisiejszego.

**Contract**: `Potwierdza ${runId}` przechodzi `begin`, wgranie, `record_training_readout` (6.5) i `confirm` (7). `Wgrywa ${runId}` przechodzi tylko `begin` i wgranie. `Milczy ${runId}` nie woła tras zdjęcia. Żadne żądanie nie idzie na `/api/trainings/photo/readout`.

`GET /calendar?date=` dziś, ciasteczka trenera, status 200. W `<li>` zawierającym pełne imię: „Oddał” dla `Potwierdza ${runId}`, „Nie oddał” dla `Wgrywa ${runId}` i dla `Milczy ${runId}`.

Wiersz `Potwierdza ${runId}`: `distance_km` numerycznie 7, `model_distance_km` numerycznie 6.5, `athlete_edited` true, `confirmed_at` niepuste, trening ma `training_on` równe dziś warszawskiemu. Wiersz `Wgrywa ${runId}` dla tego treningu ma `confirmed_at` puste.

### Success Criteria:

#### Automated Verification:

- Coach page for Warsaw today binds the confirming athlete to `Oddał`, and the uploaded-only and silent athletes to `Nie oddał`
- The confirming athlete's row stores distance 7, model distance 6.5, `athlete_edited` true, `confirmed_at` set, on today's training
- The uploaded-only athlete's row has `confirmed_at` null

#### Manual Verification:

- In the browser, that coach's today dialog shows the same three statuses
- The dev server log for this run has no request to `/api/trainings/photo/readout`

**Implementation Note**: Po zielonym teście dnia dzisiejszego sprawdź ręcznie dialog i log dev servera, zanim ruszysz fazę 3.

---

## Phase 3: Lista dnia minionego

### Overview

Dzień wcześniejszy niż dziś w Warszawie nie przejdzie przez `create_training` ani `confirm_training_photo`. Wiersze wstawia service role, a wyrocznia zostaje ta sama strona trenera.

### Changes Required:

#### 1. Wstawienie dnia minionego

**File**: `tests/support.ts`, `tests/attendance-past.test.ts`

**Intent**: Dodać odczyt listy dla poprzedniego dnia cywilnego, bez drugiej ścieżki potwierdzenia.

**Contract**: Dzień to wczoraj względem dziś warszawskiego, liczone jako data cywilna. Service role wstawia `trainings` z `id`, `team_id` zespołu tego przebiegu, tym `training_on` i opisem `Bieg wsteczny` (1–200 znaków po trim). Potem wstawia `training_submissions` dla `Potwierdza ${runId}`: `training_id`, `user_id`, niepusty `storage_path`, `distance_km` większe od zera, `confirmed_at` ustawione, `submitter_display_name` równe imieniu. Obiektu w buckecie nie ma. Pozostali dwaj zawodnicy nie dostają wiersza.

`GET /calendar?date=` tego dnia, ciasteczka trenera. Treść zawiera `Bieg wsteczny`. `<li>` z pełnym imieniem wiąże `Potwierdza ${runId}` z „Oddał” oraz `Wgrywa ${runId}` i `Milczy ${runId}` z „Nie oddał”. Test nie woła `confirm_training_photo` dla tej daty.

#### 2. Notatka w planie testów

**File**: `context/foundation/test-plan.md`

**Intent**: Po tym, jak wzorzec realnie wylądował, dopisać go do cookbooka, żeby następna faza nie wymyślała runnera od nowa.

**Contract**: Uzupełnić §6.2 i §6.4 opisem tego przebiegu: Vitest, HTTP do działającego dev servera, sztuczny odczyt przez `record_training_readout`, wyrocznia listy w `<li>`, wyrocznia kilometrów w wierszu. §6.6 dostaje 2–3 linie, jeśli implementacja zaskoczyła czymś spoza tego planu. Kolumna Status w §3 zostaje bez zmian.

### Success Criteria:

#### Automated Verification:

- Coach page for the previous Warsaw civil day shows the seeded description and binds the seeded athlete to `Oddał` and the other two athletes to `Nie oddał`

#### Manual Verification:

- In the browser, that past day shows the same statuses and has no training edit form

**Implementation Note**: Po zielonym teście dnia minionego otwórz ten dzień w przeglądarce jako trener z przebiegu. Zdjęcia z tego dnia nie otwieraj: w buckecie nie ma obiektu.

---

## Testing Strategy

### Unit Tests:

Czysta reguła tańsza niż odczyt strony nie wyszła w researchu. `rowsForTrainingDay` nie dostaje osobnego testu. Helper daty warszawskiej żyje w `tests/support.ts` i jest sprawdzany przez oba odczyty strony.

### Integration Tests:

- Dziś: trzech zawodników, jeden potwierdzony z kilometrami 7 wobec odczytu 6.5, jeden wgrany bez potwierdzenia, jeden bez zgłoszenia. Lista trenera i wiersz w bazie.
- Dzień miniony: wstawiony trening `Bieg wsteczny` i jedno potwierdzone zgłoszenie. Lista trenera.

### Manual Testing Steps:

1. `npm run dev` działa na `http://localhost:4321`, lokalny Supabase działa, a w env dev są `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE` i niepusty `OPENROUTER_API_KEY`.
2. `npm test`, potem zalogować się jako trener z ostatniego przebiegu i otworzyć dziś oraz wczoraj. Statusy zgadzają się z imionami.
3. W logu dev servera z tego przebiegu nie ma `POST /api/trainings/photo/readout`.
4. Zespół, który był w bazie przed testem, nadal jest.

## Performance Considerations

Przebieg to kilka żądań HTTP i jeden insert service role na nowy zespół. Równoległość plików Vitest jest dopuszczalna, bo każdy przebieg ma własny `runId`. Nie dokładamy cache ani osobnego budżetu czasu.

## Migration Notes

Brak migracji schematu. Testy dopisują użytkowników, zespół, trening i zgłoszenia, i zostawiają te wiersze. `supabase/seed.sql` zostaje puste. Istniejących wierszy test nie aktualizuje i nie usuwa.

## References

- Plan testów, faza 1, ryzyka #1 i #2: `context/foundation/test-plan.md`
- Ciasteczka i signup: `scripts/smoke.mjs`
- Dziś warszawskie i ładowanie listy: `src/pages/calendar.astro`
- Składanie wierszy i gałąź tylko do odczytu: `src/components/calendar/MonthCalendar.tsx`
- `begin`, wgranie, `confirm`: `src/pages/api/trainings/photo/begin.ts`, `src/pages/api/trainings/photo/confirm.ts`, `uploadTrainingPhoto` w `MonthCalendar.tsx`
- `record_training_readout` tylko dla service role: `supabase/migrations/20261001171356_training_photo.sql`
- Odrzucenie treningu wstecz: `supabase/migrations/20260928200436_coach_trainings.sql`
- Reguła lokalnej bazy: `AGENTS.md`, `.cursor/rules/local-db-values.mdc`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner i fixture

#### Automated

- [x] 1.1 `npm test` against the running dev server signs up a coach and three athletes on a new team
- [x] 1.2 Coach GET `/calendar` returns 200 and the body includes `Kalendarz`
- [x] 1.3 `npm run lint` passes

#### Manual

- [ ] 1.4 A closed `BASE_URL` fails before signup and names the unreachable dev server
- [ ] 1.5 Teams that already existed locally are still present after the run

### Phase 2: Lista z dziś i zapisane kilometry

#### Automated

- [x] 2.1 Coach page for Warsaw today binds the confirming athlete to `Oddał`, and the uploaded-only and silent athletes to `Nie oddał`
- [x] 2.2 The confirming athlete's row stores distance 7, model distance 6.5, `athlete_edited` true, `confirmed_at` set, on today's training
- [x] 2.3 The uploaded-only athlete's row has `confirmed_at` null

#### Manual

- [ ] 2.4 In the browser, that coach's today dialog shows the same three statuses
- [ ] 2.5 The dev server log for this run has no request to `/api/trainings/photo/readout`

### Phase 3: Lista dnia minionego

#### Automated

- [ ] 3.1 Coach page for the previous Warsaw civil day shows the seeded description and binds the seeded athlete to `Oddał` and the other two athletes to `Nie oddał`

#### Manual

- [ ] 3.2 In the browser, that past day shows the same statuses and has no training edit form
