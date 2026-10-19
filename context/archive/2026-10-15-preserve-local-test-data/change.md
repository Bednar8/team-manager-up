---
change_id: preserve-local-test-data
title: Ochrona lokalnych danych i sprzątanie zasobów testowych
status: archived
created: 2026-10-15
updated: 2026-10-19
archived_at: 2026-10-19T07:44:19Z
---

## Notes

Konto użytkownika i wcześniejsze dane lokalne mają przetrwać pracę aplikacji i agentów. Testy usuwają wyłącznie własne zasoby, również po błędzie. Po przerwaniu procesu sprzątanie odbywa się osobną komendą na podstawie rejestru przebiegu. Zapisujące testy działają wyłącznie lokalnie. Zakres ochrony: instrukcje i bezpieczne narzędzia testów, bez blokowania dowolnych komend agentów.

## Implementation adaptations

- Added a read-only `/api/test-environment` HMAC challenge before signup so a local app pointing at a different database cannot perform test writes. No secret values are returned.
- Isolated Vitest cache from the running Astro server; shared dependency cache caused calendar 500 responses during the first verification.
- Ambiguous network outcomes remain unresolved instead of declaring cleanup complete while server work may still run.
- Existing unrelated staged changes are preserved; implementation verification does not require committing those changes.

## Verification

- 2026-10-15: all 32 tests passed, including real local data preservation and killed-process cleanup recovery.
- Lint, Astro diagnostics (0 errors/warnings/hints), dev smoke, built Cloudflare preview smoke, idempotent CLI cleanup and server build passed.
- Deliberately disabling cascade verification caused the protective test to fail; original code was restored byte-for-byte.
- Human-only Progress checks remain pending; no claim is made that the developer personally logged into their account. All implementation phases ran without approval pauses as requested.
- No database reset, migration, volume deletion or cleanup of historical unregistered fixture data was performed.
