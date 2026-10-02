# Zdjęcie, odczyt i potwierdzenie — plan implementacji

## Overview

Zawodnik w dniu treningu wgrywa jedno zdjęcie z aplikacji biegowej, widzi na dole odczytane kilometry, czas i prędkość maksymalną, może je poprawić i potwierdza dane. Zgłoszenie przechodzi tylko przy kilometrach większych od zera. Gdy poprawi choć jedno pole, zapis zostaje dla trenera na później.

## Current State Analysis

Kalendarz na `/calendar` jest chroniony i ładuje treningi zespołu. Zawodnik otwiera dowolny dzień. Przy treningu widzi sam opis, bez wyboru pliku (`src/components/calendar/MonthCalendar.tsx` około gałęzi opisu). Podświetlenie „dziś” w siatce bierze się z zegara przeglądarki. Zapis trenera liczy dziś jako `(timezone('Europe/Warsaw', now()))::date` w `supabase/migrations/20260928200436_coach_trainings.sql`.

Nie ma tabeli zgłoszeń, bucketa, wywołania OpenRouter ani sekretu do odczytu. Mutacje idą przez `POST` i funkcje `security definer`, wzorem `src/pages/api/trainings/create.ts`. Klient Supabase w przeglądarce nie istnieje; sesja jest ciasteczkiem serwera (`src/lib/supabase.ts`). `SUPABASE_KEY` to klucz anon.

Infrastruktura każe położyć plik w Supabase Storage i przekazać modelowi adres, bo Worker ma 128 MB, a surowe zdjęcie z telefonu łatwo ten limit zjada (`context/foundation/infrastructure.md`).

## Desired End State

Dziś w Warszawie jest 1 października 2026 i tego dnia jest trening. Zawodnik otwiera ten dzień, wybiera jedno zdjęcie z telefonu i od razu widzi „Odczyt trwa”. Na dole pojawiają się 6,5 km, 42:10 i 12,4 km/h. Zmienia 6,5 na 6,0, widzi „Trener zobaczy, że poprawiłeś odczyt.” i potwierdza. W bazie zostaje odczyt modelu 6,5 km oraz potwierdzone 6,0 km, ze znacznikiem poprawki. Drugie zdjęcie po potwierdzeniu jest odrzucone. Ponowne otwarcie tego samego dnia pokazuje zapisane wartości bez wyboru pliku.

Trening z 30 września i trening z 2 października zostają przy opisie. Dzień bez treningu nie ma wgrywania. Sam czas 42:10 oraz dystans 0 km nie przechodzą. Trener w kalendarzu nadal edytuje opis i nie widzi napisu o poprawce.

### Key Discoveries:

- Zdjęcie wisi na wierszu `trainings` dla `(team_id, training_on)`. Unikat dnia jest w `20260928200436_coach_trainings.sql`.
- Bramka „dziś” dla zapisu trenera to `Europe/Warsaw`. Siatka kalendarza używa daty lokalnej przeglądarki (`MonthCalendar.tsx`, `localTodayCivil`).
- Odczyt i storage w kodzie nie istnieją. Kierunek jest w `context/foundation/infrastructure.md`: Storage, potem krótki adres do OpenRouter.
- Podgląd trenera, ranking i podmiana po potwierdzeniu mają własne kawałki: S-05, S-04, S-06.

## What We're NOT Doing

- Ekran trenera, lista kto oddał i podgląd zdjęcia (S-05). Znacznik poprawki jest zapisany, napis dla trenera powstanie tam.
- Ranking i moment jego publikacji (S-04, sprzeczność US-01 z FR-014).
- Usunięcie albo podmiana zdjęcia po potwierdzeniu (S-06).
- Wgrywanie w dniu innym niż dziś w Warszawie oraz w dniu bez treningu.
- Więcej niż jedno zdjęcie na zawodnika i trening.
- Ranking po czasie albo prędkości (FR-012).
- Integracje z aplikacjami biegowymi.
- Zestaw próbnych screenów z konkretnych zegarków. Prompt odczytu jest ogólny dla screena treningu biegowego.
- Wyrównanie podświetlenia „dziś” w siatce do Warszawy.
- Sprzątanie pliku w buckecie po usunięciu treningu przez trenera. Wiersz zgłoszenia znika kaskadą; obiekt może zostać w prywatnym buckecie, niedostępny dla członków.

