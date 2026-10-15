# Ochrona lokalnych danych — Implementation Plan

## Overview

Zachować lokalne konto użytkownika, zespoły, treningi, zgłoszenia i zdjęcia podczas pracy agentów oraz testowania aplikacji. Testy mają sprzątać wyłącznie zasoby utworzone przez swój przebieg, także po błędzie, bez resetowania bazy.

## Current State Analysis

`AGENTS.md` i reguła Cursor już zakazują resetu i usuwania wcześniejszych danych. W aktualnych testach i smoke nie znaleziono resetu ani kasowania bazy; nie potwierdzono przyczyny zgłaszanej wcześniejszej utraty danych. Archiwalne plany zawierają instrukcje resetowania, których nie wolno traktować jako aktualnej procedury.

Vitest i smoke tworzą konta i zespoły, ale nie sprzątają. `tests/support.ts` nadaje przebiegowi UUID, lecz nie przechowuje kompletu identyfikatorów Auth, domeny i Storage ani rejestru trwałego. Aktywny plan wcześniejszej zmiany wymaga wręcz pozostawiania fixture. Konfiguracja przyjmuje zdalne adresy; aplikacja i klient service role mogą wskazywać różne instancje.

Usunięcie konta trenera może kaskadowo usunąć zespół i jego dane. Usunięcie rekordów SQL nie usuwa automatycznie plików Storage. Test dnia dzisiejszego wgrywa dwa rzeczywiste zdjęcia; test dnia minionego zapisuje tylko ścieżkę.

## Desired End State

`npm test` i `npm run smoke` tworzą własne dane lokalne i sprzątają je po sukcesie i błędzie, również przy częściowo wykonanym setupie. Istniejące wcześniej konta, sesje, rekordy i zdjęcia pozostają nienaruszone. Test nie korzysta z konta ani sesji użytkownika do przygotowania danych.

Każdy przebieg zapisuje rejestr własności w gitignorowanym `.test-runs/<run-id>.json`. `npm run test:cleanup -- <run-id>` wznawia sprzątanie jednego zakończonego lub przerwanego przebiegu. Brak dowodu własności oznacza pominięcie zasobu i jawny błąd, a nie poszerzenie zakresu kasowania. Stare dane testowe bez rejestru pozostają.

### Key Discoveries:

- `tests/support.ts:109`: UUID przebiegu i osobny zespół stanowią punkt wyjścia do izolacji.
- `tests/support.ts:23`: użytkownik fixture nie zawiera identyfikatora Auth.
- `tests/attendance-today.test.ts:38`: dwa uploady wymagają sprzątania Storage.
- `scripts/smoke.mjs:202`: obecne wykonanie nie ma teardown ani obsługi wyjątków obejmującej sprzątanie.
- `vitest.config.ts:3`: adres aplikacji dopuszcza dowolny origin HTTP(S).
- `context/changes/testing-attendance-and-confirm/plan.md:238`: poprzedni kontrakt pozostawia dane testowe.
- `supabase/migrations/20260926162547_team_role_for_one_squad.sql:10`: kaskada z konta trenera wymaga sprawdzenia całego zakresu przed usuwaniem.
- `.github/workflows/ci.yml:55`: usuwanie stosu CI dotyczy jednorazowego runnera, nie lokalnej bazy dewelopera.

## What We're NOT Doing

- Reset, TRUNCATE, usuwanie wolumenów Dockera, odtwarzanie seedów ani masowe kasowanie danych.
- Sprzątanie starych kont na podstawie prefiksów nazw lub e-maili.
- Odzyskiwanie wcześniej skasowanych danych, tworzenie konta dewelopera lub zmiana jego hasła.
- Globalny hook blokujący polecenia agentów albo gwarancja ochrony przed dowolnym ręcznym SQL.
- Testy zapisujące na środowiskach zdalnych.
- Zmiany biznesowych zasad usuwania treningów, interfejsu użytkownika lub długości sesji Auth.
- Przepisywanie archiwalnych dokumentów i wykonanych kroków poprzednich planów.

## Implementation Approach

