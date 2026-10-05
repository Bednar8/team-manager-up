# Lista oddanych i zapis potwierdzenia — Plan Brief

> Full plan: `context/changes/testing-attendance-and-confirm/plan.md`

## What & Why

Faza 1 planu testów ma udowodnić dwie rzeczy, których dziś nie łapie smoke: trener widzi „Oddał” tylko po potwierdzeniu, a w bazie lądują kilometry zatwierdzone przez zawodnika, nie surowy odczyt. Runner wstaje lokalnie. Bramka CI zostaje fazą 4 planu testów.

## Starting Point

Nie ma Vitest ani skryptu `test`. Lista trenera jest HTML-em `GET /calendar?date=`: „Oddał” to wiersz z ustawionym `confirmed_at`. Zapis idzie przez `begin`, wgranie, `record_training_readout` (service role) i `confirm`. Dnia wcześniejszego niż dziś w Warszawie nie da się utworzyć przez aplikację.

## Desired End State

`npm test` przeciwko działającemu dev serverowi zakłada własny zespół i zostawia resztę bazy w spokoju. Na dziś `Potwierdza ${runId}` jest „Oddał”, a `Wgrywa ${runId}` i `Milczy ${runId}` są „Nie oddał”. Wiersz potwierdzającego ma 7 km przy odczycie modelu 6.5. Poprzedni dzień cywilny, wstawiony service role z opisem `Bieg wsteczny`, pokazuje ten sam podział statusów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| List situations | Warsaw today through the app, plus the previous Warsaw civil day seeded | The proof sentence names today and a past day, and the app rejects creating a past training | Plan |
| How the suite runs | Already running dev server, `BASE_URL` default `http://localhost:4321` | Phase 4 owns CI; the test does not start or stop Supabase | Plan |
| Runner | Vitest in Node, HTTP only | The test plan names Vitest, and these tests do not import Astro modules | Test plan |
| List oracle | Status inside the same `<li>` as the full display name | A page-wide „Oddał” passes as soon as one athlete confirmed | Test plan |
| Fake readout | `record_training_readout` with 6.5, then confirm with 7 | Risk #2 is the approved kilometers, and the live model is out of this rollout | Test plan |
| Confirm oracle | Service-role read of the row, numeric compare | HTTP 200 does not prove what was stored | Test plan |
| Data left behind | New team per run, no delete and no reset | Local database rule and test plan §7 | Test plan |
| Off the roster | Left out of this phase | The wider list case was not selected | Plan |
| CI | Left to test-plan phase 4 | This phase only stands the runner up locally | Test plan |

## Scope

**In scope:**

- Vitest, klient HTTP, fixture trenera i trzech zawodników
- Dziś: potwierdzenie 7 km po odczycie 6.5, wgranie bez potwierdzenia, brak zgłoszenia, lista trenera i wiersz w bazie
- Poprzedni dzień cywilny: insert service role i ta sama lista
- Krótka notatka w §6 planu testów po wylądowaniu wzorca

**Out of scope:**

- CI, preview boot, start i stop Supabase
- Ranking, reguły odrzucenia, cudzy dostęp, osoba spoza składu
- Żywy OCR i trasa `/api/trainings/photo/readout`
- E2e, test jednostkowy składania listy, czyszczenie bazy

## Architecture / Approach

Testy w `tests/` wołają działającą aplikację tak jak `scripts/smoke.mjs`. Sztuczny odczyt omija model: po `begin` i `PUT` na podpisany URL service role woła `record_training_readout`. Wyrocznia listy to HTML dialogu dnia. Wyrocznia kilometrów to kolumny `distance_km` i `model_distance_km`. Dzień miniony nie idzie przez RPC produktu, bo te odrzucają datę wsteczną. Odczyt i tak jest stroną trenera.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Runner i fixture | `npm test` zakłada zespół i czytelnie staje, gdy dev albo service role nie działają | Sekrety są w `.env` albo `.dev.vars`, a test nie może ich wypisać |
| 2. Lista z dziś i zapisane kilometry | Statusy trzech zawodników oraz wiersz 7 wobec 6.5 | `begin` wymaga `OPENROUTER_API_KEY` w procesie dev, choć model nie jest wołany |
| 3. Lista dnia minionego | `Bieg wsteczny` i „Oddał” tylko przy wstawionym potwierdzeniu | Zły sposób liczenia „wczoraj” trafia w inny dzień niż strona |

**Prerequisites:** `npm run dev` na porcie 4321, działający lokalny Supabase, w env dev `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE` i niepusty `OPENROUTER_API_KEY`.
**Estimated effort:** około 2 sesje na 3 fazy.

## Open Risks & Assumptions

- Dziś warszawskie liczy ten sam zegar w teście i w dev. Przebieg przez północ w Warszawie może rozciąć dzień.
- Placeholder w `OPENROUTER_API_KEY` wystarcza `begin`. Wołanie trasy readout przy prawdziwym kluczu wyszłoby do modelu, więc test tej trasy nie dotyka.
- Wyrocznia HTML zależy od gałęzi tylko do odczytu. Przeniesienie listy wyłącznie na czas po hydracji oślepi te testy.
- Każdy przebieg zostawia zespół w lokalnej bazie. Tak ma być.

## Success Criteria (Summary)

- Na dziś trener widzi „Oddał” tylko przy zawodniku, który potwierdził, a dwaj pozostali są „Nie oddał”.
- Wiersz potwierdzenia ma 7 km, odczyt modelu 6.5 i ustawione `confirmed_at` dla tego zawodnika i tego treningu.
- Poprzedni dzień warszawski pokazuje ten sam podział, a istniejące wiersze bazy zostają.
