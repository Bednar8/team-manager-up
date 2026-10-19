# Okno poprawki zdjęcia Implementation Plan

## Overview

Zawodnik może w dniu treningu podmienić albo usunąć swoje już potwierdzone zdjęcie. Podmiana zaczyna się od nowa od odczytu i potwierdzenia, a usunięcie zabiera kilometry z rankingu i zwraca na liście trenera „Nie oddał”. Po warszawskim dniu treningu obie akcje są odrzucone.

## Current State Analysis

Jedno zgłoszenie na zawodnika i trening siedzi w `training_submissions`. `begin_training_photo` przyjmuje tylko zawodnika i tylko wtedy, gdy `training_on` równa się `(timezone('Europe/Warsaw', now()))::date`. Gdy wiersz jest już potwierdzony, funkcja rzuca `To zdjęcie jest już potwierdzone.` (`supabase/migrations/20261001171356_training_photo.sql:70-93`). Trasa `POST /api/trainings/photo/begin` po udanym RPC usuwa obiekt w buckecie `training-photos` i zwraca podpisany URL (`src/pages/api/trainings/photo/begin.ts:29-52`).

Potwierdzenie ustawia `confirmed_at`, kilometry i `submitter_display_name` (`supabase/migrations/20261002224800_coach_sees_submissions.sql:99-112`). Ranking sumuje wyłącznie potwierdzone `distance_km` treningów z datą nie późniejszą niż warszawskie dziś (`supabase/migrations/20261003120000_immediate_km_ranking.sql:31-39`). Brak wiersza daje 0 km. Trener widzi „Oddał” tylko przy `confirmed_at` (`src/components/calendar/MonthCalendar.tsx:899-911`).

Kalendarz chowa wybór pliku, gdy zgłoszenie jest potwierdzone (`MonthCalendar.tsx:530`, `:781-795`). Wgranie w dniu treningu jest już ograniczone do `selected === warsawToday` (`:515`). Nie ma trasy usuwania zdjęcia ani polityki DELETE dla `authenticated`; mutacje idą przez RPC `security definer`.

Test `a second begin after confirmation keeps one row and the same confirmed_at` w `tests/submission-rejection.test.ts:94-138` utrwala odmowę drugiego `begin`. Ta zmiana tę odmowę zdejmuje w dniu treningu.

## Desired End State

W warszawskim dniu treningu zawodnik, który już potwierdził zdjęcie, wybiera nowe plikiem „Podmień zdjęcie”. Stare potwierdzenie znika od razu, odczyt i potwierdzenie działają jak przy pierwszym wgraniu, a ranking po nowym potwierdzeniu pokazuje nowe kilometry. „Usuń zdjęcie” kasuje jego wiersz i plik; na rankingu ma 0 km z tego zgłoszenia, a trener widzi „Nie oddał”. Tego samego dnia może wgrać zdjęcie od zera.

Gdy warszawski dzień jest już późniejszy niż `training_on`, podmiana i usunięcie zwracają `Zdjęcie można wgrać tylko w dniu treningu.` i zostawiają wiersz. Zaplanowany trening na jutro okna nie zamyka.

### Key Discoveries:

- Bramka daty w `begin_training_photo` jest przed odmową potwierdzonego wiersza (`20261001171356_training_photo.sql:70-93`), więc wczorajsze wywołanie dalej kończy się zdaniem o dniu treningu.
- Ranking i lista „Oddał” same reagują na zniknięcie `confirmed_at` albo wiersza. Osobnej zmiany SQL rankingu nie trzeba.
- `client:load` na kalendarzu (`src/pages/calendar.astro:260`) wstawia pierwszą odpowiedź HTML, więc napisy akcji da się sprawdzić przez `GET /calendar`.
- Testy HTTP idą przez `tests/support.ts`: `beginTrainingPhoto`, `recordTrainingReadout`, `confirmTrainingPhoto`, `insertTraining`, `insertConfirmedSubmission`, `warsawToday`, `warsawYesterday`. Żywego odczytu modelu testy nie wołają.

## What We're NOT Doing

- Poprawianie samych liczb przy już potwierdzonym zdjęciu, bez nowego pliku.
- Trzymanie okna otwartego aż do następnego zaplanowanego treningu.
- Podmianę albo usunięcie po warszawskim dniu treningu.
- Usuwanie zdjęcia zawodnika przez trenera.
- Ranking po czasie albo szybkości (FR-012).
- Sprzątanie plików zostawionych po usunięciu całego treningu przez trenera.
- Przywracanie potwierdzenia, gdy usunięcie obiektu ze Storage się nie uda.
- Drugi dialog z pytaniem „na pewno?” przed usunięciem zdjęcia.

## Implementation Approach

