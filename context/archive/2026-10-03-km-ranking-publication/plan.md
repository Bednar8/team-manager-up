# Globalny ranking kilometrów Implementation Plan

## Overview

Trener i zawodnik widzą jeden ranking zespołu: sumę potwierdzonych kilometrów ze wszystkich treningów. Kilometry danego treningu wchodzą do tej sumy dopiero następnego dnia kalendarzowego czasu Warszawy. Osoba bez policzonych kilometrów ma 0 km. Przy remisie obie osoby mają to samo miejsce, a kolejne miejsce przeskakuje.

## Current State Analysis

Potwierdzone kilometry już leżą w `public.training_submissions.distance_km` (`confirmed_at` ustawione, a wtedy `distance_km > 0`). Jeden wiersz przypada na zawodnika i trening. Trening ma `team_id` i `training_on`. Nie ma funkcji ani widoku, które by te kilometry sumowały.

`/ranking` jest pustym nagłówkiem w `TeamShell` i jest już w `PROTECTED_ROUTES`. Trener i zawodnik korzystają z tego samego menu. Trener może czytać potwierdzone zgłoszenia swojego zespołu. Zawodnik czyta tylko własne wiersze, a w tych wierszach jest też ścieżka zdjęcia, więc szersza polityka `SELECT` otworzyłaby zdjęcia.

„Dziś” w potwierdzaniu zdjęcia i w kalendarzu to data cywilna `Europe/Warsaw`. Strona zespołu sortuje nazwiska przez `localeCompare(..., "pl")`.

### Key Discoveries:

- Potwierdzone km: `training_submissions.distance_km` przy `confirmed_at is not null` (`supabase/migrations/20261001171356_training_photo.sql`).
- Zawodnik nie widzi cudzych zgłoszeń: `training_submissions_select_own` w tej samej migracji; trener widzi potwierdzone wiersze przez `training_submissions_select_coach` (`supabase/migrations/20261002224800_coach_sees_submissions.sql`).
- Zegar już jest warszawski: `timezone('Europe/Warsaw', now())` przy potwierdzeniu zdjęcia oraz `timeZone: "Europe/Warsaw"` w `src/pages/calendar.astro`.
- Placeholder strony: `src/pages/ranking.astro`. Skład i sortowanie nazwisk: `src/pages/dashboard.astro`.

## Desired End State

Na `/ranking` trener i zawodnik widzą tę samą listę obecnych zawodników. Każdy wiersz ma miejsce, imię i sumę kilometrów. Trenera na liście nie ma. Własny wiersz zalogowanego zawodnika jest wizualnie wyróżniony.

Suma bierze wyłącznie potwierdzone `distance_km` z treningów tego zespołu, których `training_on` jest wcześniejsze niż dzisiejsza data w Warszawie. Predykat liczy się przy odczycie. Wieczorem 3 października Anna ma z wcześniejszych treningów 5 km, Bartek 8 km, a Anna właśnie potwierdza 10 km na trening z 3 października. Tego wieczoru lista to Bartek 8 km (miejsce 1) i Anna 5 km (miejsce 2). Rano 4 października te 10 km wchodzą do sumy: Anna 15 km (miejsce 1), Bartek 8 km (miejsce 2).

Remis: Anna 15 km, Bartek 15 km, Celina 10 km daje miejsca 1, 1 i 3. Na liście przy równym wyniku kolejność jest alfabetyczna po polsku: Anna, potem Bartek, potem Celina. Darek i Ewa bez policzonych kilometrów, przy Annie 15 km i Bartku 8 km, mają oboje 0 km i miejsce 3.

## What We're NOT Doing

- Ranking po czasie albo szybkości (FR-012).
- Osobny ranking jednego treningu albo rozbicie sumy na treningi.
- Pokazywanie kilometrów w tym samym warszawskim dniu, w którym zostały potwierdzone. Przykład US-01 „od razu po zgłoszeniach” nie obowiązuje.
- Wiersz trenera na liście.
- Osoby, których nie ma już w składzie.
- Podgląd zdjęcia, czasu albo prędkości na tej stronie.
- Okno poprawki i usuwania zdjęcia (S-06).
- Nocne zadanie, które przepisuje sumy.
- Edycję US-01 w PRD. Ta zmiana zapisuje, że wygrywa publikacja następnego dnia.

## Implementation Approach

