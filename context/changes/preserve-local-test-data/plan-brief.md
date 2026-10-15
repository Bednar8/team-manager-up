# Ochrona lokalnych danych — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Lokalne konto i dane użytkownika mają przetrwać testowanie oraz pracę agentów. Test sprząta tylko to, co sam utworzył, również gdy kończy się błędem.

## Starting Point

Zakaz resetowania bazy już istnieje. Obecne testy nie kasują bazy, ale pozostawiają własne konta, zespoły i zdjęcia; przyczyna wcześniejszej utraty danych nie została potwierdzona. Brakuje rejestru własności i teardown, a konfiguracja dopuszcza zdalne adresy.

## Desired End State

Po testach użytkownik nadal może zalogować się swoim kontem i sprawdzić wcześniejsze dane. Vitest oraz smoke usuwają własne zasoby. Po nagłym przerwaniu osobna komenda wznawia sprzątanie wskazanego przebiegu.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Wcześniejsze dane | Chronione konta, rekordy, sesje i zdjęcia | Ręczne sprawdzanie aplikacji nie wymaga ponownego zakładania konta |
| Błąd testu | Sprzątanie także po błędzie | Nie zostawiamy nieudanych fixture |
| Przerwany proces | Rejestr i osobna komenda | Pozwala wznowić dokładnie ograniczone sprzątanie |
| Środowisko | Wyłącznie lokalna aplikacja i Supabase | Pomyłka nie skieruje zapisujących testów do chmury |
| Agenci | Reguły i bezpieczne narzędzia testów | Bez budowy globalnej blokady dowolnych komend |
| Stare fixture | Bez zmian bez rejestru własności | Nazwa konta nie dowodzi uprawnienia do usunięcia |

## Scope

**In scope:**

- Instrukcje Codex i Cursor, README i cookbook testów.
- Wspólny rejestr, lokalne kontrole, teardown Vitest i smoke oraz komenda odzyskiwania.
- Testy ochrony wcześniejszych danych, błędów, przerwania i równoległości.

**Out of scope:**

- Reset, odzyskiwanie dawniej skasowanych danych i czyszczenie historycznych fixture.
- Blokowanie dowolnego SQL lub komend agentów, zdalne testy zapisujące.
- Zmiany interfejsu, reguł biznesowych i długości sesji logowania.

## Architecture / Approach

Wspólny moduł Node zapisuje wersjonowany rejestr `.test-runs/<run-id>.json`, bez sekretów. Sprzątanie sprawdza środowisko i własność, usuwa własne obiekty Storage, potem rekordy i konta Auth. Nieznany zasób lub ryzykowna kaskada zatrzymują usuwanie. `npm run test:cleanup -- <run-id>` pozwala ponowić operację; rejestr pozostaje przy błędzie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Zasady ochrony danych | Jednoznaczny kontrakt agentów i testów | Stare instrukcje pozostawiania danych lub resetowania |
| 2. Bezpieczny cykl testów | Rejestr, kontrole lokalne, teardown i odzyskiwanie | Częściowy setup, pliki Storage i kaskady |
| 3. Weryfikacja ochrony | Dowody zachowania wcześniejszych zasobów | Fałszywy sukces cleanup lub równoległe operacje |

**Prerequisites:** działający lokalny Supabase i dev server, dostęp service role tylko w procesie narzędzi; bez resetu bazy.
**Estimated effort:** orientacyjnie 2–3 sesje implementacyjne na 3 fazy.

## Open Risks & Assumptions

- Instrukcje i narzędzia nie blokują dowolnego ręcznego destrukcyjnego polecenia.
- Nagłe przerwanie pomiędzy zapisem w bazie i rejestrze może pozostawić nierozstrzygnięty zasób; bezpieczeństwo wcześniejszych danych ma pierwszeństwo przed pełnym sprzątnięciem.
- Storage i kaskady wymagają sprawdzenia osobno; nie wystarczy skasować konto.

## Success Criteria (Summary)

- Wcześniejsze konta, dane i zdjęcia pozostają; użytkownik nadal może się zalogować.
- Sukces i błąd testu sprzątają wyłącznie jego zasoby; przerwany przebieg można bezpiecznie wznowić komendą.
- Zdalne środowisko, nieudowodniona własność lub błędny rejestr nie powodują kasowania.

## References

- `AGENTS.md`, `.cursor/rules/local-db-values.mdc`, `context/foundation/test-plan.md`.
- `tests/support.ts`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`.
- Uzgodnienia z użytkownikiem i pełny plan, 2026-10-15.