Wspólny moduł Node obsługuje własność zasobów, lokalne środowisko i sprzątanie dla TypeScript/Vitest oraz smoke JavaScript. Publiczny kontrakt testowy jest niezależny od modułów Astro; klucz uprzywilejowany pozostaje wyłącznie po stronie procesu narzędzi, poza kodem i bundlem aplikacji. Aplikacja nadal odczytuje swoje sekrety przez `astro:env/server`.

Rejestr zawiera wersję formatu, UUID przebiegu, tożsamość lokalnego środowiska, status i dokładne identyfikatory utworzonych zasobów oraz ich relacje. Nie zawiera haseł, kluczy, ciasteczek ani podpisanych URL-i. Operacje mają stan przygotowany/utworzony/usunięty lub nierozstrzygnięty, a aktualizacje rejestru są atomowe i odizolowane między przebiegami.

Przed tworzeniem danych sprawdzić oba adresy: tylko dosłowne adresy pętli zwrotnej `localhost`, `127.0.0.1` i `::1`, bez poświadczeń URL i bez podążania za przekierowaniami poza środowisko. Sama lokalność obu adresów nie dowodzi wspólnej bazy: po utworzeniu własnego konta potwierdzić jego tożsamość po stronie service role, zanim rozpocznie się tworzenie domeny. Niezgodność przerywa test i nie uruchamia kasowania w innej bazie. Komenda odzyskiwania wymaga zgodności bieżącego środowiska z rejestrem.

Sprzątanie usuwa zarejestrowane pliki przez API Storage, potem zależne rekordy domenowe i konta Auth. Przed kaskadą sprawdza, czy nie obejmie nieznanych zasobów; w razie wątpliwości zatrzymuje się i raportuje problem. Brak zasobu jest poprawnym wynikiem ponownego sprzątania. Błąd pozostawia rejestr do ponowienia i skutkuje niezerowym kodem wyjścia, bez ukrywania pierwotnej awarii testu.

## Critical Implementation Details

### Częściowy setup i przerwanie procesu

Rejestruj zamiar przed żądaniem tworzącym i wynik natychmiast po odpowiedzi, zanim nastąpi logowanie lub kolejny krok. Gdzie API nadaje ID po stronie serwera, zapisz wcześniej unikalną tożsamość nowego zasobu; przy odzyskiwaniu zaakceptuj wyłącznie jednoznacznie potwierdzony wynik tej operacji. Nieznany wynik nie upoważnia do kasowania na podstawie szerokiego wyszukiwania. SIGKILL lub awaria między zapisem w bazie a rejestrem nie dają gwarancji pełnego sprzątnięcia; bezpieczeństwo wcześniejszych danych ma pierwszeństwo.

### Równoległość i kaskady

Jeden przebieg nie może sprzątać zasobów innego przebiegu ani działać równocześnie z komendą odzyskiwania dla tego samego ID. Zastosować wyłączność per rejestr, jawne wznowienie osieroconej blokady po potwierdzeniu zakończenia właściciela i weryfikację relacji przed usunięciem rodzica. Nie usuwać konta trenera, jeżeli zakres kaskady nie jest w pełni własnością przebiegu.

## Phase 1: Zasady ochrony danych

### Overview

Ujednolicić aktualne instrukcje agentów i dokumentację, rozróżniając cudze dane oraz zasoby własnego testu.

### Changes Required:

#### 1. Instrukcje i procedury lokalnej pracy

**File**: `AGENTS.md`, `.cursor/rules/local-db-values.mdc`, `README.md`, `context/foundation/test-plan.md`

**Intent**: Doprecyzować ochronę wcześniejszych kont, danych i Storage oraz obowiązek sprzątania własnych fixture. Wyeliminować traktowanie historycznych resetów jako aktualnej procedury.

**Contract**: Bez resetów i szerokiego DELETE; migracje przez `npx supabase migration up`; seed pozostaje pusty domenowo. Testy, także manualne działania agentów, tworzą własne konta i zasoby oraz zapisują dowód własności. Dokumentacja opisuje przyszłe `test:cleanup`, lokalny zakres i zachowanie po awarii; instrukcja Testing w AGENTS odpowiada istniejącemu Vitest. Poprzedni aktywny plan i brief otrzymują wyłącznie adnotację, że nowa zmiana zastępuje kontrakt pozostawiania fixture; ich historyczne kroki i Progress nie zmieniają się.

