# Ranking, odrzucenie zgłoszenia i data treningu — plan testów

## Overview

Faza 2 planu testów udowadnia trzy ryzyka na działającym `npm run dev` i lokalnym Supabase: ranking liczy tylko potwierdzone kilometry właściwych osób, zgłoszenie poza regułami nie wchodzi, a data treningu odrzuca wstecz i duplikat. Suite jest Vitest w Node, HTTP, bez przeglądarki i bez żywego modelu. Kontrakt sprzątania zostaje ten z `preserve-local-test-data`: własne zasoby, wcześniejsze dane nietknięte.

## Current State Analysis

Runner, fixture trenera i trzech zawodników (`Potwierdza`, `Wgrywa`, `Milczy`) oraz wyrocznia `<li>` już są. `tests/attendance-today.test.ts` woła `GET /ranking` tylko po przypomnienie o treningu, nie po miejsca ani kilometry. `tests/training-actions.test.ts` tworzy, poprawia i usuwa dzisiejszy trening bez zgłoszenia. Nie ma asercji remisu, niepotwierdzonego odczytu, odrzucenia kilometrów, dnia bez treningu, drugiego zdjęcia po potwierdzeniu, daty wstecznej, duplikatu dnia ani usunięcia dnia minionego.

`team_km_ranking()` sumuje `distance_km` przy `confirmed_at` i `training_on` mniejszym albo równym warszawskiemu dniu w chwili odczytu. Funkcja nie przyjmuje daty. Trener jest poza listą. `0` to brak takiego wiersza, nie wyzerowanie wcześniejszych kilometrów. `record_training_readout` zapisuje kilometry jeszcze przed potwierdzeniem; ten wiersz do sumy nie wchodzi.

`POST /api/trainings/photo/confirm` odrzuca brak kilometrów i `0` zanim sprawdzi plik. Dzień bez treningu nic nie wstawia. Drugie `begin` po potwierdzeniu nie wstawia drugiego wiersza. `create_training` odrzuca dzień wcześniejszy i mapuje drugi trening tego dnia na osobny komunikat. `delete_training` odrzuca tylko datę wcześniejszą niż warszawskie dziś; dziś i przyszłość kasują zgłoszenia kaskadą. FR-002 chce usuwania wyłącznie daty przyszłej. Ta faza tej luki asercją nie zamyka.

## Desired End State

`npm test` na działającym dev serverze przechodzi razem z dotychczasowymi testami i sprząta własne zasoby.

Dla treningu na dziś w Warszawie strona rankingu wiąże `Potwierdza ${runId}` i `Wgrywa ${runId}` ze wspólnym miejscem `1` i tekstem `5 km`, w tej kolejności. `Milczy ${runId}` jest na miejscu `3` z tekstem `0 km`. Imienia trenera na liście nie ma. Potwierdzone `100` km z przyszłego dnia nie podnosi sumy `Potwierdza`. Niepotwierdzony odczyt `6,5` u `Wgrywa` zostawia na liście `0 km`.

Potwierdzenie bez kilometrów, z `null` albo z `0` zwraca 400 i zostawia `confirmed_at` puste. Potwierdzenie warszawskiego dziś bez treningu zwraca 400 `Tego dnia nie ma treningu.` i nie wstawia wiersza. Drugie `begin` po potwierdzeniu zwraca 400 `To zdjęcie jest już potwierdzone.` i zostawia jeden wiersz.

Utworzenie treningu na `warsawYesterday()` zwraca 400 `Trening można dodać, zmienić albo usunąć tylko na dziś lub później.` i nie wstawia wiersza. Drugie utworzenie tego samego dnia zwraca 400 `Tego dnia trening już jest.` i zostawia jeden wiersz. Usunięcie wczorajszego treningu ze zgłoszeniem zwraca 400 i zgłoszenie zostaje. Usunięcie dzisiejszego treningu ze zgłoszeniami nie dostaje asercji.

§6.4 i §6.5 w `context/foundation/test-plan.md` opisują te wyrocznie. `supabase/seed.sql` zostaje puste domenowo.

### Key Discoveries:

- Suma i miejsce są w `team_km_ranking()` (`supabase/migrations/20261003120000_immediate_km_ranking.sql`). Strona tylko sortuje gotowe wiersze po kilometrach, potem `localeCompare(..., "pl")`, potem `user_id` (`src/pages/ranking.astro`).
- Tekst kilometrów to `Intl.NumberFormat("pl-PL")` plus ` km`: `5` to `5 km`, `0` to `0 km`, `6.5` to `6,5 km` (`src/pages/ranking.astro`).
- Wyrocznia listy to `listItemContaining` w `tests/support.ts`. Imię nie może być podciągiem innego.
- `begin` zwraca 503 bez niepustego `OPENROUTER_API_KEY`. Sprawdzenie kilometrów w `confirm` tego klucza nie potrzebuje (`src/pages/api/trainings/photo/confirm.ts`, `src/pages/api/trainings/photo/begin.ts`).
- Dzień przyszły i dzień miniony, których RPC produktu nie przyjmie, wstawia service role. Tak robi już test dnia minionego.
- JSON-owa odpowiedź treningu to `Accept: application/json` i formularz, jak `tests/training-actions.test.ts`. Treść błędu jest w `{ error }`.

## What We're NOT Doing

- Poprawka produktu pod FR-002. Usunięcie dziś albo w przyszłości, ze zgłoszeniami albo bez, nie dostaje nowej asercji. Istniejący test usuwa dziś bez zgłoszenia i zostaje.
- Asercja, że kaskada dziś jest zamierzona. Luka zostaje opisana, nie utrwalona jako oczekiwane 200.
- Remis „zgodny z PRD”. PRD remisu nie definiuje. Wyrocznią jest wspólne miejsce i polska kolejność z kodu oraz archiwum rankingu.
- Publikacja rankingu następnego dnia. Obcięcie `training_on < dziś` jest starym ciałem funkcji.
- Podmiana zdjęcia tego samego dnia. To S-06.
- Cudzy dostęp do zdjęcia. To faza 3 planu testów.
- Bramka CI. To faza 4 planu testów.
- Żywy model, trasa `POST /api/trainings/photo/readout`, Playwright i kopia `team_km_ranking()` w TypeScripcie.
- Nowa migracja i dane domenowe w `supabase/seed.sql`.

## Implementation Approach

Każdy test idzie przez `withTeamFixture` i rejestr przebiegu. Wyrocznia rankingu to `GET /ranking` z ciasteczkami trenera: miejsce, pełne imię i tekst kilometrów siedzą w tym samym `<li>`. Liczby są literalne (`5`, `0`, `100`, `6.5`), nie policzone drugą implementacją sumy. Odrzucenie zgłoszenia i daty czyta status HTTP, polski `error` i wiersz service role.

Kolejność: najpierw ranking, bo domyka sumę i remis; potem trzy różne skutki odrzucenia zgłoszenia; potem data treningu bez luki FR-002; na końcu cookbook, gdy asercje już stoją.

## Critical Implementation Details

**Dzień rankingu nie jest argumentem.** Fixture stawia `training_on` względem `warsawToday()` i następnego dnia cywilnego, nie przez dodanie 24 godzin. Przyszłe potwierdzone kilometry powstają insertem service role, bo `confirm_training_photo` przyjmuje tylko warszawskie dziś.

**Remis na trzech imionach fixture.** `Potwierdza` i `Wgrywa` mają po potwierdzone `5` km z dziś. Oba `<li>` zawierają miejsce `1` i `5 km`. W dokumencie `Potwierdza` jest przed `Wgrywa`. `Milczy` bez wiersza ma miejsce `3` i `0 km`. Miejsce `2` nie występuje. Drugi przebieg, nie ten sam układ, pokazuje wykluczenie: przyszłe `100` km nie zmienia `5 km` u `Potwierdza`, a niepotwierdzone `6,5` u `Wgrywa` zostaje `0 km` i nie pokazuje `6,5 km`.

**Klucz odczytu.** Przypadek drugiego `begin` i niepotwierdzonego odczytu woła `begin`, więc proces dev musi mieć niepusty `OPENROUTER_API_KEY`. Odpowiedź 503 nie jest odrzuceniem zgłoszenia. Potwierdzenie z pustymi kilometrami i potwierdzenie bez treningu tego klucza nie używają.

## Phase 1: Odczyt rankingu

### Overview

Udostępnia ryzyko #3: suma, zero, brak trenera, dzisiejsze kilometry, wykluczenie przyszłości i niepotwierdzonego odczytu oraz remis według kodu.

### Changes Required:

