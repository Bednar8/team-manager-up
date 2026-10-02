# Trener widzi zgłoszenia — plan implementacji

## Overview

Trener otwiera trening z dziś albo z dnia minionego i widzi, kto potwierdził zdjęcie, a kto nie. Przy osobie, która oddała, otwiera zdjęcie i — gdy zawodnik poprawił odczyt — napis „Poprawił odczyt.” Kilometry, czas i prędkość zostają przy rankingu.

## Current State Analysis

Kalendarz na `/calendar` ładuje wszystkie treningi zespołu. Wybór dnia dopisuje `?date=` przez `history.pushState`, bez przeładowania strony (`src/components/calendar/MonthCalendar.tsx`). Trener przy dzisiejszym i przyszłym treningu edytuje opis. Dzień miniony z treningiem pokazuje opis i Zamknij. Ta sama gałąź obsługuje zawodnika poza dniem wgrywania.

Zgłoszenie jest w `training_submissions`: jedno na zawodnika i trening, zdjęcie w prywatnym buckecie `training-photos`. Wiersz powstaje przy starcie wgrania. `confirmed_at` ustawia dopiero potwierdzenie, i tylko przy kilometrach większych od zera. Polityka `training_submissions_select_own` puszcza zalogowanego wyłącznie do własnego wiersza. Trener nie ma odczytu cudzych zgłoszeń ani adresu do zdjęcia. Odczyt modelu podpisuje URL na 5 minut kluczem service role i nie oddaje go trenerowi.

Imię jest kolumną `team_members.display_name`. Skład na `/dashboard` sortuje je po polsku, potem po `created_at` i `id`. Odejścia z zespołu w aplikacji nie ma.

## Desired End State

Dziś w Warszawie jest 2 października 2026 i tego dnia jest trening. W zespole jest trener oraz trzech zawodników. Zawodnik 1 potwierdził zdjęcie i zmienił kilometry względem odczytu. Zawodnik 2 wgrał zdjęcie, widzi odczyt i nie potwierdził. Zawodnik 3 nie zaczął.

Trener otwiera ten dzień i nadal może zapisać opis. Pod spodem widzi, w kolejności nazwisk jak na stronie zespołu: zawodnik 1 — Oddał, zawodnik 2 — Nie oddał, zawodnik 3 — Nie oddał. Otwarcie zawodnika 1 pokazuje jego zdjęcie i dokładnie „Poprawił odczyt.” Kilometrów, czasu i prędkości nie ma. Zawodnik 2 i zawodnik 3 nie otwierają zdjęcia.

Wczorajszy trening pokazuje opis i taką samą listę, bez formularza. Jutrzejszy trening zostaje przy formularzu, bez listy. Zawodnik 4, który dołączył do zespołu po wczoraj, jest na wczorajszej liście jako Nie oddał. Zawodnik 5 potwierdził wczoraj i nie ma go już w składzie: na wczoraj jest jako Oddał, pod imieniem zapisanym przy potwierdzeniu, i da się otworzyć jego zdjęcie. Trenera nie ma na liście. Zalogowany zawodnik przy tym samym dniu nie widzi listy. Zespół bez zawodników pokazuje „W zespole nie ma zawodników.”

### Key Discoveries:

- Potwierdzenie jest bramką zgłoszenia: `confirm_training_photo` w `supabase/migrations/20261001171356_training_photo.sql` ustawia `confirmed_at` tylko przy `distance_km > 0`. Sam odczyt zostawia `confirmed_at` puste. S-03 zapisało, że podgląd odczytu nie jest jeszcze oddaniem.
- Odczyt trenera blokuje `training_submissions_select_own` (`user_id = auth.uid()`). `private.is_coach_of_team` jest już helperem pod RLS.
- Imię znika razem z wierszem `team_members`. Jedyna kopia, która przeżyje odejście, to imię zapisane na zgłoszeniu w chwili potwierdzenia.
- Dzień w popupie nie przeładowuje strony. Lista musi przyjść z danymi wyspy, tak jak dziś przychodzą wszystkie treningi.
- Gałąź opisu dnia minionego jest wspólna dla trenera i zawodnika (`MonthCalendar.tsx`, warunek `!coachCanWrite && selectedHasTraining && !athleteCanUpload`).
- „Dziś” listy to data warszawska z `calendar.astro`, ta sama która puszcza wgrywanie. Podświetlenie komórki zostaje przy zegarze przeglądarki.