Nowa migracja podmienia `begin_training_photo` i dodaje `delete_training_photo`. Obie używają tej samej daty cywilnej Europy/Warsaw co dzisiejsze wgranie. Drugi `begin` w tym dniu czyści potwierdzenie i pola odczytu, zostawia `storage_path` i zwraca go istniejącej trasie `begin`, która już zdejmuje obiekt i podpisuje nowe wgranie. Usunięcie jest osobną trasą JSON, na wzór `begin`, i kasuje wiersz właściciela oraz obiekt.

Kalendarz pokazuje podmianę i usunięcie tylko zawodnikowi, tylko gdy wybrany dzień jest `warsawToday` i zgłoszenie jest potwierdzone. Podmiana woła istniejące `onPhotoSelected`, więc potwierdzenie schodzi w momencie wyboru pliku, a nie przy samym otwarciu dnia.

## Critical Implementation Details

- **State sequencing:** RPC `begin` czyści `confirmed_at` zanim `begin.ts` usunie obiekt. Nie dodawać osobnego kroku „zacznij podmianę” przed wyborem pliku. Gdy `remove` obiektu zwróci błąd, wiersz zostaje niepotwierdzony; potwierdzenia się nie przywraca, bo obiekt mógł już zniknąć (`begin.ts:42-45` już oddaje wtedy 500 z `cleared: true`).
- **User experience spec:** akcje dnia treningu biorą `warsawToday` z serwera (`MonthCalendar.tsx:515`), a nie `localTodayCivil()` używane przy przeszłości w przeglądarce (`:110-113`, `:513`).
- Trasa usuwania sprawdza sesję jak `begin.ts` i zwraca JSON 401. Nie wchodzi do `PROTECTED_ROUTES` i nie woła `photoConfigError()`, bo ta funkcja wymaga też `OPENROUTER_API_KEY` (`src/lib/training-photo.ts:29-33`). Do usunięcia obiektu wystarcza klient service role.

---

## Faza 1: Okno w bazie i trasach

### Overview

Zawodnik w dniu treningu może wycofać potwierdzenie drugim `begin` i usunąć własne zgłoszenie. Wczorajsze wywołania oraz wywołania trenera i innego zawodnika zostawiają wiersz właściciela. Ranking i lista trenera wynikają z istniejącego odczytu potwierdzonych kilometrów.

### Changes Required:

#### 1. Migracja okna

**File**: `supabase/migrations/20261019120000_athlete_photo_edit_window.sql`

**Intent**: Dodać regułę FR-009 po stronie bazy, bez ruszania starych migracji i bez czyszczenia lokalnych wierszy.

**Contract**: `create or replace` dla `public.begin_training_photo(date)`. Gdy wiersz wywołującego istnieje, a data jest warszawskim dniem treningu, funkcja zeruje `model_distance_km`, `model_duration_seconds`, `model_max_speed_kmh`, `distance_km`, `duration_seconds`, `max_speed_kmh`, `athlete_edited`, `confirmed_at` i `submitter_display_name`, zostawia `storage_path` i go zwraca. Zdanie `To zdjęcie jest już potwierdzone.` przy tej ścieżce znika. Sprawdzenie daty i roli zostaje przed tą aktualizacją i dalej rzuca `Zdjęcie można wgrać tylko w dniu treningu.` oraz `Tylko zawodnik może dodać zdjęcie treningu.`

Nowa `public.delete_training_photo(training_on date) returns text`, `security definer`, `search_path = public`. Wywołujący musi być zawodnikiem swojego zespołu. Data musi równać się warszawskiemu dziś, inaczej to samo zdanie o dniu treningu. Brak własnego wiersza rzuca `Tego dnia nie ma zdjęcia.` Funkcja usuwa wiersz wywołującego i zwraca jego `storage_path`. `revoke all` od `public` i `anon`, `grant execute` dla `authenticated`. Polityk RLS dla DELETE nie dodajemy.

#### 2. Trasa usunięcia

**File**: `src/pages/api/trainings/photo/delete.ts`

**Intent**: Dać zawodnikowi jeden endpoint, który wycofuje zgłoszenie i plik.

**Contract**: `POST` JSON `{ training_on }`, odczyt daty przez `readTrainingOn`. Bez sesji: 401 `Zaloguj się.` RPC `delete_training_photo` błędem: 400 z treścią wyjątku. Potem `storage.from("training-photos").remove([path])` klientem service role. Sukces: 200. Błąd Storage po skasowanym wierszu: 500, bez wstawiania wiersza z powrotem. Middleware i `PROTECTED_ROUTES` zostają bez tej trasy.

#### 3. Testy okna

**File**: `tests/photo-edit-window.test.ts`

