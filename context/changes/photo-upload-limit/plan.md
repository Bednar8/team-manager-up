# Photo upload limit Implementation Plan

## Overview

Zawodnik może wysłać do odczytu najwyżej dwa zdjęcia jednego warszawskiego dnia. Trzecie wywołanie modelu nie wychodzi, a ostatnie zdjęcie zostaje na treningu. Projekt jest pokazowy: limit ma uciąć zużycie OpenRouter.

## Current State Analysis

Jedno zdjęcie na zawodnika i trening leży w `training_submissions` oraz w obiekcie `{team_id}/{training_id}/{user_id}`. Każdy wybrany plik idzie tą samą ścieżką: `POST /api/trainings/photo/begin`, zapis do Storage, `POST /api/trainings/photo/readout`. Jedyny koszt modelu to `readWorkoutPhoto` w odczycie.

`begin_training_photo` przy kolejnym pliku najpierw czyści liczby i `confirmed_at`, a trasa potem kasuje obiekt. Nie ma licznika prób. `Usuń zdjęcie` kasuje wiersz zgłoszenia. Skasowanie treningu przez trenera robi to samo kaskadą. Ponowne wgranie zaczynałoby koszt od zera, gdyby licznik siedział na zgłoszeniu.

Odczyt nie sprawdza, czy data jest warszawskim dniem. Stare niepotwierdzone zgłoszenie dałoby się wysłać do modelu poza dzisiejszym oknem wgrania.

## Desired End State

Na jednego zawodnika i jeden dzień w `Europe/Warsaw` wychodzą najwyżej dwa żądania do OpenRouter. Trzeci plik dostaje `Dziś można wgrać najwyżej dwa zdjęcia.` Pole pliku znika. Zostają potwierdzenie i ręczna poprawka liczb, dopóki zdjęcie nie jest potwierdzone, oraz `Usuń zdjęcie` po potwierdzeniu. Usunięcie i ponowne utworzenie treningu nie oddają slotu.

Przykład. Zawodnik, jeden trening na warszawski dzień.

- Pierwsze zdjęcie wysłane do modelu: licznik 1, pole pliku zostaje.
- Drugie zdjęcie wysłane do modelu: licznik 2, pole pliku znika, widać zdanie limitu i `Potwierdź`.
- Trzeci plik: begin zwraca 400 z tym zdaniem. Potwierdzone zdjęcie i `confirmed_at` zostają.
- `Usuń zdjęcie` po dwóch wysłaniach: zdjęcia nie ma, licznik zostaje 2, pola pliku nie ma do końca tego warszawskiego dnia.
- Plik odrzucony zanim padnie wywołanie: licznik bez zmiany. Błąd odpowiedzi modelu: licznik rośnie.

### Key Discoveries:

- Odczyt modelu jest wyłącznie w `src/pages/api/trainings/photo/readout.ts` (`readWorkoutPhoto` przy gotowym adresie obrazu). Potwierdzenie, usunięcie i podgląd trenera modelu nie wołają.
- Czyszczenie potwierdzenia jest w `begin_training_photo` w `supabase/migrations/20261019120000_athlete_photo_edit_window.sql`, zanim `src/pages/api/trainings/photo/begin.ts` usunie obiekt.
- Dzień wgrania to `(timezone('Europe/Warsaw', now()))::date`. Kalendarz zawodnika używa tej samej strefy.
- Testy HTTP są w `tests/photo-edit-window.test.ts` i `tests/support.ts`. Nie wołają żywego odczytu, gdy ma dojść do modelu. `begin` i tak wymaga niepustego `OPENROUTER_API_KEY`.
- Sprzątanie testów kasuje użytkownika Auth na końcu (`scripts/test-resources.mjs`). Nowa tabela ma zniknąć kaskadą z `auth.users`, bez dopisywania jej do listy tabel sprzątania.

## What We're NOT Doing

