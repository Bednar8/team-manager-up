# Trener widzi zgłoszenia — Plan Brief

> Full plan: `context/changes/coach-sees-submissions/plan.md`

## What & Why

Trener po treningu ma zobaczyć, kto oddał zdjęcie, a kto nie, i podejrzeć to, co zostało przesłane. Dziś sprawdza to na czacie. Ten kawałek zamyka połowę US-01 związaną z obecnością. Ranking kilometrów zostaje w S-04.

## Starting Point

Zawodnik potwierdza jedno zdjęcie w dniu treningu. Wiersz istnieje już od startu wgrania, a zgłoszeniem staje się dopiero po potwierdzeniu. Trener nie czyta cudzych wierszy. Dzień miniony w kalendarzu pokazuje sam opis. Imię zawodnika leży tylko na składzie.

## Desired End State

Trener otwiera dzisiejszy albo wczorajszy trening i widzi listę: kto potwierdził (`Oddał`), a kto nie (`Nie oddał`), w kolejności nazwisk jak na stronie zespołu. Otwarcie osoby, która oddała, pokazuje zdjęcie. Gdy poprawiła odczyt, pod zdjęciem jest „Poprawił odczyt.” Jutrzejszy trening nie ma listy. Osoba, która potwierdziła i wypadła ze składu, zostaje na liście pod imieniem z potwierdzenia. Zawodnik tej listy nie widzi.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kto oddał | Tylko potwierdzone zdjęcie | Sam odczyt nie jest oddaniem; tak zostało ustalone w S-03 |
| Podgląd | Zdjęcie i napis „Poprawił odczyt.” | FR-008 zostawia wgląd w zdjęcie, a kilometry należą do rankingu |
| Które dni | Dziś i dni minione w Warszawie | US-01 dzieje się w dniu wgrywania; przyszły dzień nie ma jeszcze oddawania |
| Kto na liście | Obecni zawodnicy oraz kto potwierdził i wypadł ze składu | Późno dołączony jest Nie oddał; trenera na liście nie ma |
| Imię po odejściu | Kopia `display_name` przy potwierdzeniu | Imię jest tylko na `team_members` i znika razem z członkostwem |
| Gdzie | Okno dnia w kalendarzu | S-01 zostawiło listę „kto wrzucił” przy dniu minionym |

## Scope

**In scope:**

- Odczyt potwierdzonych zgłoszeń przez trenera i kopia imienia na wierszu
- Lista Oddał / Nie oddał przy dzisiejszym i minionym treningu
- Podgląd zdjęcia i napis „Poprawił odczyt.”

**Out of scope:**

- Ranking i publikacja kilometrów (S-04)
- Usunięcie albo podmiana zdjęcia (S-06)
- Lista przy przyszłym treningu, lista dla zawodnika, liczby na podglądzie

## Architecture / Approach

Nowa migracja puszcza trenera do potwierdzonych wierszy jego zespołu i zapisuje imię przy potwierdzeniu. Kalendarz ładuje skład oraz te wiersze raz, bo wybór dnia nie przeładowuje strony. Wyspa składa listę, gdy wybrany dzień jest dziś albo wcześniej w Warszawie. Adres zdjęcia powstaje dopiero przy otwarciu jednej osoby, na 5 minut, kluczem service role.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Odczyt i imię | Polityka trenera i kopia imienia przy potwierdzeniu | Podmiana funkcji potwierdzenia urwie dotychczasowe odmowy |
| 2. Lista | Oddał / Nie oddał w oknie dnia | Wspólna gałąź popupu pokaże listę także zawodnikowi |
| 3. Podgląd | Zdjęcie i „Poprawił odczyt.” | Adres dostanie się do niepotwierdzonego wiersza albo poza zespół |

**Prerequisites:** S-03 jest zrobione. Lokalnie działają Supabase i klucz service role, tak jak przy odczycie zdjęcia.
**Estimated effort:** około 2–3 sesje po godzinach, jedna osoba.

## Open Risks & Assumptions

- Odejścia z zespołu w aplikacji nie ma. Osobę poza składem sprawdza się ręcznym usunięciem wiersza `team_members`.
- Adres podglądu wygasa po 5 minutach, tak jak adres odczytu modelu. Ponowne otwarcie prosi o nowy.
- Polityka jest na wiersze. Trener może z klienta odczytać kolumny kilometrów potwierdzonego wiersza. Ten ekran ich nie pokazuje. Ranking i tak ma je opublikować.
- Podświetlenie „dziś” w siatce zostaje przy zegarze przeglądarki. Lista słucha daty warszawskiej z serwera.

## Success Criteria (Summary)

- Trener przy dzisiejszym treningu widzi, kto potwierdził, a kto został przy odczycie albo nic nie wgrał, i nadal zapisuje opis.
- Wczoraj ma listę bez formularza, jutro zostaje przy formularzu. Późno dołączony jest Nie oddał. Osoba poza składem zostaje jako Oddał pod zapisanym imieniem.
- Podgląd pokazuje zdjęcie i „Poprawił odczyt.” tylko po poprawce. Zawodnik, osoba spoza zespołu i wiersz niepotwierdzony adresu nie dostają.