## Implementation Approach

Jedno zgłoszenie na zawodnika i trening. Przeglądarka wysyła bajty prosto do prywatnego bucketa `training-photos` podpisanym adresem. Popup zostaje otwarty i pokazuje „Odczyt trwa”. Serwer przekazuje OpenRouter krótki adres odczytu i zapisuje trzy pola modelu kluczem service role. Zawodnik poprawia wartości w popupie i potwierdza je osobną funkcją. Do potwierdzenia kolejne zdjęcie nadpisuje ten sam obiekt i czyści odczyt. Po potwierdzeniu funkcja wgrywania odmawia.

Reguły dnia, kilometrów i znacznika siedzą w Postgresie, tak jak reguły treningu. Trasy API sprawdzają sesję tak jak `create.ts` i wołają te funkcje. Kalendarz już jest w `PROTECTED_ROUTES`; nowej strony nie ma.

## Critical Implementation Details

- **Dwa zegary.** Bramka wgrywania i potwierdzenia używa `(timezone('Europe/Warsaw', now()))::date`. Podświetlenie „dziś” w siatce zostaje przy zegarze przeglądarki. Strona kalendarza podaje wyspie osobną datę warszawską. Tuż po północy w Warszawie niepotwierdzona próba przestaje dać się potwierdzić.
- **Bajty zdjęcia.** Worker nie buforuje pliku z telefonu. Podpisany adres wgrania i krótki adres odczytu tworzy service role. Adres pętli zwrotnej lokalnego Storage (`127.0.0.1`) jest dla OpenRouter nieosiągalny. Ręczny sprawdzian odczytu potrzebuje adresu, który model może pobrać.
- **Uczciwość odczytu modelu.** Kolumny modelu zapisuje wyłącznie funkcja nadana roli service role. Zawodnik nie podaje tych liczb jako argumentu. Potwierdzenie porównuje wpisane wartości z już zapisanym odczytem i samo ustawia znacznik.
- **Popup nie przeładowuje strony w trakcie odczytu.** Wyspa woła trasy i zostawia dialog. Inaczej napis „Odczyt trwa” znika przy przekierowaniu.
- **Kolejność podmiany.** Nowa próba przed potwierdzeniem czyści odczyt modelu i pola robocze, potem wgrywa plik pod tę samą ścieżkę, potem uruchamia odczyt od nowa.

## Phase 1: Zgłoszenie i plik

### Overview

Powstaje wiersz zgłoszenia, prywatny bucket i funkcje, które pilnują dnia, jednego zdjęcia, kilometrów większych od zera oraz pary wartości model / potwierdzone.

### Changes Required:

#### 1. Migracja zgłoszenia

**File**: `supabase/migrations/YYYYMMDDHHmmss_training_photo.sql`

**Intent**: Jedno miejsce na zdjęcie zawodnika przy treningu, z odczytem modelu obok wartości, które potwierdzi. Reguły mają obowiązywać niezależnie od popupu.

**Contract**: Tabela `public.training_submissions`. Kolumny: `id`, `training_id` → `trainings` (`on delete cascade`), `user_id`, `storage_path`, `model_distance_km`, `model_duration_seconds`, `model_max_speed_kmh`, `distance_km`, `duration_seconds`, `max_speed_kmh`, `athlete_edited boolean not null default false`, `confirmed_at`, `created_at`. Unikat `(training_id, user_id)`. Dystans to kilometry (`numeric`), czas to sekundy (`integer`), prędkość to km/h (`numeric`). Puste pola odczytu zostają `null`.

Potwierdzony wiersz ma dystans większy od zera:

```sql
constraint training_submissions_confirmed_has_km check (
  confirmed_at is null or distance_km > 0
)
```

