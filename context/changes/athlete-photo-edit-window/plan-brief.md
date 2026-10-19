# Okno poprawki zdjęcia — Plan Brief

> Full plan: `context/changes/athlete-photo-edit-window/plan.md`

## What & Why

Zawodnik może pomylić screen albo kilometry i do końca dnia treningu musi móc to poprawić. FR-009 pozwala usunąć albo podmienić jedno zdjęcie, dopóki nie ma następnego dnia. Potwierdzone kilometry i tak wchodzą do rankingu od razu, więc poprawka tego samego dnia ma od razu przesunąć miejsca.

## Starting Point

Wgranie, odczyt i potwierdzenie działają tylko w warszawskim dniu treningu. Po `confirmed_at` drugi `begin` jest odrzucony, a kalendarz chowa wybór pliku. Ranking sumuje potwierdzone kilometry, a trener widzi „Oddał” tylko przy potwierdzonym wierszu. Usuwania zdjęcia przez zawodnika nie ma.

## Desired End State

W dniu treningu zawodnik podmienia zdjęcie albo je usuwa. Podmiana zdejmuje stare potwierdzenie w chwili wyboru pliku i wraca do odczytu oraz potwierdzenia. Usunięcie zabiera kilometry tego zgłoszenia i pokazuje trenerowi „Nie oddał”. Od następnego warszawskiego dnia obie akcje są odrzucone, nawet gdy na jutro nie ma treningu. Trening już wpisany na jutro dzisiejszego okna nie zamyka.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| „Następny dzień” | Warszawska data cywilna po `training_on` | Guardrail PRD zamyka edycję po dniu treningu, a wgranie już używa `Europe/Warsaw` |
| Jutrzejszy trening | Nie zamyka dzisiejszego okna | Żaden zapis FR-009 nie wiąże okna z kolejnym wierszem `trainings` |
| „Edytować” | Nowe zdjęcie, potem istniejący odczyt i potwierdzenie | S-06 mówi o podmianie pliku; liczby bez nowego pliku zostały przy pierwszym potwierdzeniu |
| Chwila wycofania | Drugi `begin` czyści `confirmed_at` od razu | Inaczej ranking i „Oddał” zostałyby przy starym screenie, którego plik trasa `begin` już usuwa |
| Po usunięciu | Ten sam dzień pozwala wgrać zdjęcie od zera | Jedno zdjęcie dotyczy aktualnego zgłoszenia, a skasowany wiersz przestaje je zajmować |
| Kto | Tylko właściciel-zawodnik | Trener ogląda zdjęcia, nie wyręcza zawodnika w oddaniu |
| Potwierdzenie usunięcia | Jeden przycisk, bez drugiego dialogu | Tak samo działa „Usuń” przy treningu trenera |

## Scope

**In scope:**

- Migracja `begin_training_photo` i `delete_training_photo`
- `POST /api/trainings/photo/delete`
- Napisy `Podmień zdjęcie` i `Usuń zdjęcie` w dniu treningu
- Testy HTTP rankingu, listy trenera, wczoraj i jutra
- Aktualizacja testu, który dziś wymaga odmowy drugiego `begin`

**Out of scope:**

- Edycja samych liczb bez nowego pliku
- Okno aż do następnego treningu w kalendarzu
- Usuwanie przez trenera, FR-012, sieroty Storage po skasowaniu treningu

## Architecture / Approach

Reguła zostaje w RPC, tak jak data wgrania. `begin` w dniu treningu czyści potwierdzenie i oddaje istniejącej trasie ten sam `storage_path`. Nowa trasa kasuje wiersz wywołującego i obiekt w `training-photos`. Ranking oraz „Oddał” nie dostają nowej funkcji: liczą się tylko potwierdzone wiersze. Kalendarz pokazuje akcje wyłącznie przy `selected === warsawToday`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Okno w bazie i trasach | Podmiana i usunięcie z testami rankingu oraz listy | Drugi `begin` zdejmuje kilometry, zanim nowy plik dojdzie |
| 2. Przyciski w kalendarzu | `Podmień zdjęcie` i `Usuń zdjęcie` tylko dziś | Zły zegar, jeśli UI weźmie lokalny dzień przeglądarki |

**Prerequisites:** Działające lokalne Supabase i aplikacja na loopback. S-03, S-04 i S-05 są już w kodzie.
**Estimated effort:** Około dwóch sesji, dwie fazy.

## Open Risks & Assumptions

- Nieudane wgranie po drugim `begin` zostawia zawodnika bez potwierdzenia, aż dokończy nowe zdjęcie. Tak ma być.
- Błąd Storage po skasowanym wierszu nie wskrzesza zgłoszenia.
- Testy wymagają lokalnej aplikacji i nie wołają żywego modelu odczytu.

## Success Criteria (Summary)

- W dniu treningu podmiana zmienia kilometry w rankingu zaraz po nowym potwierdzeniu.
- Usunięcie daje 0 km i „Nie oddał”, a tego samego dnia można oddać zdjęcie jeszcze raz.
- Wczorajsze zgłoszenie zostaje po odmowie, a trening wpisany na jutro nie blokuje dzisiejszej poprawki.
