# Coach upcoming training — Plan Brief

> Full plan: `context/changes/coach-upcoming-training/plan.md`

## What & Why

Trener ma móc postawić na dniu jeden trening z krótkim opisem, zobaczyć go w kalendarzu i poprawić albo usunąć, dopóki dzień nie minął. Zawodnik ma widzieć ten sam dzień i przeczytać zadanie, bez własnego zapisu. Zdjęcie i ranking zostają na późniejsze slice’y.

## Starting Point

`/calendar` rysuje miesiąc i okno dnia, ale komórka ma sam numer, a okno placeholder. Rola trenera i zawodnika oraz jeden zespół na konto już są. Tabeli treningów nie ma. Miesiąc przełącza się w przeglądarce, a zapisy w tym repo idą przez formularz, trasę Astro i funkcję w Postgresie.

## Desired End State

Po zapisie na dziś albo później w komórce jest ikona biegu. Od 1024 px obok niej jest napis „trening”, węziej sama ikona. Trener na takim dniu poprawia opis albo usuwa trening. Dzień miniony pokazuje opis albo informację, że treningu nie było. Zawodnik widzi to samo i nie ma przycisków zapisu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Okno edycji i usuwania | Dziś i przyszłość; dzień miniony tylko do odczytu | Tak padło w tym planowaniu; dosłowne FR-002/FR-003 („tylko przyszła data”) tego nie obejmują, a dzień dzisiejszy nadal jest niewykonany do końca doby |
| Opis | Wymagany, po obcięciu spacji 1–200 znaków | US-01 traktuje opis jak zadanie, a pusta ikona nie mówi, co przebiec |
| Kto widzi | Trener i zawodnik widzą ikonę i opis; zawodnik tylko czyta | Kalendarz ma pokazać, gdzie trening jest, a opis jest zadaniem z US-01 |
| Napis „trening” | Tylko od `lg` (1024 px) w górę | Ten sam próg już skraca nazwy dni w siatce |
| Podgląd dnia minionego | Opis albo „Tego dnia nie było treningu.”; bez listy zdjęć | Lista „kto wrzucił” jest w S-05 |
| Jeden trening na dzień | Unikat `(team_id, training_on)` | FR-001; drugi zapis tego dnia jest błędem, nie nadpisaniem |
| Zapis | Odczyt całej listy na stronie, `POST` i funkcja w bazie | Miesiąc i tak zmienia się bez nowego requestu, a historii jednego zespołu jest mało |
| „Dziś” po stronie serwera | Cywilna data `Europe/Warsaw` | Zespół jest polski, a sama przeglądarka nie może puszczać zapisu na wczoraj |
| Ikona | `Footprints` i dosłowny napis `trening` | W projekcie ikony są z Lucide, a napis został podany wprost |

## Scope

**In scope:**

- Tabela treningów, odczyt dla członków zespołu, trzy funkcje zapisu trenera
- Ikona i napis w komórce, okno dodawania, edycji, usuwania i podglądu
- Trasy `POST` wracające na wybrany dzień

**Out of scope:**

- Zdjęcie, odczyt, lista zgłoszeń, ranking
- Drugi trening dziennie, zmiana daty treningu, godzina i dystans
- Zapis przez zawodnika i zapis na dzień miniony

## Architecture / Approach

`public.trainings` trzyma dzień i opis. RLS puszcza `select` tylko w zespole wywołującego. Wstawienie, zmiana opisu i usunięcie robią funkcje, które sprawdzają trenera i warszawskie dziś. Strona kalendarza oddaje listę wyspie. Formularz w oknie wysyła datę klikniętego dnia i opis. Błąd funkcji wraca w query i jest pokazywany w oknie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rekord treningu | Tabela i funkcje z regułą daty oraz długością opisu | `npx supabase db reset` czyści lokalną bazę |
| 2. Kalendarz | Znacznik, okno i trasy zapisu | Przyciski zapisu nie mogą mignąć, zanim wyspa pozna lokalne „dziś” |

**Prerequisites:** F-01 jest zrobione (rola i jeden zespół). Lokalny Supabase oraz konto trenera i zawodnika w tym samym zespole.
**Estimated effort:** około dwóch sesji, po jednej na fazę.

## Open Risks & Assumptions

- Przeglądarka używa lokalnej daty do tego, które przyciski widać. Baza używa `Europe/Warsaw`. Poza Polską te doby mogą się rozjechać; wtedy wygrywa baza i w oknie widać jej komunikat.
- S-03 nie może zakładać, że trening z dziś jest już zablokowany. Ten plan pozwala go jeszcze zmienić i usunąć.
- Zdanie outcome S-01 w roadmapie nadal mówi o edycji tylko przyszłej daty. Obowiązuje ten plan. Roadmapa dostaje wyłącznie status `planning`.

## Success Criteria (Summary)

- Trener dodaje trening na dziś, widzi ikonę, a od `lg` także napis „trening”.
- Trener poprawia opis i usuwa trening na dziś lub później. Dnia minionego nie zmienia.
- Zawodnik widzi ikonę i czyta opis, bez formularza.