`revoke all`, `grant select` dla `authenticated`, RLS. Jedna polityka `select` dla `authenticated`: `user_id = auth.uid()`. Brak polityk insert, update i delete. Funkcja `private.is_athlete_of_team` jest lustrzanym odbiciem `private.is_coach_of_team` z rolą `athlete`.

Funkcje `security definer`, `search_path = public`, nadane `authenticated`, po polsku przy odmowie, wzorem `create_training`:

- `begin_training_photo(training_on date)` — wywołujący jest zawodnikiem zespołu tego treningu, `training_on` jest dziś w Warszawie, trening istnieje. Potwierdzony wiersz kończy się odmową. Wiersz niepotwierdzony czyści pola modelu, pola robocze i `athlete_edited`. Nowy wiersz dostaje ścieżkę `{team_id}/{training_id}/{user_id}`. Wynik to ta ścieżka.
- `confirm_training_photo(training_on date, distance_km numeric, duration_seconds integer, max_speed_kmh numeric)` — ten sam zawodnik, ten sam dzień warszawski, wiersz istnieje, `confirmed_at` jest puste. `distance_km > 0`. Czas i prędkość mogą być `null`. Zapisuje pola robocze. `athlete_edited` jest prawdziwe, gdy choć jedno z trzech pól różni się liczbowo od kolumn modelu (`null` i brak wartości to to samo; 6,50 i 6,5 to brak zmiany). Ustawia `confirmed_at`.
- `record_training_readout(...)` — nadane tylko `service_role`, odebrane `authenticated` i `anon`. Zapisuje kolumny modelu i kopiuje je do pól roboczych, gdy `confirmed_at` jest puste. Nie ustawia `athlete_edited`.

#### 2. Prywatny bucket

**File**: `supabase/migrations/YYYYMMDDHHmmss_training_photo.sql`

**Intent**: Zdjęcie zespołu nie ma publicznego adresu. W tym kawałku czyta je tylko serwer, żeby podpisać krótki odczyt.

**Contract**: Bucket `training-photos`, `public = false`. Brak polityk storage dla `anon` i `authenticated`. Ścieżka obiektu jest tą samą, którą zwraca `begin_training_photo`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację zgłoszenia i prywatny bucket `training-photos`
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Potwierdzenie z 0 km albo bez dystansu nie ustawia `confirmed_at`
- Wgranie i potwierdzenie dla dnia innego niż dziś w Europe/Warsaw jest odrzucone
- Trener nie przechodzi przez funkcje zdjęcia; zawodnik czyta tylko swój wiersz
- Bucket `training-photos` nie jest publiczny

**Implementation Note**: Po zielonym sprawdzeniu automatycznym zatrzymaj się na ręczne potwierdzenie tych punktów, zanim ruszy faza 2.

---

## Phase 2: Wgranie i odczyt

### Overview

Zawodnik w dzisiejszym treningu wybiera zdjęcie, widzi że odczyt trwa, i dostaje na dole trzy wartości. Drugie zdjęcie przed potwierdzeniem zastępuje próbę.

### Changes Required:

#### 1. Sekrety serwera

**File**: `astro.config.mjs`, `wrangler.jsonc`, `.env.example`

**Intent**: Odczyt i podpis adresów mają klucze tylko po stronie serwera. Build w CI ma zostać zielony bez tych kluczy, tak jak przy `SUPABASE_URL`.

**Contract**: `OPENROUTER_API_KEY` i `SUPABASE_SERVICE_ROLE` w `env.schema` jako `context: "server"`, `access: "secret"`, `optional: true`. Te same nazwy w `secrets.required` w `wrangler.jsonc` oraz jako puste miejsca w `.env.example`. Lokalne kopie zostają w gitignore `.env` i `.dev.vars`. Id modelu wizyjnego to jedna stała serwerowa. Odpowiedź modelu to JSON z `distance_km`, `duration_seconds`, `max_speed_kmh`; brak na screenie to `null`.

#### 2. Trasy wgrania i odczytu