### Success Criteria:

#### Automated Verification:

- `git diff --check` przechodzi, a `supabase/seed.sql` pozostaje bez danych domenowych.

#### Manual Verification:

- Aktualne instrukcje Codex, Cursor i cookbook zgodnie chronią wcześniejsze dane oraz dopuszczają wyłącznie sprzątanie własnych zasobów testowych.

---

## Phase 2: Bezpieczny cykl testów

### Overview

Dostarczyć współdzielony mechanizm rejestracji, kontroli środowiska, sprzątania i odzyskiwania oraz podłączyć istniejące testy.

### Changes Required:

#### 1. Rejestr i narzędzia sprzątania

**File**: `scripts/test-resources.mjs` (nowy), `scripts/test-cleanup.mjs` (nowy), `package.json`, `.gitignore`

**Intent**: Utrwalić własność przed kolejnymi krokami testu i umożliwić bezpieczne ponowienie sprzątania po awarii.

**Contract**: `.test-runs/` jest ignorowany przez Git. Komenda `npm run test:cleanup -- <run-id>` akceptuje pojedynczy UUID, nie dowolną ścieżkę ani glob. Rejestr jest wersjonowany, walidowany, pozbawiony sekretów, chroniony przed równoczesnym użyciem i powiązany z konkretnym lokalnym środowiskiem. Niepoprawny rejestr, cudze zasoby, zdalny adres lub niewłaściwe środowisko powodują odmowę przed kasowaniem. Sprzątanie jest idempotentne, usuwa tylko znane zasoby i zachowuje stan nieukończonych operacji. Moduł udostępnia interfejs używalny z TS bez wyłączania kontroli typów.

#### 2. Cykl życia Vitest

**File**: `tests/support.ts`, `tests/harness.test.ts`, `tests/attendance-today.test.ts`, `tests/attendance-past.test.ts`, `vitest.config.ts`

**Intent**: Rejestrować konta, zespoły, treningi, zgłoszenia i pliki od początku setupu oraz zawsze uruchamiać teardown.

**Contract**: Przed signupem działa kontrola lokalności i konfiguracji. Fixture jest objęta zarządzanym cyklem życia także wtedy, gdy setup nie zwróci obiektu. Żądania mutujące i service role nie podążają za niezweryfikowanymi przekierowaniami. Rzeczywiste pliki oraz ścieżki bez obiektu są rozróżniane. Cleanup kończy się po zatrzymaniu żądań testu; timeout nie może uruchomić kasowania równolegle z nadal działającym setupem. Asercje biznesowe dotychczasowych testów pozostają.

#### 3. Cykl życia smoke i CI

**File**: `scripts/smoke.mjs`, `.github/workflows/ci.yml`, `README.md`

**Intent**: Zapewnić smoke ten sam kontrakt własności i sprzątania, bez osobnego niekontrolowanego zestawu fixture.

**Contract**: Smoke korzysta ze wspólnego modułu, unikalnego run ID i teardown po sukcesie, asercji lub wyjątku. Kod wyjścia uwzględnia awarie testu i cleanup. CI przekazuje narzędziom niezbędny lokalny service role jako sekret procesu, bez wypisywania go i bez umieszczania w kliencie aplikacji. Dotychczasowe zatrzymanie jednorazowego stosu CI nie jest instrukcją kasowania wolumenów lokalnego dewelopera.

### Success Criteria:

#### Automated Verification:

- `npm test` zachowuje dotychczasowe asercje i usuwa własne konta, rekordy oraz rzeczywiste zdjęcia po udanym przebiegu.
- `BASE_URL=http://localhost:4321 npm run smoke` przechodzi i nie pozostawia swoich kont ani zespołu.
- `npm run test:cleanup -- <run-id>` dla ukończonego lokalnego przebiegu jest bezpieczne przy ponownym wykonaniu.
- `npm run lint` oraz `npx astro check` przechodzą.

#### Manual Verification:

- Dokumentacja pozwala odnaleźć run ID po przerwaniu procesu i ponowić sprzątanie bez ręcznego SQL.

---

## Phase 3: Weryfikacja ochrony

### Overview