#### 1. Test rankingu

**File**: `tests/ranking-readout.test.ts`

**Intent**: Dwa przebiegi fixture czytają `GET /ranking` trenera i porównują literalne miejsca oraz kilometry w `<li>` pełnego imienia.

**Contract**: Pierwszy przebieg potwierdza po `5` km u `Potwierdza ${runId}` i `Wgrywa ${runId}` na `warsawToday()`, bez wiersza u `Milczy ${runId}`. Wspólne miejsce to `1`, następne to `3`, kolejność dokumentu to `Potwierdza` przed `Wgrywa`, a imienia trenera w elementach listy nie ma. Drugi przebieg dokłada service role przyszły trening i potwierdzone `100` km tego samego `Potwierdza`; suma na stronie zostaje `5 km`. `Wgrywa` ma `begin`, wgranie jak w teście obecności i `record_training_readout` z `6.5`, bez `confirm` i bez trasy `readout`; jego `<li>` ma `0 km` i nie zawiera `6,5`. Oba przebiegi używają `listItemContaining`.

### Success Criteria:

#### Automated Verification:

- `npm test` wiąże `Potwierdza` i `Wgrywa` z miejscem 1 i `5 km` z dzisiejszego potwierdzenia, stawia `Potwierdza` przed `Wgrywa`, a `Milczy` na miejscu 3 z `0 km`; imienia trenera na liście nie ma
- `npm test` zostawia `Potwierdza` przy `5 km`, gdy istnieje przyszłe potwierdzone `100` km, i pokazuje `Wgrywa` przy `0 km` po niepotwierdzonym odczycie `6.5`
- `npm run lint` przechodzi

**Implementation Note**: Po zielonych kryteriach automatycznych tej fazy przejdź do fazy 2. Ręcznego sprawdzenia konta użytkownika ta faza nie wymaga.

---

## Phase 2: Odrzucenie zgłoszenia

### Overview

Udostępnia ryzyko #4 trzema różnymi skutkami zapisu, nie jedną szczęśliwą ścieżką zdjęcia.

### Changes Required:

#### 1. Test odrzucenia

**File**: `tests/submission-rejection.test.ts`

**Intent**: Pokazać, co zostaje w danych, gdy kilometry są puste, gdy nie ma treningu i gdy zdjęcie jest już potwierdzone.

**Contract**: Po `begin` na `warsawToday()` `POST /api/trainings/photo/confirm` z pominiętym `distance_km`, z `null` i z `0` zwraca 400, a `confirmed_at` tego wiersza zostaje puste. Wgranie nie jest wymagane, bo sprawdzenie kilometrów jest przed sprawdzeniem pliku. Bez treningu na warszawskie dziś ten sam `confirm` zwraca 400 i `{ error: "Tego dnia nie ma treningu." }`, a wiersza zgłoszenia nie ma. Po potwierdzonym wierszu drugie `POST /api/trainings/photo/begin` zwraca 400 i `{ error: "To zdjęcie jest już potwierdzone." }`; zostaje jeden wiersz, z tym samym `confirmed_at`. Ten ostatni przypadek wymaga niepustego `OPENROUTER_API_KEY`. Test nie woła trasy `readout`.

### Success Criteria:

#### Automated Verification:

- `npm test` dla pominiętych kilometrów, `null` i `0` zwraca 400 i zostawia `confirmed_at` puste
- `npm test` dla warszawskiego dziś bez treningu zwraca 400 `Tego dnia nie ma treningu.` i nie wstawia zgłoszenia
- `npm test` dla drugiego `begin` po potwierdzeniu zwraca 400 `To zdjęcie jest już potwierdzone.` i zostawia jeden wiersz
- `npm run lint` przechodzi

**Implementation Note**: Po zielonych kryteriach automatycznych tej fazy przejdź do fazy 3.

---

## Phase 3: Data treningu

### Overview

Udostępnia ryzyko #6 tam, gdzie funkcja naprawdę odrzuca zapis. Luka FR-002 dla dziś zostaje poza asercją.

### Changes Required:

#### 1. Test daty

**File**: `tests/training-date-rules.test.ts`

**Intent**: Odrzucenie daty wstecznej, drugiego treningu tego dnia i usunięcia dnia minionego, ze sprawdzeniem wierszy, nie tylko statusu.