Jedna funkcja `security definer` zwraca ranking zespołu wywołującego. Strona `/ranking` woła ją i dla trenera, i dla zawodnika, potem tylko rysuje wiersze. Reguła daty, zera i miejsc zostaje w bazie, więc obie role nie mogą jej rozjechać. Polityka odczytu zgłoszeń zostaje jak dziś, bo tabela niesie ścieżkę zdjęcia.

## Critical Implementation Details

Miejsce liczy `rank()` wyłącznie po malejącej sumie kilometrów. Drugi klucz w tym oknie (nazwisko) dałby unikalne miejsca i zepsułby remis. Kolejność alfabetyczna jest osobnym sortowaniem listy, tym samym `localeCompare(..., "pl")` co na stronie zespołu, z `user_id` jako ostatnim rozstrzygnięciem.

Zawodnik z zerem nie ma wiersza zgłoszenia. Zbiór startowy to obecni `team_members` z `role = 'athlete'` w zespole wywołującego, a suma jest do nich dołączana z lewej. Brak sumy to 0, nie pominięcie osoby. Imię bierze się z aktualnego `display_name` w składzie.

Dzień wchodzi do sumy tylko gdy `training_on < (timezone('Europe/Warsaw', now()))::date`. Równość z dzisiejszą datą zostawia kilometry poza listą. Nie dodajemy zawodnikowi polityki `SELECT` na `training_submissions`.

## Phase 1: Odczyt rankingu

### Overview

Migracja dodaje funkcję, która dla zespołu wywołującego zwraca obecnych zawodników, ich sumę i miejsce. Dziś potwierdzone kilometry jeszcze do niej nie wchodzą.

### Changes Required:

#### 1. Funkcja rankingu

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_team_km_ranking.sql`

**Intent**: Dać trenerowi i zawodnikowi ten sam odczyt sumy, bez otwierania zdjęć zawodnika innym osobom. Znacznik czasu migracji ma być późniejszy niż `20261002224800`.

**Contract**: `public.team_km_ranking()` zwraca `user_id uuid`, `display_name text`, `total_km numeric`, `place integer`. Wywołujący bez zespołu dostaje polski wyjątek w stylu istniejących RPC. Trener i zawodnik tego zespołu dostają wiersze. Brak zawodników to pusta tabela, nie wyjątek. `place` to `rank() over (order by total_km desc)`. Grant: `execute` dla `authenticated`, odebrane `public` i `anon`, jak przy `confirm_training_photo`.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` kończy się kodem 0

#### Manual Verification:

- Potwierdzone kilometry z dzisiejszego treningu nie wchodzą do sumy, a następnego warszawskiego dnia już wchodzą
- Równe sumy dzielą miejsce, a następne miejsce przeskakuje
- Zawodnik bez policzonych kilometrów jest na liście z 0 km
- Trener nie jest zwróconym wierszem

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie kryteriów manualnych, zanim zacznie się faza 2.

---

## Phase 2: Strona rankingu

### Overview

`/ranking` pokazuje wynik funkcji obu rolom. Własny wiersz zawodnika jest wyróżniony. Pusta drużyna bez zawodników dostaje pusty stan, nie błąd strony.

### Changes Required:

#### 1. Strona rankingu

**File**: `src/pages/ranking.astro`

**Intent**: Zastąpić sam nagłówek listą miejsc, imion i kilometrów, czytelną też na telefonie. Ścieżka `/ranking` i `TeamShell` zostają.

