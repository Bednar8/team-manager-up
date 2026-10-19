# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-19

## 1. Strategy

Testy w tym projekcie trzymają się trzech zasad:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał dla danego ryzyka. Nie podnoś przypadku do e2e tylko dlatego, że e2e „wydaje się bezpieczniejsze”. Nie dokładaj modelu wizyjnego tam, gdzie zwykłe porównanie już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyko opisane jako „zespół boi się X, a awaria wyszłaby w danym obszarze” waży tyle samo co linia PRD albo dane o churnie.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje, _co może się zepsuć_ i _dlaczego uważamy, że to prawdopodobne_ — na podstawie dokumentów, wywiadu i _sygnału_ z kodu (churn, struktura, baza testów). Nie twierdzi, która linia jest właścicielem awarii. Tę wiedzę wytwarza `/10x-research` w każdej fazie rolloutu. Gdy plan i research rozjadą się co do miejsca awarii, prawdą jest research.

Zakres hot-spotów użyty do wagi szansy: `src/`, `supabase/migrations/`.

## 2. Risk Map

Najważniejsze scenariusze awarii, od najwyższego iloczynu skutku i szansy. Kolumna Źródło podaje dowód, który wyniósł ryzyko na listę. Nie wskazuje pliku, w którym awaria mieszka.

| #   | Ryzyko (scenariusz awarii)                                                                                      | Skutek | Szansa  | Źródło (dowód, nie kotwica)                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trener widzi złą listę: potwierdzone zgłoszenie jest „nie oddał”, albo „oddał” bez potwierdzenia                | Wysoki | Wysoka  | wywiad Q1; PRD FR-008, US-01; `context/archive/2026-10-02-coach-sees-submissions/plan.md`                                             |
| 2   | Potwierdzenie nie zapisuje zgłoszenia albo zapisuje inne kilometry niż te, które zawodnik zatwierdził           | Wysoki | Wysoka  | wywiad Q3; PRD FR-007, FR-013; `context/archive/2026-10-01-photo-readout-confirm/plan.md`                                             |
| 3   | Ranking sumuje złe kilometry, złe osoby albo trening, który nie powinien wejść do sumy                          | Wysoki | Średnia | PRD US-01, FR-010, FR-011, FR-014; roadmap S-04 (kilometry od razu, także z dziś); archiwum rankingu zostawia zdanie o publikacji następnego dnia |
| 4   | Zgłoszenie przechodzi bez kilometrów, w dniu bez treningu albo jako drugie zdjęcie                              | Wysoki | Średnia | PRD FR-005, FR-006 i guardrail; wywiad Q3; `context/archive/2026-10-01-photo-readout-confirm/plan.md`                                 |
| 5   | Ktoś spoza zespołu albo inny zawodnik widzi zdjęcie lub sięga po cudze zgłoszenie                               | Wysoki | Średnia | PRD: zdjęcie niewidoczne poza zespołem; Access Control; `context/archive/2026-10-02-coach-sees-submissions/plan.md`                   |
| 6   | Trening wsteczny albo drugi trening tego dnia psuje zapis; usunięcie dziś lub później kasuje zgłoszenia razem z treningiem | Średni | Średnia | PRD FR-001–FR-003; hot-spot `src/components/calendar/` (10 zmian/30 dni), `src/pages/` (22 zmian/30 dni)                              |

### Risk Response Guidance