**File**: `src/pages/api/trainings/photo/begin.ts`, `src/pages/api/trainings/photo/readout.ts`

**Intent**: Przeglądarka oddaje plik do Storage, a Worker rozmawia z modelem adresem. Brak klucza kończy się komunikatem w popupie, a kalendarz dalej się otwiera.

**Contract**: Obie trasy biorą sesję przez `createClient`, tak jak `src/pages/api/trainings/create.ts`. `begin` woła `begin_training_photo` i zwraca podpisany adres wgrania utworzony service role. `readout` sprawdza, że obiekt leży pod ścieżką z wiersza, tworzy krótki adres odczytu (minuty, nie dni), woła OpenRouter i zapisuje wynik przez `record_training_readout`. Wyspa dostaje JSON i zostaje na `/calendar?date=`. Błąd odczytu zostawia wiersz niepotwierdzony, z pustymi polami modelu. Brak konfiguracji zwraca błąd do popupu, bez wyjątku przy renderze kalendarza.

#### 3. Dane dnia w kalendarzu

**File**: `src/pages/calendar.astro`

**Intent**: Wyspa ma znać dzień warszawski i własne niepotwierdzone albo potwierdzone zgłoszenie, żeby bramka nie korzystała z zegara przeglądarki.

**Contract**: Do `MonthCalendar` dochodzą cywilna data `Europe/Warsaw` oraz, dla roli `athlete`, zgłoszenie wybranego treningu: trzy pola robocze, trzy pola modelu, `athlete_edited`, `confirmed_at`. Odczyt idzie istniejącym klientem serwerowym. Błąd zapytania przerywa render, tak jak błąd treningów.

#### 4. Popup zawodnika

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Wgrywanie pojawia się tylko u zawodnika, tylko gdy wybrany dzień ma trening i jest dniem warszawskim. Reszta dni zostaje przy obecnym opisie.

**Contract**: Wybór pliku `accept="image/*"`. Po wyborze, zanim wrócą liczby, widać dokładnie `Odczyt trwa`. Na dole są trzy pola: kilometry, czas, prędkość maksymalna. Czas z sekund jest pokazany jako `m:ss` albo `h:mm:ss` (42:10 to 2530 sekund). Drugi plik przed potwierdzeniem woła `begin` od nowa, wgrywa pod tę samą ścieżkę i uruchamia odczyt od nowa. Nieudany odczyt pokazuje dokładnie `Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.` Trener w dniu treningu nadal widzi formularz opisu. Dzień bez treningu zostaje przy obecnym komunikacie.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- W dniu z treningiem, który jest dziś w Warszawie, po wyborze zdjęcia widać „Odczyt trwa”, zanim pojawią się liczby
- Na dole widać 6,5 km, 42:10 i 12,4 km/h, gdy screen te wartości zawiera
- Drugie zdjęcie przed potwierdzeniem zastępuje pierwsze i kasuje poprzedni odczyt
- Trening z wczoraj i trening z jutra nie mają wyboru pliku; dzień bez treningu też
- Nieudany odczyt pokazuje „Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.” i zostawia popup
- Trener w tym samym dniu nadal edytuje opis i nie widzi wgrywania zawodnika
- Na wąskim ekranie da się wybrać zdjęcie z telefonu

**Implementation Note**: Po zielonym sprawdzeniu automatycznym zatrzymaj się na ręczne potwierdzenie tych punktów, zanim ruszy faza 3. Odczyt modelem sprawdź na adresie Storage, który OpenRouter może pobrać.

---

## Phase 3: Potwierdzenie

### Overview

Zawodnik poprawia liczby, widzi zapowiedź informacji dla trenera i potwierdza. Zgłoszenie z kilometrami większymi od zera zostaje. Kolejne zdjęcie jest odrzucone.

### Changes Required:

#### 1. Trasa potwierdzenia

**File**: `src/pages/api/trainings/photo/confirm.ts`

**Intent**: Potwierdzenie jest jedynym momentem, w którym wartości stają się zgłoszeniem. Trasa nie przyjmuje kolumn modelu od przeglądarki.