**Contract**: Strona woła `supabase.rpc("team_km_ranking")` dla roli `coach` i `athlete`. Błąd RPC przerywa render tak jak inne strony zespołu (`Could not load team`), żeby pusta lista nie udawała rankingu. Zero wierszy to komunikat, że w składzie nie ma zawodników. Sortowanie wyświetlania: malejące `total_km`, potem `display_name` przez `localeCompare(..., "pl")`, potem `user_id`. Miejsce jest tym, które zwróciła funkcja. Kilometry w formacie polskim bez dokładania zer po przecinku: 15 → `15 km`, 6.5 → `6,5 km`, 0 → `0 km`. Wiersz, którego `user_id` jest zalogowanym użytkownikiem, dostaje wyróżnienie w stylu akcentu wiersza trenera na `src/pages/dashboard.astro`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` kończy się kodem 0
- `npm run build` kończy się kodem 0

#### Manual Verification:

- Trener i zawodnik na `/ranking` widzą te same miejsca, imiona i kilometry
- Wiersz zalogowanego zawodnika jest wizualnie wyróżniony, a trenera na liście nie ma
- Zespół bez zawodników pokazuje pusty stan, nie błąd strony
- Lista jest czytelna przy szerokości telefonu

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie kryteriów manualnych.

---

## Testing Strategy

### Unit Tests:

Nie ma skonfigurowanego runnera testów jednostkowych. Arytmetyka miejsc i daty jest sprawdzana ręcznie na funkcji z fazy 1.

### Integration Tests:

`npm run lint` i `npm run build` w fazie 2. Smoke nie pokrywa zalogowanego `/ranking`.

### Manual Testing Steps:

1. Wieczór 3 października czasu Warszawy: wcześniejsze sumy to Anna 5 km i Bartek 8 km, a Anna potwierdza 10 km na trening z tego dnia. Ranking pokazuje Bartka 8 km na miejscu 1 i Annę 5 km na miejscu 2.
2. Data warszawska 4 października: ta sama Anna ma 15 km i miejsce 1, Bartek 8 km i miejsce 2.
3. Osobny skład: Anna 15 km, Bartek 15 km, Celina 10 km. Miejsca to 1, 1 i 3, a kolejność na liście to Anna, Bartek, Celina.
4. Przy Annie 15 km i Bartku 8 km Darek i Ewa bez policzonych kilometrów mają 0 km i oboje miejsce 3. Kolejność wśród zer: Darek, potem Ewa.
5. Otwórz `/ranking` jako trener i jako jeden z zawodników. Miejsca i sumy są te same. Wyróżniony jest tylko wiersz tego zawodnika. Imienia trenera nie ma.
6. Zawęź okno do szerokości telefonu i sprawdź, że miejsce, imię i kilometry nadal da się odczytać.

Nie czyść lokalnej bazy. Do brakującego przypadku dopisz tylko potrzebny wiersz.

## Performance Considerations

Jeden zespół i jeden odczyt funkcji przy wejściu na stronę. Osobny cache nie jest potrzebny.

## Migration Notes

Nie dodajemy kolumn i nie uzupełniamy starych wierszy. Istniejące potwierdzone wiersze wchodzą do sumy, gdy ich `training_on` jest wcześniejsze niż dziś w Warszawie. Migrację zastosuj przez `npx supabase migration up`. Nie resetuj bazy i nie kasuj istniejących wierszy.

## References

- Notatka zmiany: `context/changes/km-ranking-publication/change.md`
- PRD: FR-010, FR-011, FR-014 oraz US-01 (przykład „od razu” świadomie nie obowiązuje)
- Roadmap: S-04 w `context/foundation/roadmap.md`
- Placeholder: `src/pages/ranking.astro`
- Kilometry i własny odczyt zawodnika: `supabase/migrations/20261001171356_training_photo.sql`
- Odczyt trenera: `supabase/migrations/20261002224800_coach_sees_submissions.sql`
- Sortowanie składu: `src/pages/dashboard.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Odczyt rankingu

#### Automated

- [x] 1.1 `npx supabase migration up` kończy się kodem 0 — 397410d

#### Manual

- [x] 1.2 Potwierdzone kilometry z dzisiejszego treningu nie wchodzą do sumy, a następnego warszawskiego dnia już wchodzą — 397410d
- [x] 1.3 Równe sumy dzielą miejsce, a następne miejsce przeskakuje — 397410d
- [x] 1.4 Zawodnik bez policzonych kilometrów jest na liście z 0 km — 397410d
- [x] 1.5 Trener nie jest zwróconym wierszem — 397410d

### Phase 2: Strona rankingu

#### Automated

- [x] 2.1 `npm run lint` kończy się kodem 0 — 397410d
- [x] 2.2 `npm run build` kończy się kodem 0 — 397410d

#### Manual

- [x] 2.3 Trener i zawodnik na `/ranking` widzą te same miejsca, imiona i kilometry — 397410d
- [x] 2.4 Wiersz zalogowanego zawodnika jest wizualnie wyróżniony, a trenera na liście nie ma — 397410d
- [x] 2.5 Zespół bez zawodników pokazuje pusty stan, nie błąd strony — 397410d
- [x] 2.6 Lista jest czytelna przy szerokości telefonu — 397410d