Udowodnić zachowanie wcześniejszych danych i bezpieczne zachowanie przy błędach, przerwaniu oraz równoległych przebiegach.

### Changes Required:

#### 1. Testy kontraktu ochrony

**File**: `tests/test-resources.test.ts` (nowy), `tests/test-data-preservation.test.ts` (nowy), `vitest.config.ts`

**Intent**: Sprawdzić granice sprzątania, a nie jedynie treść instrukcji. Oddzielić szybkie testy mechanizmu od wymagających lokalnej aplikacji integracji.

**Contract**: Testy jednostkowe używają kontrolowanych odpowiedzi transportu i tymczasowych rejestrów. Integracja tworzy osobną kontrolną fixture udającą wcześniejsze dane, poza rejestrem sprzątanego przebiegu, oraz kontrolny obiekt Storage. Po sukcesie, błędzie asercji i częściowym setupie sprawdza zachowanie identyfikatorów i wartości kontrolnych oraz możliwość logowania. Zewnętrzny właściciel sprząta kontrolną fixture na końcu; test nie wybiera rzeczywistego konta dewelopera do modyfikacji.

Pokryć odmowę kasowania zasobu bez dowodu własności, niezgodne środowisko, zdalne i mylące adresy URL, uszkodzony rejestr, błąd Storage, błąd Auth, ponowienie, dwa niezależne przebiegi i odmowę równoczesnego sprzątania tego samego ID. Kontrolowane przerwanie podprocesu po zapisaniu zasobów sprawdza komendę odzyskiwania. Dla nierozstrzygniętego wyniku tworzenia test oczekuje bezpiecznej odmowy zamiast kasowania cudzych danych.

#### 2. Procedura dla użytkownika i agentów

**File**: `README.md`, `context/foundation/test-plan.md`

**Intent**: Opisać udowodniony wzorzec i ograniczenia odzyskiwania, tak aby kolejne testy nie wymagały resetowania bazy.

**Contract**: Instrukcja obejmuje uruchomienie, lokalne warunki wstępne, odczyt run ID, cleanup po awarii, błędy własności i zakaz sprzątania historycznych danych bez rejestru. Automatyczne usunięcie fixture zastępuje dawną ręczną weryfikację logowaniem na konta ostatniego przebiegu; użytkownik sprawdza aplikację własnym kontem.

### Success Criteria:

#### Automated Verification:

- Test ochrony potwierdza niezmienność kontrolnego konta, zespołu, treningu, zgłoszenia i pliku oraz możliwość logowania po sukcesie, błędzie i częściowym setupie innego przebiegu.
- Test odzyskiwania po przerwaniu usuwa wyłącznie zasoby wskazanego przebiegu, a ponowienie nie szkodzi pozostałym danym.
- Testy odmowy i równoległości potwierdzają brak kasowania przy obcych zasobach, złym środowisku, błędnym rejestrze i aktywnym właścicielu przebiegu.
- `npm test`, `npm run smoke`, `npm run lint`, `npx astro check` i `npm run build` przechodzą przy działającym `npm run dev` oraz lokalnym Supabase.

#### Manual Verification:

- Użytkownik loguje się swoim wcześniejszym kontem i widzi te same własne dane oraz zdjęcia po testach i restarcie serwera aplikacji.

---

## Testing Strategy

### Unit Tests:

Walidacja rejestru i środowiska, odmowa nieudowodnionej własności, kolejność sprzątania Storage/domeny/Auth, obsługa brakujących zasobów, błędy i ponowienie, wyłączność przebiegu. Żaden test odmowy nie wykonuje żądania usuwającego do rzeczywistego zdalnego środowiska.

### Integration Tests:

Istniejące integracje i smoke połączone z lifecycle. Kontrolna fixture spoza badanego przebiegu dowodzi zachowania wcześniejszych zasobów. Osobny podproces dowodzi wznowienia po przerwaniu. Sprawdzić brak własnych rekordów i obiektów po cleanup, nie tylko pusty rejestr.

### Manual Testing Steps:

1. Przed testami użytkownik sprawdza swoje konto i przykładowe dane w aplikacji; agent nie pozyskuje jego hasła.
2. Uruchomić lokalny dev i Supabase bez resetów, a następnie automatyczne bramki.
3. Przerwać kontrolny przebieg i wykonać `npm run test:cleanup -- <run-id>` według README.
4. Sprawdzić własne dane po testach i restarcie aplikacji; odróżnić konieczność ponownego logowania od skasowania konta.