**Contract**: Sesja jak w `create.ts`. Przed funkcją trasa sprawdza, że obiekt istnieje pod ścieżką wiersza. Woła `confirm_training_photo` z dystansem, sekundami i prędkością. Przecinek dziesiętny w kilometrach i prędkości jest przyjmowany (6,0 i 6.0 to ta sama liczba). Odpowiedź zostaje w popupie. Odmowa z bazy wraca jako komunikat przy tym dniu.

#### 2. Edycja i potwierdzenie w popupie

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Zawodnik widzi, co potwierdza, i wie, że poprawka będzie widoczna dla trenera. Po zapisie ten dzień nie przyjmuje kolejnego pliku.

**Contract**: Trzy pola da się zmienić, dopóki `confirmed_at` jest puste. Przycisk potwierdzenia jest aktywny tylko gdy kilometry są liczbą większą od zera. Gdy choć jedno pole różni się od odczytu modelu, nad przyciskiem widać dokładnie `Trener zobaczy, że poprawiłeś odczyt.` Sam podgląd odczytu nie ustawia `confirmed_at`. Po sukcesie pola są tylko do odczytu, wyboru pliku nie ma, a ponowne otwarcie tego samego dnia warszawskiego pokazuje zapisane wartości. Próba kolejnego pliku po potwierdzeniu kończy się odmową funkcji `begin_training_photo`. Trener nadal nie widzi tego napisu.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Zmiana 6,5 km na 6,0 km pokazuje „Trener zobaczy, że poprawiłeś odczyt.”, a po potwierdzeniu zapis ma model 6,5 km, potwierdzone 6,0 km i `athlete_edited`
- Potwierdzenie bez zmian zostawia `athlete_edited` wyłączone i te same wartości co odczyt
- Sam czas 42:10 oraz dystans 0 km nie dają się potwierdzić
- Po potwierdzeniu kolejne zdjęcie jest odrzucone, a ponowne otwarcie tego samego dnia pokazuje zapisane wartości bez wyboru pliku
- Kalendarz trenera nie pokazuje napisu o poprawce

**Implementation Note**: Po zielonym sprawdzeniu automatycznym zatrzymaj się na ręczne potwierdzenie tych punktów.

---

## Testing Strategy

### Unit Tests:

Nie ma runnera testów jednostkowych. Reguł pilnuje migracja i ręczne wywołanie funkcji.

### Integration Tests:

`npm run lint` i `npm run build` na fazach, które dotykają TypeScriptu. `npx supabase db reset` na fazie 1. `npm run smoke` zostaje przy ścieżce logowania; zgłoszenia nie obejmuje.

### Manual Testing Steps:

1. Ustaw trening na dziś w Warszawie. Jako zawodnik wgraj screen z 6,5 km, 42:10 i 12,4 km/h. Sprawdź napis „Odczyt trwa”, a potem trzy wartości na dole.
2. Zmień 6,5 na 6,0, sprawdź zdanie o trenerze i potwierdź. W wierszu model zostaje 6,5, potwierdzone jest 6,0, `athlete_edited` jest włączone.
3. Osobna próba: potwierdź bez zmian i sprawdź wyłączony znacznik. Osobna próba: czas bez dystansu oraz 0 km nie przechodzą.
4. Przed potwierdzeniem wgraj drugi plik i sprawdź, że poprzedni odczyt zniknął. Po potwierdzeniu kolejny plik jest odrzucony, a ponowne otwarcie dnia pokazuje zapis.
5. Otwórz wczorajszy trening, jutrzejszy trening i dzień bez treningu. Wyboru pliku tam nie ma. Jako trener otwórz dziś: jest edycja opisu, nie ma wgrywania ani napisu o poprawce.
6. Na wąskim ekranie wybierz zdjęcie z telefonu.

## Performance Considerations

Jedno wywołanie OpenRouter na próbę. Czekanie na model nie jest CPU Workera; limit 128 MB dotyczy pamięci, więc plik nie wchodzi do izolatu. Przy starcie prawdziwych treningów obowiązuje Workers Paid z rejestru infrastruktury. Wywołania do Storage i OpenRouter idą po kolei.