## What We're NOT Doing

- Ranking po kilometrach i moment jego publikacji (S-04, sprzeczność US-01 z FR-014).
- Usunięcie albo podmiana zdjęcia po potwierdzeniu (S-06).
- Pokazanie kilometrów, czasu albo prędkości na liście i w podglądzie.
- Traktowanie niepotwierdzonego wgrania albo samego startu jako oddania.
- Lista przy przyszłym treningu i w dniu bez treningu.
- Lista dla zawodnika oraz podgląd zdjęcia dla osoby spoza zespołu.
- Nowa strona. Miejsce jest w oknie dnia na `/calendar`.
- Historia członkostwa. `created_at` nie wycina osoby, która dołączyła po treningu.
- Odejście z zespołu jako funkcja. Sprawdzenie osoby poza składem robi się ręcznym usunięciem wiersza.
- Raporty, integracje z aplikacjami biegowymi, drugi zespół, inne role.

## Implementation Approach

Nowa migracja, bez edycji `20261001171356_training_photo.sql`, dokłada trenerowi odczyt wyłącznie potwierdzonych wierszy jego zespołu i każe potwierdzeniu skopiować imię. Kalendarz dla trenera dostaje skład zawodników i potwierdzone zgłoszenia wszystkich treningów. Wyspa składa listę wybranego dnia, gdy ten dzień jest dziś albo wcześniej w Warszawie i ma trening. Podgląd jest osobną trasą: sesja trenera, potwierdzony wiersz tego zespołu, podpisany adres na 5 minut, ten sam mechanizm co odczyt modelu.

Reguły oddania siedzą w polityce (`confirmed_at is not null` i zespół trenera). Ekran nie prosi o kolumny kilometrów, czasu ani prędkości i nie dostaje `storage_path`. Adres powstaje dopiero przy otwarciu jednej osoby.

## Critical Implementation Details

- **PushState.** `selectDay` nie robi przeładowania. Odczyt listy pod samo `?date=` z pierwszego renderu zgubi dzień wybrany później. Skład i potwierdzone zgłoszenia ładują się raz, dla całej drużyny, i jadą w propsach wyspy.
- **Wspólna gałąź popupu.** Lista dnia minionego wchodzi tylko trenerowi. Zawodnik poza dziś zostaje przy opisie.
- **Dwa zegary i `created_at`.** Widoczność listy porównuje wybrany dzień z `warsawToday`. `created_at` członka służy wyłącznie jako drugi klucz sortowania, tak jak na `/dashboard`. Nie odcina od wczorajszego treningu osoby, która dołączyła później.
- **Imię.** `begin_training_photo` nie dotyka nowej kolumny. Zostaje pusta aż do potwierdzenia. Podmiana funkcji w nowej migracji zachowuje dotychczasowe odmowy: nie-zawodnik, zły dzień, brak treningu, brak wiersza, już potwierdzone, kilometry puste albo nie większe od zera.

## Phase 1: Trener czyta potwierdzone zgłoszenie

### Overview

Trener może odczytać potwierdzone zgłoszenia swojego zespołu, a na wierszu zostaje imię z chwili potwierdzenia. Ekranu jeszcze nie ma.

### Changes Required:

#### 1. Migracja odczytu i imienia

**File**: `supabase/migrations/YYYYMMDDHHmmss_coach_sees_submissions.sql`

**Intent**: Nowa migracja dokłada kolumnę imienia, politykę odczytu trenera i podmienia potwierdzenie, żeby imię przeżyło zniknięcie wiersza składu. Starej migracji zdjęcia nie ruszamy.

**Contract**: Kolumna `training_submissions.submitter_display_name text`, pusta domyślnie. Gdy niepusta, obowiązuje ten sam kształt co `team_members.display_name`: po `btrim`, długość od 1 do 80. Polityka `training_submissions_select_coach` dla `authenticated`, obok istniejącej `training_submissions_select_own`:

```sql
using (
  confirmed_at is not null
  and exists (
    select 1
    from public.trainings t
    where t.id = training_submissions.training_id
      and private.is_coach_of_team(t.team_id)
  )
)
```