**Contract**: `POST /api/trainings/create` i `POST /api/trainings/delete` idą jak w `tests/training-actions.test.ts`: formularz, `Accept: application/json`, ciasteczka trenera. Utworzenie na `warsawYesterday()` zwraca 400 i `{ error: "Trening można dodać, zmienić albo usunąć tylko na dziś lub później." }`; wiersza treningu nie ma. Drugie utworzenie tego samego `training_on` zwraca 400 i `{ error: "Tego dnia trening już jest." }`; zostaje jeden wiersz. Wczorajszy trening i jedno potwierdzone zgłoszenie wstawia service role. `delete` tej daty zwraca 400 z tym samym zdaniem o dacie, a zgłoszenie zostaje. Test nie wysyła `delete` dla dziś ani przyszłości, gdy zgłoszenie istnieje, i nie dopisuje zgłoszenia do istniejącego testu usuwania dziś.

### Success Criteria:

#### Automated Verification:

- `npm test` dla utworzenia na `warsawYesterday()` zwraca 400 ze zdaniem o dacie i nie wstawia treningu
- `npm test` dla drugiego utworzenia tego samego dnia zwraca 400 `Tego dnia trening już jest.` i zostawia jeden trening
- `npm test` dla usunięcia wczorajszego treningu ze zgłoszeniem zwraca 400 i zgłoszenie zostaje
- `npm run lint` przechodzi

**Implementation Note**: Po zielonych kryteriach automatycznych tej fazy przejdź do cookbooku. Nie dopisuj asercji kaskady ani odrzucenia usunięcia dziś.

---

## Phase 4: Cookbook

### Overview

Zapisuje wyrocznie, które ta faza naprawdę postawiła, żeby następny test nie wrócił do zdania o remisie z PRD ani do odrzucenia usunięcia ze zgłoszeniami.

### Changes Required:

#### 1. Notatki planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Uzupełnić §6.4 o odczyt rankingu i zastąpić TBD w §6.5 regułami odrzucenia oraz daty.

**Contract**: §6.4 mówi, że `GET /ranking` czyta miejsce, pełne imię i tekst kilometrów w jednym `<li>`; `0 km` to brak potwierdzonego wiersza do warszawskiego dnia odczytu; przyszłe i niepotwierdzone kilometry nie wchodzą; remis to wspólne miejsce i polska kolejność z kodu oraz archiwum, nie z PRD. §6.5 nazywa trzy skutki zgłoszenia (puste kilometry zostawiają niepotwierdzony wiersz, brak treningu nic nie wstawia, drugie `begin` po potwierdzeniu nie wstawia drugiego wiersza) oraz trzy odrzucenia daty. Osobne zdanie mówi, że usunięcie dziś lub później ze zgłoszeniami nie ma asercji, bo kod kasuje je kaskadą, a FR-002 dla dziś jest niespełnione. Reszta §6 zostaje.

### Success Criteria:

#### Automated Verification:

- `git diff --check` przechodzi, a §6.4 i §6.5 zawierają wyrocznię rankingu, trzy skutki zgłoszenia, trzy odrzucenia daty, remis spoza PRD i brak asercji dla usunięcia dziś ze zgłoszeniami
- `supabase/seed.sql` pozostaje bez danych domenowych

#### Manual Verification:

- Czytelnik §6.5 widzi, że usunięcie dzisiejszego treningu ze zgłoszeniami nie jest oczekiwanym odrzuceniem

**Implementation Note**: To ostatnia faza. Po niej zmiana jest gotowa do przeglądu implementacji, nie do archiwum, dopóki ten ręczny odczyt cookbooku nie jest zrobiony.

---

## Testing Strategy

### Unit Tests:

- Brak nowej kopii sumy albo reguły daty w TypeScripcie. Taki test powtórzyłby funkcję, której nie uruchamia.

### Integration Tests:

- `tests/ranking-readout.test.ts` — ryzyko #3, w tym remis i wykluczenie niepotwierdzonego oraz przyszłego wiersza.
- `tests/submission-rejection.test.ts` — ryzyko #4, trzy skutki zapisu.
- `tests/training-date-rules.test.ts` — ryzyko #6, bez usunięcia dziś ze zgłoszeniami.
- Dotychczasowe pliki w `tests/` zostają zielone, łącznie z usunięciem dziś bez zgłoszenia.

### Manual Testing Steps:

1. Otwórz §6.5 i sprawdź, że luka FR-002 jest opisana jako brak asercji, nie jako oczekiwane 200 ani oczekiwane 400.

## Performance Considerations

Brak nowej ścieżki produktu. Testy dodają kilka przebiegów HTTP do lokalnego dev servera i mieszczą się w dotychczasowym `npm test`.

## Migration Notes

Brak migracji. Dzień przyszły i dzień miniony powstają insertem service role w teście, nie w repozytorium schematu. `supabase/seed.sql` zostaje puste domenowo. Istniejących wierszy test nie aktualizuje poza własnym, zarejestrowanym przebiegiem.

## References

- Research: `context/changes/testing-ranking-submission-and-dates/research.md`
- Plan testów, faza 2, ryzyka #3, #4 i #6: `context/foundation/test-plan.md`
- Suma i miejsce: `supabase/migrations/20261003120000_immediate_km_ranking.sql`
- Stare obcięcie następnego dnia: `supabase/migrations/20261003110000_team_km_ranking.sql`
- Strona rankingu: `src/pages/ranking.astro`
- Potwierdzenie i brak treningu: `supabase/migrations/20261002224800_coach_sees_submissions.sql`, `src/pages/api/trainings/photo/confirm.ts`
- Drugie begin i odczyt przed potwierdzeniem: `supabase/migrations/20261001171356_training_photo.sql`, `src/pages/api/trainings/photo/begin.ts`
- Data treningu i kaskada: `supabase/migrations/20260928200436_coach_trainings.sql`
- Fixture i `<li>`: `tests/support.ts`
- JSON treningu: `tests/training-actions.test.ts`
- Remis w archiwum, nie w PRD: `context/archive/2026-10-03-km-ranking-publication/plan.md`
- Kontrakt sprzątania: `context/archive/2026-10-15-preserve-local-test-data/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Odczyt rankingu

#### Automated

- [x] 1.1 `npm test` wiąże `Potwierdza` i `Wgrywa` z miejscem 1 i `5 km` z dzisiejszego potwierdzenia, stawia `Potwierdza` przed `Wgrywa`, a `Milczy` na miejscu 3 z `0 km`; imienia trenera na liście nie ma — aeeabf8
- [x] 1.2 `npm test` zostawia `Potwierdza` przy `5 km`, gdy istnieje przyszłe potwierdzone `100` km, i pokazuje `Wgrywa` przy `0 km` po niepotwierdzonym odczycie `6.5` — aeeabf8
- [x] 1.3 `npm run lint` przechodzi — aeeabf8

### Phase 2: Odrzucenie zgłoszenia

#### Automated

- [x] 2.1 `npm test` dla pominiętych kilometrów, `null` i `0` zwraca 400 i zostawia `confirmed_at` puste
- [x] 2.2 `npm test` dla warszawskiego dziś bez treningu zwraca 400 `Tego dnia nie ma treningu.` i nie wstawia zgłoszenia
- [x] 2.3 `npm test` dla drugiego `begin` po potwierdzeniu zwraca 400 `To zdjęcie jest już potwierdzone.` i zostawia jeden wiersz
- [x] 2.4 `npm run lint` przechodzi

### Phase 3: Data treningu

#### Automated

- [ ] 3.1 `npm test` dla utworzenia na `warsawYesterday()` zwraca 400 ze zdaniem o dacie i nie wstawia treningu
- [ ] 3.2 `npm test` dla drugiego utworzenia tego samego dnia zwraca 400 `Tego dnia trening już jest.` i zostawia jeden trening
- [ ] 3.3 `npm test` dla usunięcia wczorajszego treningu ze zgłoszeniem zwraca 400 i zgłoszenie zostaje
- [ ] 3.4 `npm run lint` przechodzi

### Phase 4: Cookbook

#### Automated

- [ ] 4.1 `git diff --check` przechodzi, a §6.4 i §6.5 zawierają wyrocznię rankingu, trzy skutki zgłoszenia, trzy odrzucenia daty, remis spoza PRD i brak asercji dla usunięcia dziś ze zgłoszeniami
- [ ] 4.2 `supabase/seed.sql` pozostaje bez danych domenowych

#### Manual

- [ ] 4.3 Czytelnik §6.5 widzi, że usunięcie dzisiejszego treningu ze zgłoszeniami nie jest oczekiwanym odrzuceniem