- Drugi zapisany plik na tym samym treningu. Zostaje jedno zdjęcie na zawodnika i trening.
- Nielimitowane poprawki przed pierwszym potwierdzeniem.
- Oddawanie slotu przy `Usuń zdjęcie`, przy skasowaniu treningu albo przy błędzie modelu.
- Liczenie próby, która nie doszła do wywołania OpenRouter.
- Blokada `Potwierdź`, ręcznej poprawki liczb przed potwierdzeniem i `Usuń zdjęcie` po potwierdzeniu.
- Edycja samych liczb już potwierdzonego zdjęcia. Po potwierdzeniu pola zostają tylko do odczytu, jak dziś.
- Budżet tokenów albo dolarów OpenRouter, limit innych tras, ekran limitu dla trenera, ręczny reset licznika.
- Zmiana okna „tylko warszawski dzień treningu”, limitu rozmiaru pliku i sprzątania osieroconych obiektów po skasowaniu treningu.
- Zamek na równoległe begin przy jednym wolnym slocie. Dwa takie begin mogą wyczyścić zdjęcie, zanim druga rezerwacja odpadnie. Wywołania modelu i tak stają na dwóch.

## Implementation Approach

Licznik jest w osobnej tabeli na zawodnika i warszawski dzień, bo wiersz zgłoszenia znika przy usunięciu zdjęcia i przy skasowaniu treningu. Brak wiersza znaczy zero. `begin_training_photo` przy liczbie 2 kończy się błędem, zanim ruszy zgłoszenie i plik. Odczyt rezerwuje slot jednym zapisem dopiero wtedy, gdy adres obrazu jest gotowy, i dopiero potem woła model. Odrzucenie innego dnia niż warszawski dziś jest osobno i nic nie zwiększa.

## Critical Implementation Details

- **State sequencing.** W `begin_training_photo` sprawdzenie licznika stoi zaraz po znalezieniu treningu i przed `update`, który czyści liczby oraz `confirmed_at`. Sprawdzenie po tym `update` albo po `storage.remove` skasowałoby zdjęcie, które ma zostać.
- **Timing & lifecycle.** Rezerwacja slotu jest po udanym adresie obrazu i przed `readWorkoutPhoto`. Adres pusty zwraca dotychczasowe 502 i nie rezerwuje. Odpowiedź modelu z błędem zostawia już zużyty slot. Dwa równoległe odczyty przy liczniku 1: jeden zapis przechodzi, drugi dostaje zdanie limitu i nie woła modelu.

## Faza 1: Licznik i odmowa na serwerze

### Overview

Trzecie wysłanie do modelu i odczyt innego dnia odpadają w bazie i w trasie odczytu. Kalendarz w tej fazie jeszcze pokazuje pole pliku. Serwer i tak odmawia.

### Changes Required:

#### 1. Licznik odczytów

**File**: `supabase/migrations/20261021194500_photo_readout_limit.sql`

**Intent**: Zapisuje, ile żądań do OpenRouter zawodnik wysłał danego warszawskiego dnia, tak żeby usunięcie zgłoszenia tego nie zerowało.

**Contract**: Tabela `public.photo_readout_uses`: `user_id uuid not null references auth.users (id) on delete cascade`, `used_on date not null`, `used_count integer not null`, klucz główny `(user_id, used_on)`, check `used_count between 1 and 2`. Brak wiersza znaczy zero. RLS włączone. `authenticated` może `select` własny wiersz (`user_id = auth.uid()`). Brak polityk zapisu. Funkcje `security definer` z `search_path = public`. `execute` tylko dla `authenticated`, zdjęte z `public` i `anon`.

`assert_photo_readout_day(training_on date)` nic nie zapisuje. Gdy data nie jest `(timezone('Europe/Warsaw', now()))::date`, podnosi `Zdjęcie można wgrać tylko w dniu treningu.`

`reserve_photo_readout()` zwiększa licznik bieżącego warszawskiego dnia o jeden, tylko gdy jest mniejszy niż 2, i zwraca nową wartość. Przy 2 podnosi `Dziś można wgrać najwyżej dwa zdjęcia.` Zapis, który decyduje o limicie:

```sql
insert into public.photo_readout_uses (user_id, used_on, used_count)
values (v_user_id, v_today, 1)
on conflict (user_id, used_on)
do update set used_count = public.photo_readout_uses.used_count + 1
where public.photo_readout_uses.used_count < 2
returning used_count into v_used;
```

Gdy `found` jest fałszywe, funkcja podnosi zdanie limitu. Wywołujący nie dostaje cichego „zero wierszy”.

#### 2. Odmowa zanim begin wyczyści zdjęcie

**File**: `supabase/migrations/20261021194500_photo_readout_limit.sql`

**Intent**: Trzeci plik ma odpaść, zanim znikną potwierdzenie i obiekt w Storage.

**Contract**: `create or replace` dla `public.begin_training_photo(date)`. Po znalezieniu treningu i przed odczytem albo aktualizacją `training_submissions` funkcja czyta `used_count` na `auth.uid()` i warszawski dziś. Przy wartości 2 podnosi `Dziś można wgrać najwyżej dwa zdjęcia.` Brak wiersza przepuszcza dotychczasowy begin. Reszta funkcji zostaje.

#### 3. Odczyt rezerwuje slot przed modelem

**File**: `src/pages/api/trainings/photo/readout.ts`

**Intent**: Model startuje tylko po udanej rezerwacji, a inny dzień w ogóle nie dochodzi do Storage ani do modelu.

**Contract**: Po odczytaniu `training_on` trasa woła `assert_photo_readout_day` klientem zalogowanego użytkownika. Błąd dnia wraca jako 400 z tym zdaniem. Dalej zostaje dotychczasowa ścieżka: zgłoszenie, brak `confirmed_at`, istnienie obiektu, adres obrazu. Pusty adres to dotychczasowe 502 `Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.` i brak rezerwacji. Przy gotowym adresie trasa woła `reserve_photo_readout` tym samym klientem. Zdanie limitu to 400, bez `readWorkoutPhoto`. Po udanej rezerwacji odpowiedź 200 oraz 502 z modelu albo z `record_training_readout` zawierają `readoutsUsed` równe zwróconej liczbie. 502 sprzed rezerwacji tego pola nie ma.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` nakłada `20261021194500_photo_readout_limit.sql` i zostawia istniejące wiersze lokalnej bazy
- `npm test` dla limitu: przy `used_count` 2 `POST /api/trainings/photo/begin` zwraca 400 `Dziś można wgrać najwyżej dwa zdjęcia.` i nie zmienia potwierdzonego zgłoszenia, a `POST /api/trainings/photo/readout` przy istniejącym obiekcie zwraca ten sam 400 zamiast 502 `Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.`
- `npm test` dla wczorajszego `training_on` bez obiektu: `POST /api/trainings/photo/readout` zwraca 400 `Zdjęcie można wgrać tylko w dniu treningu.`
- `npm test` po `Usuń zdjęcie` oraz po skasowaniu i ponownym utworzeniu dzisiejszego treningu: `used_count` zostaje 2 i kolejny begin zwraca zdanie limitu
- `npm run lint` przechodzi

**Implementation Note**: Ta faza kończy się na sprawdzeniach automatycznych. Pole pliku w kalendarzu zmienia dopiero faza 2.

---

## Faza 2: Kalendarz bez trzeciego pliku

### Overview

Przy dwóch wysłanych odczytach zawodnik widzi zdanie limitu zamiast pola pliku. Potwierdzenie, ręczna poprawka przed potwierdzeniem i usunięcie potwierdzonego zdjęcia zostają.

### Changes Required:

#### 1. Licznik na stronie kalendarza

**File**: `src/pages/calendar.astro`

**Intent**: Ekran dnia ma znać licznik zanim zawodnik wybierze plik.

**Contract**: Dla roli `athlete` strona czyta własny `photo_readout_uses.used_count` na `user.id` i `warsawToday`. Brak wiersza daje 0. Wartość idzie do kalendarza jako `photoReadoutsUsed`. Trener dostaje 0. Odczyt nie zależy od parametru `date`.

#### 2. Ukryte pole pliku

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Trzeciego pliku nie da się wybrać, a zdjęcie z tego dnia nadal da się oddać albo usunąć.

**Contract**: Przy `athleteCanUpload` i `photoReadoutsUsed >= 2` nie ma etykiety `Zdjęcie` / `Podmień zdjęcie` ani `input#training-photo`. W tym miejscu jest tekst `Dziś można wgrać najwyżej dwa zdjęcia.` Reszta panelu zostaje: opis, `PhotoFields` z dotychczasową regułą `readOnly` po potwierdzeniu, `Potwierdź` tylko przed potwierdzeniem, `Usuń zdjęcie` tylko po potwierdzeniu. Przy liczniku poniżej 2 pole pliku działa jak dziś. Odpowiedź begin albo odczytu z tym zdaniem limitu oraz pole `readoutsUsed >= 2` podnoszą licznik na ekranie bez przeładowania. Usunięcie zdjęcia licznika nie zmniejsza.