`create or replace` na `public.confirm_training_photo(date, numeric, integer, numeric)` zostawia dotychczasowe sprawdzenia i w tym samym `update` ustawia `submitter_display_name` z `team_members.display_name` wywołującego. Brak tego imienia kończy się odmową, bez ustawiania `confirmed_at`. Istniejące potwierdzone wiersze dostają imię z aktualnego `team_members` po `user_id`, tam gdzie skład jeszcze jest. Wiersz niepotwierdzony i wiersz osoby już poza składem zostają z pustą kolumną. `begin_training_photo` i `record_training_readout` zostają bez zmian. Granty funkcji zostają jak dziś: `authenticated` woła potwierdzenie, `service_role` woła odczyt modelu.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację z polityką trenera, kolumną `submitter_display_name` i podmianą `confirm_training_photo`
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Potwierdzenie zapisuje w `submitter_display_name` aktualne `display_name` zawodnika; wiersz niepotwierdzony zostawia tę kolumnę pustą
- Trener odczytuje potwierdzony wiersz swojego zespołu i nie odczytuje wiersza niepotwierdzonego ani wiersza innego zespołu; zawodnik nadal czyta tylko swój wiersz

**Implementation Note**: Po zielonym lint i build zatrzymaj się na ręczne potwierdzenie tych dwóch sprawdzeń, zanim ruszy lista.

---

## Phase 2: Lista oddanych na dniu treningu

### Overview

Trener w oknie dnia widzi, kto oddał zdjęcie. Podglądu pliku jeszcze nie ma.

### Changes Required:

#### 1. Dane listy na kalendarzu

**File**: `src/pages/calendar.astro`

**Intent**: Trener dostaje skład i potwierdzone zgłoszenia razem z treningami, żeby zmiana dnia w wyspie nie wymagała nowego renderu serwera.

**Contract**: Przy roli `coach` strona czyta aktualnych zawodników zespołu (`user_id`, `display_name`, `created_at`, `id`) oraz potwierdzone zgłoszenia (`user_id`, `athlete_edited`, `submitter_display_name`, data treningu przez powiązanie z `trainings`). Trenera w składzie listy nie ma. Zapytanie nie bierze kilometrów, czasu, prędkości ani `storage_path`. Błąd zapytania przerywa render, tak jak błąd treningów. Rola `athlete` tych danych nie dostaje. Na wyspę idą dwie listy: zawodnicy `{ userId, displayName, createdAt, id }` oraz zgłoszenia `{ trainingOn, userId, displayName, athleteEdited }`. Imię zgłoszenia to `submitter_display_name`, a gdy jest puste — `Zawodnik`.

#### 2. Lista w oknie dnia

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Trener widzi oddanie przy dzisiejszym i minionym treningu, w tym samym oknie, w którym już edytuje opis albo czyta dzień miniony.

**Contract**: Lista jest widoczna, gdy rola to `coach`, wybrany dzień ma trening, `warsawToday` jest znane i wybrany dzień jest wcześniejszy albo równy `warsawToday`. Przyszły trening, dzień bez treningu i rola `athlete` zostają przy dotychczasowym oknie. Przy dzisiejszym treningu lista stoi pod formularzem opisu, a zapis i usunięcie działają jak dotąd. Przy dniu minionym stoi pod opisem; formularza nie ma. Wiersze to obecni zawodnicy plus potwierdzone zgłoszenia osób spoza aktualnego składu. Status to dokładnie `Oddał` albo `Nie oddał`. Sortowanie: pokazane imię przez `localeCompare` z `pl`, potem `created_at` członka, gdy osoba nadal jest w składzie, potem `user_id`. `created_at` nie usuwa nikogo z listy. Brak zawodników i brak zgłoszeń spoza składu daje dokładnie `W zespole nie ma zawodników.` `Oddał` i `Nie oddał` są na tym etapie tekstem, bez otwierania zdjęcia.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Dziś w Warszawie jest trening: jeden zawodnik potwierdził, drugi ma sam odczyt, trzeci nie zaczął. Trener widzi Oddał, Nie oddał i Nie oddał, w kolejności nazwisk jak na stronie zespołu, i nadal zapisuje opis
- Wczorajszy trening pokazuje opis i listę, bez formularza. Jutrzejszy trening zostaje przy formularzu, bez listy
- Zawodnik, który dołączył po wczoraj, jest na wczoraj jako Nie oddał. Osoba po potwierdzeniu poza składem jest jako Oddał pod zapisanym imieniem. Trenera nie ma na liście. Zawodnik nie widzi listy. Sam trener w zespole widzi „W zespole nie ma zawodników.”

