# Zdjęcie, odczyt i potwierdzenie — Plan Brief

> Full plan: `context/changes/photo-readout-confirm/plan.md`

## What & Why

Zawodnik ma oddać jedno zdjęcie treningu, zobaczyć na dole, co udało się odczytać, i potwierdzić dane. Bez kilometrów większych od zera zgłoszenie nie przechodzi. Trener później zobaczy, gdy zawodnik sam poprawił liczby; w tym kawałku ta informacja jest tylko zapisana.

## Starting Point

Kalendarz pokazuje treningi zespołu. Zawodnik przy dniu z treningiem widzi opis, bez wgrywania. Nie ma tabeli zgłoszeń, bucketa ani odczytu. Zapis trenera liczy dziś jako Europe/Warsaw, a podświetlenie „dziś” w siatce bierze zegar przeglądarki.

## Desired End State

Dziś w Warszawie jest dzień z treningiem. Zawodnik wgrywa jedno zdjęcie, widzi „Odczyt trwa”, a potem 6,5 km, 42:10 i 12,4 km/h. Zmienia 6,5 na 6,0, czyta „Trener zobaczy, że poprawiłeś odczyt.” i potwierdza. Zapis trzyma odczyt 6,5 km i potwierdzone 6,0 km ze znacznikiem poprawki. Wczoraj, jutro i dzień bez treningu nie mają wyboru pliku. Po potwierdzeniu kolejne zdjęcie jest odrzucone.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kiedy wgrywanie | Tylko dziś w Europe/Warsaw, gdy ten dzień ma trening | Spóźniony i przyszły trening zostają przy opisie, zgodnie z oknem dnia treningu |
| Błędny odczyt | Zawodnik poprawia liczby i dopiero potwierdzenie zapisuje zgłoszenie | Błędna cyfra nie wchodzi do danych, a sam podgląd jeszcze nie jest oddaniem |
| Info dla trenera | Teraz zapis odczytu, wartości i znacznika; napis dla trenera w S-05 | Zawodnik przed potwierdzeniem widzi, że trener dostanie informację, a ekran trenera zostaje w S-05 |
| Bramka | Kilometry większe od zera | Sam czas 42:10 i dystans 0 km nie przechodzą, bo 0 km znaczy brak zgłoszenia |
| Pola odczytu | Kilometry, czas i prędkość maksymalna | Na dole widać to, co screen zwykle zawiera; o potwierdzeniu decydują tylko kilometry |
| Drugie zdjęcie | Do potwierdzenia zastępuje próbę; po potwierdzeniu jest odrzucone | Jedno zdjęcie dotyczy zgłoszenia, które przeszło; podmiana po fakcie to S-06 |
| Plik i model | Prywatny bucket, OpenRouter dostaje krótki adres | Worker nie trzyma bajtów zdjęcia z telefonu |

## Scope

**In scope:**

- Wiersz zgłoszenia, prywatny bucket, funkcje zawodnika
- Wgranie z telefonu, napis „Odczyt trwa”, trzy pola na dole popupu
- Poprawka, potwierdzenie, znacznik `athlete_edited` i odmowa kolejnego pliku

**Out of scope:**

- Podgląd trenera i napis o poprawce na jego ekranie (S-05)
- Ranking (S-04) oraz usunięcie albo podmiana po potwierdzeniu (S-06)
- Wgrywanie poza dziś w Warszawie i poza dniem z treningiem

## Architecture / Approach

Przeglądarka wgrywa plik podpisanym adresem do `training-photos`. Popup woła serwer i zostaje otwarty. Serwer przekazuje modelowi krótki adres i zapisuje odczyt kluczem service role. Potwierdzenie porównuje wpisane liczby z tym odczytem. Ścieżka obiektu to `{team_id}/{training_id}/{user_id}`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Zgłoszenie i plik | Tabela, bucket, reguły dnia, kilometrów i znacznika | Zły kontrakt kolumn rozjedzie odczyt i potwierdzenie |
| 2. Wgranie i odczyt | Plik, „Odczyt trwa”, trzy pola, podmiana przed potwierdzeniem | OpenRouter nie pobierze adresu lokalnego Storage |
| 3. Potwierdzenie | Edycja, zdanie o trenerze, zapis 6,0 km, blokada kolejnego pliku | Znacznik ustawi się także wtedy, gdy zawodnik nic nie zmienił |

**Prerequisites:** S-01 i S-02 są zrobione. Lokalnie potrzebne są `OPENROUTER_API_KEY` i `SUPABASE_SERVICE_ROLE` oraz adres Storage osiągalny dla modelu przy ręcznym odczycie.
**Estimated effort:** około 3 sesje po godzinach, jedna osoba.

## Open Risks & Assumptions

- Jakość odczytu zależy od screena. Zestaw zegarków do prób jest nadal otwarty i tego planu nie blokuje.
- Adres `127.0.0.1` lokalnego Storage nie jest dla OpenRouter osiągalny.
- Podświetlenie „dziś” w siatce może wskazać inny dzień niż bramka warszawska.
- Napis dla trenera zobaczy dopiero S-05. Do tego czasu znacznik leży w bazie.
- Usunięcie dzisiejszego treningu kasuje wiersz i może zostawić obiekt w prywatnym buckecie.

## Success Criteria (Summary)

- Zawodnik w dzisiejszym treningu wgrywa jedno zdjęcie, widzi „Odczyt trwa”, a potem kilometry, czas i prędkość maksymalną.
- Zmiana 6,5 km na 6,0 km pokazuje zapowiedź dla trenera i zapisuje obie liczby ze znacznikiem. Bez poprawki znacznik zostaje wyłączony.
- 0 km, sam czas, wczoraj, jutro i dzień bez treningu nie dają zgłoszenia. Po potwierdzeniu kolejnego zdjęcia nie ma.