**Intent**: Spiąć odmowę, podmianę, usunięcie i skutek w rankingu oraz na liście trenera z działającym lokalnym aplikacyjnym HTTP.

**Contract**: Vitest i `withTeamFixture`, bez wołania trasy odczytu modelu. Przypadki:

- Dziś, po potwierdzeniu `6.5`, drugi `begin` zwraca 200, a wiersz ma puste `confirmed_at` i puste `distance_km`. Ranking tego zawodnika pokazuje `0 km`, dopóki nie potwierdzi ponownie. Po `recordTrainingReadout` i potwierdzeniu `4` suma w `GET /ranking` pokazuje `4`, a starych `6.5` na liście nie ma.
- Dziś, po potwierdzeniu, `POST /api/trainings/photo/delete` zwraca 200, `readTrainingSubmission` daje `null`, `GET /ranking` pokazuje `0 km`, a `GET /calendar?date=` tego dnia na sesji trenera ma przy tym imieniu `Nie oddał`. Kolejny `begin` tego samego dnia znowu zwraca podpisany URL.
- Trening na dziś i trening na jutro: drugi `begin` dziś dalej zwraca 200.
- Wczoraj: `insertTraining` plus `insertConfirmedSubmission`. `begin` i `delete` zwracają 400 z treścią `Zdjęcie można wgrać tylko w dniu treningu.` Wiersz, `distance_km` i `confirmed_at` zostają.
- Trener oraz drugi zawodnik wołają `delete` na dzień właściciela. Wiersz właściciela zostaje. Trener dostaje odmowę roli. Drugi zawodnik bez własnego wiersza dostaje `Tego dnia nie ma zdjęcia.`

**File**: `tests/submission-rejection.test.ts`

**Intent**: Zdjąć utrwaloną odmowę drugiego `begin` w dniu treningu, bo FR-009 ją zastępuje.