**Implementation Note**: Po zielonym lint i build zatrzymaj się na ręczne przejście tych trzech sprawdzeń, zanim ruszy podgląd zdjęcia.

---

## Phase 3: Podgląd zdjęcia

### Overview

Trener otwiera zdjęcie osoby, która oddała, i widzi napis o poprawce odczytu. Inne role adresu nie dostają.

### Changes Required:

#### 1. Adres podglądu

**File**: `src/pages/api/trainings/photo/preview.ts`

**Intent**: Trener dostaje krótki adres jednego potwierdzonego zdjęcia swojego zespołu. Ścieżka obiektu nie jedzie w danych kalendarza.

**Contract**: `GET /api/trainings/photo/preview` z query `training_on` i `user_id`. Sesja jak w `src/pages/api/trainings/photo/begin.ts`. Brak sesji: 401 i `Zaloguj się.` Zła data: 400 i `Nieprawidłowa data.` Dalej jeden wynik 404 i `Nie ma potwierdzonego zdjęcia.` — dla zawodnika, osoby spoza zespołu, braku wiersza, wiersza niepotwierdzonego i treningu spoza zespołu trenera. Sukces, wyłącznie gdy wywołujący jest trenerem tego zespołu i wiersz jest potwierdzony: `{ signedUrl }` z `createSignedUrl` na buckecie `training-photos`, czas `SIGNED_READ_SECONDS` z `src/lib/training-photo.ts`. Odpowiedź nie zawiera kilometrów, czasu, prędkości ani `athlete_edited`. Nowej pozycji w `PROTECTED_ROUTES` nie ma; trasa sprawdza sesję sama, jak pozostałe trasy zdjęcia.

#### 2. Zdjęcie w oknie

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Oddane zgłoszenie da się otworzyć w tym samym oknie dnia. Nieoddane zostaje tekstem.

**Contract**: Wiersz `Oddał` otwiera podgląd i woła trasę z datą treningu oraz `user_id` tej osoby. Obraz mieści się w szerokości okna. Gdy `athleteEdited` jest prawdziwe, pod obrazem jest dokładnie `Poprawił odczyt.` Gdy jest fałszywe, tego napisu nie ma. `Nie oddał` nie woła trasy. Błąd trasy pokazuje się przy tym wierszu i nie odsłania ścieżki w buckecie. Ponowne otwarcie po wygaśnięciu adresu prosi o nowy.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Otwarcie Oddał pokazuje zdjęcie. Przy `athlete_edited` pod zdjęciem jest dokładnie „Poprawił odczyt.” Bez poprawki tego napisu nie ma. Kilometrów, czasu i prędkości nie ma
- Nie oddał nie otwiera zdjęcia. Zawodnik, osoba spoza zespołu i wiersz niepotwierdzony nie dostają adresu podglądu

**Implementation Note**: Po zielonym lint i build zatrzymaj się na ręczne otwarcie zdjęcia i odmowę adresu, zanim zmiana pójdzie dalej.

---

## Testing Strategy

### Unit Tests:

Nie ma runnera testów jednostkowych. Reguły oddania i imienia sprawdzają migracja oraz ręczny odczyt wiersza.

### Integration Tests:

`scripts/smoke.mjs` nie pokrywa zgłoszeń. Bramką automatyczną zostają `npm run lint` i `npm run build`, a w fazie 1 także `npx supabase db reset`.

### Manual Testing Steps:

1. Zespół: trener i trzech zawodników. Trening na dziś, wczoraj i jutro (daty warszawskie).
2. Zawodnik 1 potwierdza dziś ze zmianą kilometrów. Zawodnik 2 zostawia sam odczyt. Zawodnik 3 nie wgrywa.
3. Trener otwiera dziś: zawodnik 1 Oddał, zawodnik 2 i zawodnik 3 Nie oddał, opis da się zapisać. Podgląd zawodnika 1 ma zdjęcie i „Poprawił odczyt.” Bez liczb.
4. Wczoraj: opis i lista, bez formularza. Jutro: formularz, bez listy.
5. Konto dołączone po wczoraj jest na wczoraj jako Nie oddał. Po ręcznym usunięciu członka, który wczoraj potwierdził, wczoraj nadal pokazuje go jako Oddał pod zapisanym imieniem.
6. Zalogowany zawodnik nie widzi listy. Wywołanie trasy podglądu jako zawodnik, bez sesji i dla niepotwierdzonego wiersza kończy się bez adresu.
7. Zespół złożony z samego trenera, przy dzisiejszym treningu, pokazuje „W zespole nie ma zawodników.”

