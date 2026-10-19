---
change_id: testing-ranking-submission-and-dates
title: Ranking i reguły zgłoszenia oraz daty
status: implemented
created: 2026-10-19
updated: 2026-10-19
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Ranking i reguły zgłoszenia oraz daty".
Risks covered: #3, #4, #6. Test types planned: integracja.
Risk response intent:
- #3: Suma to potwierdzone kilometry właściwych osób; brak zgłoszenia to 0 km; miejsca przy remisie są zgodne z PRD. Założenie do podważenia: suma wszystkich kilometrów w tabeli jest rankingiem. Antywzorzec: wyrocznia skopiowana z funkcji liczącej; stary scenariusz publikacji następnego dnia.
- #4: Brak kilometrów, 0 km, dzień bez treningu i drugie zdjęcie po potwierdzeniu nie dają drugiego oddania. Założenie do podważenia: blokada w formularzu wystarcza. Antywzorzec: sam happy path jednego zdjęcia.
- #6: Data wsteczna, drugi trening tego dnia i usunięcie treningu ze zgłoszeniami są odrzucone. Założenie do podważenia: spójny kalendarz w UI oznacza spójny zapis. Antywzorzec: snapshot wyglądu kalendarza.
After creating the folder, follow the downstream continuation rule.