**Contract**: Test z linii 94–138 przestaje oczekiwać 400 i `To zdjęcie jest już potwierdzone.` Ten przypadek pokrywa `tests/photo-edit-window.test.ts`. Pozostałe odmowy w tym pliku zostają.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` nakłada `20261019120000_athlete_photo_edit_window.sql` i nie czyści istniejących wierszy
- `npm test` dla podmiany w warszawskim dniu treningu zdejmuje `confirmed_at` przy drugim `begin`, a ponowne potwierdzenie z innym `distance_km` zmienia sumę w rankingu
- `npm test` dla usunięcia w tym samym dniu kasuje wiersz zgłoszenia: ranking pokazuje `0 km`, a kalendarz trenera mówi `Nie oddał`
- `npm test` zostawia otwarte okno, gdy trener ma już trening na jutro
- `npm test` dla wczorajszego potwierdzonego zgłoszenia odrzuca `begin` i usunięcie zdaniem `Zdjęcie można wgrać tylko w dniu treningu.` i zostawia wiersz
- `npm test` dla trenera i drugiego zawodnika nie usuwa wiersza właściciela
- `npm run lint` przechodzi

**Implementation Note**: Po zielonych testach tej fazy przejdź do fazy 2. Osobnego sprawdzenia ręcznego tu nie ma.

---

## Faza 2: Przyciski w kalendarzu

### Overview

Zawodnik widzi podmianę i usunięcie przy dzisiejszym potwierdzonym zdjęciu. Wczorajszy dzień zostaje tylko do odczytu. Po usunięciu dzień wygląda jak przed pierwszym wgraniem.

### Changes Required:

#### 1. Akcje przy potwierdzonym zdjęciu

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Pokazać FR-009 tam, gdzie zawodnik już oddaje zdjęcie, i schować akcje poza dniem treningu.

**Contract**: Gdy `athleteCanUpload` i zgłoszenie ma `confirmedAt`, w miejscu ukrytego inputu jest etykieta `Podmień zdjęcie`, input pliku wołający istniejące `onPhotoSelected`, oraz przycisk `Usuń zdjęcie` (`variant="destructive"`), który wysyła `POST /api/trainings/photo/delete` z `training_on` wybranego dnia. Sukces czyści lokalny stan zdjęcia tego dnia, więc widać zwykłe pierwsze wgranie. Błąd z JSON `error` widać przy dniu. Podczas żądania przycisk jest wyłączony i ma napis `Usuwanie…`. Gdy `athleteCanUpload` jest fałszywe, tych dwóch napisów w odpowiedzi nie ma, także przy wczorajszym potwierdzonym zgłoszeniu oglądanym w kalendarzu.

### Success Criteria:

#### Automated Verification:

- `npm test` dla kalendarza zawodnika w dniu potwierdzonego treningu zawiera `Podmień zdjęcie` i `Usuń zdjęcie`, a dla wczorajszego dnia tych napisów nie ma
- `npm test` przechodzi
- `npm run lint` przechodzi

#### Manual Verification:

- Zawodnik na telefonie w dniu treningu podmienia zdjęcie, potwierdza nowy odczyt i widzi swoje przesunięte miejsce w rankingu
- Zawodnik usuwa zdjęcie, trener widzi przy nim `Nie oddał` i nie ma podglądu tego pliku, a po północy warszawskiej oba napisy znikają

**Implementation Note**: Po zielonym `npm test` i `npm run lint` zatrzymaj się, aż człowiek potwierdzi oba punkty ręczne.

---

## Testing Strategy

### Unit Tests:

- Brak osobnych testów jednostkowych. Reguła daty i własności wiersza siedzi w RPC i jest sprawdzana przez HTTP.

### Integration Tests:

- `tests/photo-edit-window.test.ts` pokrywa podmianę, usunięcie, jutrzejszy trening, wczorajszy dzień oraz odmowę trenera i kolegi.
- `tests/submission-rejection.test.ts` zostawia odmowy inne niż drugi `begin` po potwierdzeniu w dniu treningu.
- Odczyt modelu w testach dalej idzie przez `recordTrainingReadout`.

### Manual Testing Steps:

1. Zaloguj zawodnika, otwórz dzisiejszy trening z potwierdzonym zdjęciem i sprawdź `Podmień zdjęcie` oraz `Usuń zdjęcie`.
2. Podmień zdjęcie, potwierdź inny odczyt kilometrów i odśwież ranking.
3. Usuń zdjęcie, odśwież kalendarz trenera i sprawdź `Nie oddał` oraz brak podglądu.
4. Otwórz wczorajszy dzień tego zawodnika i sprawdź, że obu napisów nie ma.

## Performance Considerations

Jedno własne zgłoszenie na żądanie. Ranking zostaje przy obecnym `team_km_ranking`.

## Migration Notes

Nakładaj `npx supabase migration up`. Nie uruchamiaj `supabase db reset` i nie kasuj istniejących zgłoszeń. Stare potwierdzone wiersze zostają, dopóki właściciel sam ich nie ruszy w dniu treningu. Wczorajszych wierszy ta migracja nie przelicza.

## References

- PRD: `context/foundation/prd.md` FR-009, FR-006, FR-014 oraz guardrail „po dniu treningu”
- Roadmap: `context/foundation/roadmap.md` S-06
- Podobne wgranie: `src/pages/api/trainings/photo/begin.ts:29-52`
- Bramka daty: `supabase/migrations/20261001171356_training_photo.sql:70-93`
- Ranking: `supabase/migrations/20261003120000_immediate_km_ranking.sql:31-39`
- Lista trenera: `src/components/calendar/MonthCalendar.tsx:899-911`
- Test do podmiany znaczenia: `tests/submission-rejection.test.ts:94-138`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Okno w bazie i trasach

#### Automated

- [x] 1.1 `npx supabase migration up` nakłada `20261019120000_athlete_photo_edit_window.sql` i nie czyści istniejących wierszy
- [x] 1.2 `npm test` dla podmiany w warszawskim dniu treningu zdejmuje `confirmed_at` przy drugim `begin`, a ponowne potwierdzenie z innym `distance_km` zmienia sumę w rankingu
- [x] 1.3 `npm test` dla usunięcia w tym samym dniu kasuje wiersz zgłoszenia: ranking pokazuje `0 km`, a kalendarz trenera mówi `Nie oddał`
- [x] 1.4 `npm test` zostawia otwarte okno, gdy trener ma już trening na jutro
- [x] 1.5 `npm test` dla wczorajszego potwierdzonego zgłoszenia odrzuca `begin` i usunięcie zdaniem `Zdjęcie można wgrać tylko w dniu treningu.` i zostawia wiersz
- [x] 1.6 `npm test` dla trenera i drugiego zawodnika nie usuwa wiersza właściciela
- [x] 1.7 `npm run lint` przechodzi

### Phase 2: Przyciski w kalendarzu

#### Automated

- [ ] 2.1 `npm test` dla kalendarza zawodnika w dniu potwierdzonego treningu zawiera `Podmień zdjęcie` i `Usuń zdjęcie`, a dla wczorajszego dnia tych napisów nie ma
- [ ] 2.2 `npm test` przechodzi
- [ ] 2.3 `npm run lint` przechodzi

#### Manual

- [ ] 2.4 Zawodnik na telefonie w dniu treningu podmienia zdjęcie, potwierdza nowy odczyt i widzi swoje przesunięte miejsce w rankingu
- [ ] 2.5 Zawodnik usuwa zdjęcie, trener widzi przy nim `Nie oddał` i nie ma podglądu tego pliku, a po północy warszawskiej oba napisy znikają