#### 3. Test HTML kalendarza

**File**: `tests/photo-upload-limit.test.ts`

**Intent**: Render dnia ma pokazać limit bez zdejmowania potwierdzenia i usunięcia.

**Contract**: Test używa własnego zespołu i `warsawToday()` z `tests/support.ts`. `GET /calendar?date=<warsaw today>` przy liczniku 2 i potwierdzonym zdjęciu zawiera zdanie limitu oraz `Usuń zdjęcie`, a nie zawiera `id="training-photo"`. Przy liczniku 0 etykieta pliku jest. Przy liczniku 2 i niepotwierdzonym zgłoszeniu jest `Potwierdź`.

### Success Criteria:

#### Automated Verification:

- `npm test` sprawdza HTML kalendarza: licznik 2 i potwierdzone zdjęcie dają zdanie limitu oraz `Usuń zdjęcie` bez `id="training-photo"`; licznik 0 zostawia etykietę pliku; licznik 2 i niepotwierdzone zgłoszenie zostawiają `Potwierdź`
- `npm run lint` przechodzi

#### Manual Verification:

- Po dwóch odczytach dzisiejszego treningu pole pliku znika, widać zdanie limitu, a `Potwierdź` zapisuje liczby ostatniego zdjęcia
- `Usuń zdjęcie` potwierdzonego zdjęcia usuwa je, a pole pliku zostaje schowane do końca warszawskiego dnia
- Plik odrzucony przed wywołaniem OpenRouter nie podnosi licznika i pole pliku zostaje

**Implementation Note**: Po zielonych sprawdzeniach automatycznych zatrzymaj się na ręczne potwierdzenie tej fazy, zanim zmiana pójdzie dalej.

---

## Testing Strategy

### Unit Tests:

- Brak osobnego runnera jednostkowego. Reguły limitu siedzą w funkcjach SQL i w trasie odczytu, więc łapie je test HTTP.

### Integration Tests:

- Nowy plik `tests/photo-upload-limit.test.ts` idzie wzorem `tests/photo-edit-window.test.ts`: własny zespół, pętla zwrotna, rejestr `.test-runs/` przed utworzeniem zasobów, sprzątanie tylko tego biegu.
- Odczyt wolno wołać tylko w stanach, które mają oddać 400 przed modelem: licznik już 2 przy istniejącym obiekcie albo data inna niż warszawski dziś. Zielony wynik to dokładne zdanie błędu, nie 502 odczytu.
- Wiersz licznika seeduje klient service role. Klucz obcy do `auth.users` z `on delete cascade` zdejmuje go przy usunięciu użytkownika testu. Tabeli nie dopisuje się do listy sprzątania i nie kasuje się jej szerokim `delete`.

### Manual Testing Steps:

1. Na dzisiejszym treningu wgraj zdjęcie, poczekaj na odczyt, wgraj drugie. Pole pliku znika, liczby drugiego da się poprawić i potwierdzić.
2. Potwierdź, usuń zdjęcie, otwórz ten sam dzień jeszcze raz. Pola pliku nie ma, widać zdanie limitu.
3. Na koncie z licznikiem 0 wskaż plik, który odpada przed modelem. Pole zostaje i kolejny, poprawny plik przechodzi odczyt.

## Performance Considerations

Każdy begin czyta jeden wiersz po kluczu głównym. Każdy odczyt, który ma dojść do modelu, robi jeden zapis tego wiersza. Osobnej pamięci podręcznej nie ma. Dwa równoległe odczyty rozstrzyga jeden `insert ... on conflict`.

## Migration Notes

Istniejące zgłoszenia zostają. Brak wiersza w `photo_readout_uses` znaczy zero, więc dzień wdrożenia zaczyna licznik od zera także dla zawodników, którzy już coś wgrali. Historycznych wywołań modelu nie da się odtworzyć z `training_submissions`. Migrację nakłada się `npx supabase migration up`. Bez `db reset`, bez czyszczenia tabel i bez seeda domenowego.

## References

- Poprzednie okno zdjęcia: `context/changes/athlete-photo-edit-window/plan.md`
- Jedno zdjęcie na zawodnika i trening: `context/foundation/prd.md`, FR-006
- Begin czyści zgłoszenie przed kasowaniem obiektu: `supabase/migrations/20261019120000_athlete_photo_edit_window.sql`, `src/pages/api/trainings/photo/begin.ts`
- Jedno wywołanie modelu: `src/pages/api/trainings/photo/readout.ts`, `src/lib/training-photo.ts`
- Pole pliku: `src/components/calendar/MonthCalendar.tsx`
- Wzór testu HTTP: `tests/photo-edit-window.test.ts`, `tests/support.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Licznik i odmowa na serwerze

#### Automated

- [x] 1.1 `npx supabase migration up` nakłada `20261021194500_photo_readout_limit.sql` i zostawia istniejące wiersze lokalnej bazy — dc240af
- [x] 1.2 `npm test` dla limitu: przy `used_count` 2 `POST /api/trainings/photo/begin` zwraca 400 `Dziś można wgrać najwyżej dwa zdjęcia.` i nie zmienia potwierdzonego zgłoszenia, a `POST /api/trainings/photo/readout` przy istniejącym obiekcie zwraca ten sam 400 zamiast 502 `Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.` — dc240af
- [x] 1.3 `npm test` dla wczorajszego `training_on` bez obiektu: `POST /api/trainings/photo/readout` zwraca 400 `Zdjęcie można wgrać tylko w dniu treningu.` — dc240af
- [x] 1.4 `npm test` po `Usuń zdjęcie` oraz po skasowaniu i ponownym utworzeniu dzisiejszego treningu: `used_count` zostaje 2 i kolejny begin zwraca zdanie limitu — dc240af
- [x] 1.5 `npm run lint` przechodzi — dc240af

### Phase 2: Kalendarz bez trzeciego pliku

#### Automated

- [x] 2.1 `npm test` sprawdza HTML kalendarza: licznik 2 i potwierdzone zdjęcie dają zdanie limitu oraz `Usuń zdjęcie` bez `id="training-photo"`; licznik 0 zostawia etykietę pliku; licznik 2 i niepotwierdzone zgłoszenie zostawiają `Potwierdź`
- [x] 2.2 `npm run lint` przechodzi

#### Manual

- [x] 2.3 Po dwóch odczytach dzisiejszego treningu pole pliku znika, widać zdanie limitu, a `Potwierdź` zapisuje liczby ostatniego zdjęcia
- [x] 2.4 `Usuń zdjęcie` potwierdzonego zdjęcia usuwa je, a pole pliku zostaje schowane do końca warszawskiego dnia
- [x] 2.5 Plik odrzucony przed wywołaniem OpenRouter nie podnosi licznika i pole pliku zostaje