| Ryzyko | Co udowodni ochronę                                                                                                         | Założenie do podważenia                             | Kontekst, który ma ustalić `/10x-research`                                                    | Najtańsza warstwa                                   | Antywzorzec                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| #1     | Przy treningu na dziś lub wstecz trener widzi „oddał” tylko przy potwierdzonym zgłoszeniu, a resztę składu jako „nie oddał” | Samo wgranie zdjęcia oznacza „oddał”                | Skąd bierze się status, kiedy lista w ogóle jest i kto zostaje na liście po wyjściu ze składu | Integracja na odczycie listy                        | Jedna szczęśliwa ścieżka; asercja skopiowana z widoku                                |
| #2     | Po potwierdzeniu zapis ma dokładnie zatwierdzone kilometry tego zawodnika i tego treningu                                   | Wyświetlony odczyt albo status 200 oznacza zapis    | Kolejność wgranie, odczyt i potwierdzenie oraz co zostaje w danych                            | Integracja ze sztucznym odczytem, bez żywego modelu | Test jakości OCR; oczekiwana liczba wzięta z parsera                                 |
| #3     | Suma to potwierdzone kilometry zawodników tego zespołu z treningów do warszawskiego dnia odczytu włącznie; brak takiego wiersza daje 0 km i nie kasuje wcześniejszych kilometrów; trenera nie ma na liście. Remis nie ma reguły w PRD | Suma wszystkich kilometrów w tabeli jest rankingiem | Do sumy wchodzą potwierdzone kilometry zawodników do warszawskiego dnia odczytu włącznie; trener jest poza listą; niepotwierdzony odczyt nie wchodzi | Integracja na odczycie rankingu; dzień liczy się w chwili odczytu, nie jako argument wywołania | Wyrocznia skopiowana z funkcji liczącej; stary scenariusz publikacji następnego dnia |
| #4     | Brak kilometrów i 0 km zostawiają istniejący niepotwierdzony wiersz bez potwierdzenia; warszawski dzień bez treningu nic nie wstawia; drugie rozpoczęcie po potwierdzeniu nie wstawia drugiego wiersza | Blokada w formularzu wystarcza                      | Gdzie serwer odrzuca te przypadki i co zostaje zapisane                                       | Integracja ścieżek odrzucenia                       | Sam happy path jednego zdjęcia                                                       |
| #5     | Zdjęcie i zgłoszenie nie są dostępne dla innego zespołu, zawodnika bez uprawnienia ani sesji                                | Zalogowanie wystarcza, skoro trasa jest chroniona   | Czy sprawdzenie dotyczy własności zasobu, nie tylko sesji                                     | Integracja dwóch kont i dwóch zespołów              | Test właściciela bez przypadku cudzego identyfikatora                                |
| #6     | Data wsteczna i drugi trening tego dnia są odrzucone. Usunięcie daty wcześniejszej niż warszawskie dziś jest odrzucone. Usunięcie dziś lub później nie sprawdza zgłoszeń i kasuje je razem z treningiem | Spójny kalendarz w UI oznacza spójny zapis          | Reguła daty odrzuca wstecz i duplikat dnia. Usunięcie nie czyta zgłoszeń: dziś i przyszłość kasują je kaskadą, wbrew FR-002 dla dziś | Integracja zapisu treningu                          | Snapshot wyglądu kalendarza                                                          |

## 3. Phased Rollout

Każdy wiersz otworzy własny folder zmiany przez `/10x-new`. Status idzie w prawo przez wartości z parsera. Reszta wiersza zostaje, dopóki nie będzie `--refresh`.

| #   | Phase name                            | Goal (one line)                                                                | Risks covered | Test types                 | Status        | Change folder                                   |
| --- | ------------------------------------- | ------------------------------------------------------------------------------ | ------------- | -------------------------- | ------------- | ----------------------------------------------- |
| 1   | Lista kto oddał i zapis potwierdzenia | Postawić runner i udowodnić listę trenera oraz zapis zatwierdzonych kilometrów | #1, #2        | start runnera + integracja | complete      | context/archive/2026-10-05-testing-attendance-and-confirm/ |
| 2   | Ranking i reguły zgłoszenia oraz daty | Udowodnić sumę kilometrów oraz odrzucenie zgłoszenia i treningu poza regułami  | #3, #4, #6    | integracja                 | planned       | context/changes/testing-ranking-submission-and-dates/          |
| 3   | Cudzy dostęp do zdjęcia i zgłoszenia  | Udowodnić, że sesja nie wystarcza do cudzego zdjęcia ani zgłoszenia            | #5            | integracja uprawnień       | not started   | —                                               |
| 4   | Bramka testów w CI                    | Uruchamiać zestaw z faz 1–3 obok lintu, buildu i smoke                         | przekrojowe   | bramka                     | not started   | —                                               |

## 4. Stack

Klasyczna baza testów. Rekomendacje pochodzą z manifestu i z narzędzi dostępnych w tej sesji.

| Warstwa              | Narzędzie                 | Wersja    | Uwagi                                                                          |
| -------------------- | ------------------------- | --------- | ------------------------------------------------------------------------------ |
| unit + integracja    | Vitest w Node             | `^4.1.11` | `npm test`; HTTP do lokalnego serwera, bez importów Astro i `getViteConfig()`. |
| mock odczytu zdjęcia | `record_training_readout` | —         | Sztuczny odczyt przy ryzyku #2. Żywy model OCR nie jest wyrocznią.             |
| e2e                  | none yet                  | —         | Ten rollout go nie dodaje. Sygnał ryzyk #1–#6 jest tańszy w integracji.        |
| dostępność           | none yet                  | —         | Poza tym rolloutem.                                                            |
| smoke logowania      | `scripts/smoke.mjs`       | —         | CI odpala go po buildzie. Nie pokrywa listy oddanych ani rankingu.             |