## Performance Considerations

Równoległe pliki Vitest zachowują niezależne run ID i rejestry. Sprzątanie operuje na niewielkim zbiorze własnych ID; nie skanuje całej bazy ani całego bucketa po prefiksie. Sprawdzenie zakresu kaskady ogranicza się do konkretnych własnych rodziców.

## Migration Notes

Brak migracji schematu i danych. Nie odtwarzać seedów ani nie ruszać istniejących fixture bez rejestru. Nowy kontrakt dotyczy kolejnych przebiegów. Puste domenowo `supabase/seed.sql`, ustawienie Astro `output: "server"` i istniejące dane użytkownika pozostają. Wycofanie narzędzia nie usuwa rejestrów wymagających odzyskiwania.

## References

- Uzgodnienia użytkownika: cztery odpowiedzi i zatwierdzenie trzech faz, 2026-10-15.
- `AGENTS.md`, `.cursor/rules/local-db-values.mdc`, `README.md:115` — obecna ochrona lokalnych danych.
- `tests/support.ts:109`, `tests/attendance-today.test.ts:38`, `tests/attendance-past.test.ts:19` — fixture i zasoby zdjęć.
- `scripts/smoke.mjs:202`, `vitest.config.ts:3`, `.github/workflows/ci.yml:41` — uruchamianie testów.
- `supabase/migrations/20260926162547_team_role_for_one_squad.sql`, `supabase/migrations/20261001171356_training_photo.sql` — zależności i kaskady.
- `context/foundation/test-plan.md`, `context/changes/testing-attendance-and-confirm/plan.md` — wcześniejszy kontrakt testów.

## Progress

> Convention: unchecked rows are pending. Execution state lives only here.

### Phase 1: Zasady ochrony danych

#### Automated

- [x] 1.1 `git diff --check` przechodzi, a `supabase/seed.sql` pozostaje bez danych domenowych.

#### Manual

- [ ] 1.2 Aktualne instrukcje Codex, Cursor i cookbook zgodnie chronią wcześniejsze dane oraz dopuszczają wyłącznie sprzątanie własnych zasobów testowych.

### Phase 2: Bezpieczny cykl testów

#### Automated

- [x] 2.1 `npm test` zachowuje dotychczasowe asercje i usuwa własne konta, rekordy oraz rzeczywiste zdjęcia po udanym przebiegu.
- [x] 2.2 `BASE_URL=http://localhost:4321 npm run smoke` przechodzi i nie pozostawia swoich kont ani zespołu.
- [x] 2.3 `npm run test:cleanup -- <run-id>` dla ukończonego lokalnego przebiegu jest bezpieczne przy ponownym wykonaniu.
- [x] 2.4 `npm run lint` oraz `npx astro check` przechodzą.

#### Manual

- [ ] 2.5 Dokumentacja pozwala odnaleźć run ID po przerwaniu procesu i ponowić sprzątanie bez ręcznego SQL.

### Phase 3: Weryfikacja ochrony

#### Automated

- [x] 3.1 Test ochrony potwierdza niezmienność kontrolnego konta, zespołu, treningu, zgłoszenia i pliku oraz możliwość logowania po sukcesie, błędzie i częściowym setupie innego przebiegu.
- [x] 3.2 Test odzyskiwania po przerwaniu usuwa wyłącznie zasoby wskazanego przebiegu, a ponowienie nie szkodzi pozostałym danym.
- [x] 3.3 Testy odmowy i równoległości potwierdzają brak kasowania przy obcych zasobach, złym środowisku, błędnym rejestrze i aktywnym właścicielu przebiegu.
- [x] 3.4 `npm test`, `npm run smoke`, `npm run lint`, `npx astro check` i `npm run build` przechodzą przy działającym `npm run dev` oraz lokalnym Supabase.

#### Manual

- [ ] 3.5 Użytkownik loguje się swoim wcześniejszym kontem i widzi te same własne dane oraz zdjęcia po testach i restarcie serwera aplikacji.
