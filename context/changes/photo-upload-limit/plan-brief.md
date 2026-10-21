# Photo upload limit — Plan Brief

> Full plan: `context/changes/photo-upload-limit/plan.md`

## What & Why

Pokazowy projekt nie ma pułapu wywołań OpenRouter. Każde wybrane zdjęcie treningu idzie do modelu, a podmian tego samego dnia może być dowolnie dużo. Po tej zmianie jeden zawodnik wysyła do odczytu najwyżej dwa zdjęcia na warszawski dzień.

## Starting Point

Zawodnik wgrywa jedno zdjęcie dzisiejszego treningu z kalendarza. Ścieżka to begin, plik w Storage, odczyt. Odczyt jest jedynym wywołaniem OpenRouter. Kolejny plik nadpisuje to samo zgłoszenie i znów woła model. Usunięcie zdjęcia kasuje wiersz, więc licznik na zgłoszeniu dałoby się wyzerować.

## Desired End State

Trzeci plik tego dnia dostaje „Dziś można wgrać najwyżej dwa zdjęcia.” Pole pliku znika. Ostatnie zdjęcie zostaje: da się je potwierdzić i poprawić liczby przed potwierdzeniem, a po potwierdzeniu usunąć. Usunięcie nie oddaje slotu. Następny warszawski dzień liczy od zera.

Przykład. Pierwsze wysłanie do modelu zostawia licznik 1 i pole pliku. Drugie zostawia licznik 2, chowa pole i pokazuje `Potwierdź`. Trzeci plik dostaje 400 i nie rusza potwierdzonego zdjęcia. Usunięcie po dwóch zostawia licznik 2 i schowane pole do końca dnia.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Co wchodzi w limit | Dwa wysłane odczyty na zawodnika i warszawski dzień, także przed potwierdzeniem | Trzeci plik i kolejne wołanie modelu odpadają |
| Błąd modelu | Slot schodzi w momencie wysłania do OpenRouter | Odrzucenie pliku zanim padnie wywołanie nie liczy się |
| Usunięcie | Nie oddaje slotu; skasowanie i ponowne utworzenie treningu też nie | Pętla usuń–wgraj nie omija kosztu modelu |
| Po limicie | Znika pole pliku; zostają potwierdzenie, ręczna poprawka przed potwierdzeniem i usunięcie potwierdzonego zdjęcia | Oddanie treningu nie woła modelu |
| Gdzie leży licznik | Tabela `photo_readout_uses` na zawodnika i warszawski dzień | Wiersz zgłoszenia znika przy usunięciu zdjęcia |

## Scope

**In scope:**

- Licznik wysłanych odczytów, odmowa w begin zanim zdjęcie zostanie wyczyszczone, rezerwacja slotu tuż przed modelem
- Odmowa odczytu dla dnia innego niż warszawski dziś
- Ukrycie pola pliku i zdanie limitu w kalendarzu
- Testy HTTP tych odmów i renderu dnia

**Out of scope:**

- Drugi zapisany plik na jednym treningu
- Zwrot slotu, budżet dolarowy OpenRouter, reset dla trenera
- Edycja liczb już potwierdzonego zdjęcia
- Zmiana okna warszawskiego dnia, limitu rozmiaru pliku i sprzątania osieroconych obiektów

## Architecture / Approach

`begin_training_photo` czyta licznik i przy 2 podnosi błąd przed czyszczeniem zgłoszenia. Odczyt najpierw odrzuca inny dzień, a gdy adres obrazu jest gotowy, jednym `insert ... on conflict` rezerwuje slot i dopiero wtedy woła OpenRouter. Kalendarz czyta ten sam wiersz i chowa pole pliku.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Licznik i odmowa na serwerze | Trzecie wywołanie modelu i odczyt innego dnia odpadają, zanim begin skasuje zdjęcie | Rezerwacja za późno albo za wcześnie: albo model i tak pójdzie, albo nieudane wgranie zje slot |
| 2. Kalendarz bez trzeciego pliku | Pole pliku znika przy liczniku 2; potwierdzenie i usunięcie zostają | Ekran schowa też `Potwierdź` albo `Usuń zdjęcie` |

**Prerequisites:** Lokalny Supabase i aplikacja. Migracja przez `npx supabase migration up`, bez resetu bazy.
**Estimated effort:** Około 1–2 sesje, dwie fazy.

## Open Risks & Assumptions

- Dwa równoległe begin przy jednym wolnym slocie mogą wyczyścić zdjęcie, zanim druga rezerwacja odpadnie. Wywołania modelu i tak stają na dwóch. Zamka nie dodajemy.
- Dzień wdrożenia startuje od zera. Wcześniejszych wywołań modelu nie ma z czego odtworzyć.
- Test „model nie poszedł” opiera się na 400 ze zdaniem limitu albo dnia. 502 `Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.` znaczy, że odmowa stanęła za późno.

## Success Criteria (Summary)

- Trzeci plik warszawskiego dnia nie woła OpenRouter i nie kasuje ostatniego zdjęcia.
- Usunięcie zdjęcia ani ponowne utworzenie treningu nie oddają slotu.
- Po dwóch odczytach pole pliku znika, a trening da się potwierdzić albo usunąć.