## Migration Notes

Nie ma istniejących zdjęć do przeniesienia. Migracja jest tylko do przodu. Usunięcie dzisiejszego treningu przez trenera kasuje wiersz zgłoszenia przez `on delete cascade`. Obiekt w buckecie może zostać; członkowie nie mają do niego polityki.

`OPENROUTER_API_KEY` i `SUPABASE_SERVICE_ROLE` muszą być w `.env` i `.dev.vars`, zanim faza 2 zadziała lokalnie. Na produkcji te same nazwy idą przez `wrangler secret put`. Klucz service role zostaje na serwerze.

## References

- PRD: `context/foundation/prd.md` (FR-005, FR-006, FR-007, FR-013)
- Infrastruktura: `context/foundation/infrastructure.md` (Storage, OpenRouter, 128 MB)
- Roadmapa: `context/foundation/roadmap.md` (S-03)
- Wzorzec zapisu: `src/pages/api/trainings/create.ts`
- Reguły dnia trenera: `supabase/migrations/20260928200436_coach_trainings.sql`
- Popup zawodnika: `src/components/calendar/MonthCalendar.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Zgłoszenie i plik

#### Automated

- [x] 1.1 `npx supabase db reset` stosuje migrację zgłoszenia i prywatny bucket `training-photos`
- [x] 1.2 `npm run lint` przechodzi
- [x] 1.3 `npm run build` przechodzi

#### Manual

- [ ] 1.4 Potwierdzenie z 0 km albo bez dystansu nie ustawia `confirmed_at`
- [ ] 1.5 Wgranie i potwierdzenie dla dnia innego niż dziś w Europe/Warsaw jest odrzucone
- [ ] 1.6 Trener nie przechodzi przez funkcje zdjęcia; zawodnik czyta tylko swój wiersz
- [ ] 1.7 Bucket `training-photos` nie jest publiczny

### Phase 2: Wgranie i odczyt

#### Automated

- [x] 2.1 `npm run lint` przechodzi
- [x] 2.2 `npm run build` przechodzi

#### Manual

- [ ] 2.3 W dniu z treningiem, który jest dziś w Warszawie, po wyborze zdjęcia widać „Odczyt trwa”, zanim pojawią się liczby
- [ ] 2.4 Na dole widać 6,5 km, 42:10 i 12,4 km/h, gdy screen te wartości zawiera
- [ ] 2.5 Drugie zdjęcie przed potwierdzeniem zastępuje pierwsze i kasuje poprzedni odczyt
- [ ] 2.6 Trening z wczoraj i trening z jutra nie mają wyboru pliku; dzień bez treningu też
- [ ] 2.7 Nieudany odczyt pokazuje „Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.” i zostawia popup
- [ ] 2.8 Trener w tym samym dniu nadal edytuje opis i nie widzi wgrywania zawodnika
- [ ] 2.9 Na wąskim ekranie da się wybrać zdjęcie z telefonu

### Phase 3: Potwierdzenie

#### Automated

- [x] 3.1 `npm run lint` przechodzi
- [x] 3.2 `npm run build` przechodzi

#### Manual

- [ ] 3.3 Zmiana 6,5 km na 6,0 km pokazuje „Trener zobaczy, że poprawiłeś odczyt.”, a po potwierdzeniu zapis ma model 6,5 km, potwierdzone 6,0 km i `athlete_edited`
- [ ] 3.4 Potwierdzenie bez zmian zostawia `athlete_edited` wyłączone i te same wartości co odczyt
- [ ] 3.5 Sam czas 42:10 oraz dystans 0 km nie dają się potwierdzić
- [ ] 3.6 Po potwierdzeniu kolejne zdjęcie jest odrzucone, a ponowne otwarcie tego samego dnia pokazuje zapisane wartości bez wyboru pliku
- [ ] 3.7 Kalendarz trenera nie pokazuje napisu o poprawce