## Performance Considerations

Jeden zespół i mała liczba wierszy. Strona i tak ładuje wszystkie treningi. Do tego dochodzą zawodnicy i potwierdzone zgłoszenia, bez bajtów zdjęcia. Adres powstaje przy otwarciu jednej osoby i żyje 5 minut.

## Migration Notes

Świeża baza dostaje kolumnę i politykę z nowej migracji. Istniejące potwierdzone wiersze, których użytkownik nadal jest w składzie, dostają imię przy `migration up`. `npx supabase db reset` czyści lokalne dane i nakłada migracje od zera; do zachowania danych służy `npx supabase migration up`. Funkcji `begin_training_photo` nie podmieniamy: jawny `insert` nie wymienia nowej kolumny, a pusta wartość domyślna jej wystarcza.

## References

- Wymaganie: `context/foundation/prd.md` (FR-008, US-01)
- Kawałek: `context/foundation/roadmap.md` (S-05)
- Poprzedni kontrakt zgłoszenia: `context/archive/2026-10-01-photo-readout-confirm/plan.md`
- Dzień miniony bez listy: `context/archive/2026-09-28-coach-upcoming-training/plan-brief.md`
- Odczyt własnego wiersza: `supabase/migrations/20261001171356_training_photo.sql`
- Helper trenera: `supabase/migrations/20260926184325_athlete_joins_with_code.sql`
- Sortowanie składu: `src/pages/dashboard.astro`
- Podpis adresu: `src/lib/training-photo.ts`, `src/pages/api/trainings/photo/readout.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Trener czyta potwierdzone zgłoszenie

#### Automated

- [x] 1.1 `npx supabase db reset` stosuje migrację z polityką trenera, kolumną `submitter_display_name` i podmianą `confirm_training_photo` — 27982e8
- [x] 1.2 `npm run lint` przechodzi — 27982e8
- [x] 1.3 `npm run build` przechodzi — 27982e8

#### Manual

- [x] 1.4 Potwierdzenie zapisuje w `submitter_display_name` aktualne `display_name` zawodnika; wiersz niepotwierdzony zostawia tę kolumnę pustą — 27982e8
- [x] 1.5 Trener odczytuje potwierdzony wiersz swojego zespołu i nie odczytuje wiersza niepotwierdzonego ani wiersza innego zespołu; zawodnik nadal czyta tylko swój wiersz — 27982e8

### Phase 2: Lista oddanych na dniu treningu

#### Automated

- [x] 2.1 `npm run lint` przechodzi
- [x] 2.2 `npm run build` przechodzi

#### Manual

- [x] 2.3 Dziś w Warszawie jest trening: jeden zawodnik potwierdził, drugi ma sam odczyt, trzeci nie zaczął. Trener widzi Oddał, Nie oddał i Nie oddał, w kolejności nazwisk jak na stronie zespołu, i nadal zapisuje opis
- [x] 2.4 Wczorajszy trening pokazuje opis i listę, bez formularza. Jutrzejszy trening zostaje przy formularzu, bez listy
- [x] 2.5 Zawodnik, który dołączył po wczoraj, jest na wczoraj jako Nie oddał. Osoba po potwierdzeniu poza składem jest jako Oddał pod zapisanym imieniem. Trenera nie ma na liście. Zawodnik nie widzi listy. Sam trener w zespole widzi „W zespole nie ma zawodników.”

### Phase 3: Podgląd zdjęcia

#### Automated

- [ ] 3.1 `npm run lint` przechodzi
- [ ] 3.2 `npm run build` przechodzi

#### Manual

- [ ] 3.3 Otwarcie Oddał pokazuje zdjęcie. Przy `athlete_edited` pod zdjęciem jest dokładnie „Poprawił odczyt.” Bez poprawki tego napisu nie ma. Kilometrów, czasu i prędkości nie ma
- [ ] 3.4 Nie oddał nie otwiera zdjęcia. Zawodnik, osoba spoza zespołu i wiersz niepotwierdzony nie dostają adresu podglądu