**Stack grounding tools (current session):**

- Docs: brak Context7 i brak MCP dokumentacji frameworka — pominięte; checked: 2026-10-05
- Search: WebSearch — oficjalny przewodnik [Astro Testing](https://docs.astro.build/en/guides/testing/) wskazuje Vitest; checked: 2026-10-05
- Runtime/browser: cursor-ide-browser — możliwa ręczna weryfikacja UI, nieużyta jako warstwa testów; checked: 2026-10-05
- Provider/platform: MCP Cloudflare i Supabase są w sesji, oba wymagają logowania i nie były użyte; Linear szuka tylko swojej dokumentacji; checked: 2026-10-05

## 5. Quality Gates

Bramki, które muszą przejść, zanim zmiana dojdzie na produkcję. „Required for §3 Phase N” znaczy: bramka zaczyna obowiązywać, gdy ta faza wyląduje.

| Bramka                   | Gdzie                                    | Wymagana?                 | Co łapie                                                                                              |
| ------------------------ | ---------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| lint + typecheck + build | lokalnie i CI                            | required                  | dryf składni i typów                                                                                  |
| smoke logowania          | CI                                       | required                  | padnięta ścieżka wejścia                                                                              |
| integracja ryzyk #1–#6   | lokalnie od §3 Fazy 1, w CI od §3 Fazy 4 | required after §3 Phase 4 | zła lista oddanych, zły zapis, zły ranking, zgłoszenie poza regułami, cudzy dostęp, zła data treningu |

## 6. Cookbook Patterns

Jak dokładać testy. Podsekcje wypełnią się, gdy wyląduje dana faza. Do tego czasu zostaje odsyłacz.

### 6.1 Test jednostkowy

- TBD — patrz §3 Faza 1. Runner wstaje razem z pierwszym testem integracyjnym listy oddanych i zapisu potwierdzenia. Test jednostkowy dochodzi tylko wtedy, gdy research wskaże czystą regułę tańszą niż ten odczyt.

### 6.2 Test integracyjny

- Vitest w Node, HTTP do działającego lokalnego dev servera. Przebieg dokłada własny zespół przez współdzieloną fixture i zachowuje wcześniejsze konta, sesje, wiersze oraz zdjęcia. Testy i ręczne sprawdzenia agentów nie używają konta ani sesji dewelopera.
- Przed tworzeniem zasobów rejestruj dokładną własność i relacje w gitignorowanym `.test-runs/<run-id>.json`, bez sekretów. Sprzątaj własne pliki Storage, zależne rekordy i konta Auth po sukcesie i po błędzie, również przy częściowym setupie. Zanim usuniesz rodzica, sprawdź, czy jego kaskada nie obejmie nieznanych zasobów.
- Zapisujące testy i smoke wymagają lokalnych adresów aplikacji i Supabase: tylko dosłowne `localhost`, `127.0.0.1`, `::1`, bez poświadczeń URL i przekierowań poza środowisko. Potwierdź wspólną instancję przed zapisami domenowymi.
- Po przerwaniu procesu odczytaj UUID z logu lub `.test-runs/` i uruchom `npm run test:cleanup -- <run-id>` w tym samym środowisku, gdy właściciel przebiegu już nie działa. Ponowienie jest bezpieczne; błędy pozostawiają rejestr. Brak dowodu własności lub niejednoznaczny wynik operacji oznacza odmowę, nie szersze kasowanie. Stare fixture bez rejestru zostają.
- Konto testowe po udanym przebiegu jest usunięte. Ręczną weryfikację aplikacji wykonuje użytkownik na swoim wcześniejszym koncie. Szczegóły uruchomienia i odzyskiwania: `README.md`, sekcja „Local tests and data preservation”.
- Dzień dzisiejszy (`warsawToday`, `Europe/Warsaw`): trening przez aplikację, zdjęcie przez podpisany upload, sztuczny odczyt przez `record_training_readout`, potem potwierdzenie zawodnika. Wyrocznia listy to `<li>` z pełnym imieniem (`listItemContaining`): „Oddał” albo „Nie oddał”. Wyrocznia kilometrów to wiersz `training_submissions`, nie tekst strony.
- Dzień wcześniejszy (`warsawYesterday`, poprzednia data cywilna): service role wstawia `trainings` (`id`, `team_id`, `training_on`, opis) i jedno potwierdzone `training_submissions` (niepusty `storage_path`, `distance_km` > 0, `confirmed_at`, `submitter_display_name` równe imieniu). Pozostali zawodnicy nie dostają wiersza. Test nie woła `confirm_training_photo` i nie wgrywa obiektu. Wyrocznia zostaje ta sama lista.

### 6.3 Test e2e

- Poza tym rolloutem. Regresje z §2 łapie integracja.

### 6.4 Nowy odczyt listy albo rankingu

- Lista oddanych: `GET /calendar?date=` z ciasteczkami trenera. Data to dzień cywilny `Europe/Warsaw`. Status siedzi w tym samym `<li>` co pełne imię. „Nie oddał” nie zawiera „Oddał”. Brak wiersza zgłoszenia to „Nie oddał”.
- Kilometry: wiersz zgłoszenia odczytany service role po `user_id` i `training_on`. Sztuczny odczyt modelu idzie przez `record_training_readout`, zanim zawodnik potwierdzi.
- Dzień miniony: `POST /rest/v1/trainings` i `POST /rest/v1/training_submissions` kluczem service role (`Content-Type: application/json`, `Prefer: return=representation`). Potem ta sama wyrocznia `<li>`.

### 6.5 Odrzucenie zgłoszenia albo treningu

- TBD — patrz §3 Faza 2: brak kilometrów, dzień bez treningu, drugie zdjęcie, data wsteczna, drugi trening tego dnia, usunięcie treningu ze zgłoszeniami.

### 6.6 Notatki z faz

- Lokalny storage-api v1.72.1 kończy podpisany upload przez `INSERT ... ON CONFLICT (name, bucket_id)`. W tej bazie były tylko częściowe unikalne indeksy na `(bucket_id, name)`, więc PUT zwracał Postgres `42P10`.
- W lokalnej bazie powstał nieczęściowy unikalny indeks `objects_name_bucket_id_key` na `storage.objects (name, bucket_id)`. To nie jest migracja w repozytorium.
- Test dnia minionego nie wgrywa obiektu.
- Faza 1 zamknięta 2026-10-19. Kroki automatyczne są wykonane. Pięć ręcznych wierszy Progress w archiwum zostaje odhaczonych, bo nagłówek planu z 2026-10-15 uznaje je za zapis historyczny: konta przebiegu są sprzątane, a ręczna weryfikacja idzie na wcześniejsze konto użytkownika, nie na fixture ostatniego testu.

## 7. What We Deliberately Don't Test

Wywiad Q5 został pominięty. Wykluczenia poniżej biorą się z PRD i z odpowiedzi Q1. Zostają, dopóki założenie się nie zmieni.

- **Jakość modelu OCR i screeny zegarków** — zawodnik potwierdza odczyt, zanim liczby idą dalej. Wróć do tego, gdy potwierdzenie przestanie być bramką. (Źródło: wywiad Q1.)
- **Raporty CSV/PDF, integracje z aplikacjami biegowymi, wiele zespołów, role poza trenerem i zawodnikiem** — poza pierwszą wersją. Wróć, gdy wejdą do zakresu. (Źródło: PRD Non-Goals.)
- **Ranking po czasie albo szybkości** — nice-to-have, zaparkowany. Wróć razem z FR-012. (Źródło: PRD FR-012, roadmapa Parked.)
- **Snapshoty wyglądu kalendarza i strony startowej** — nie łapią listy oddanych ani zapisu kilometrów. Wróć, gdy regresja wizualna stanie się osobnym ryzykiem. (Źródło: zasada koszt × sygnał, §1.)
- **Resetowanie lub masowe czyszczenie lokalnej bazy, żeby ułożyć test** — bez resetów, TRUNCATE, usuwania wolumenów i odtwarzania seedów. Migracje przez `npx supabase migration up`, seed pusty domenowo. Dozwolone jest wyłącznie sprzątanie dokładnie zarejestrowanych zasobów własnego przebiegu; wcześniejsze dane zostają. Historyczne procedury resetu i pozostawiania fixture zastępuje `context/changes/preserve-local-test-data/plan.md`. (Źródło: reguła lokalnej bazy i uzgodnienia użytkownika 2026-10-15.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-05
- Stack versions last verified: 2026-10-05
- AI-native tool references last verified: 2026-10-05

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
