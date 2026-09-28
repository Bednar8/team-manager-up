# Coach upcoming training Implementation Plan

## Overview

Trener dodaje na wybrany dzień jeden trening z krótkim opisem. W komórce kalendarza pojawia się ikona biegu, a od szerokości `lg` także napis „trening”. Opis można zmienić albo trening usunąć, gdy dzień jest dzisiejszy albo późniejszy. Dzień miniony jest tylko do odczytu, tak samo dla zawodnika.

## Current State Analysis

Kalendarz na `/calendar` jest gotowy jako siatka miesiąca i okno dnia. Komórka pokazuje sam numer. Trener widzi placeholder „Tutaj będzie dodanie treningu”, a dzień miniony osobny tekst o przyszłym podglądzie. Nie ma tabeli treningów, formularza ani zapisu.

Rola `coach` albo `athlete` i jeden zespół na konto już są. Odczyty idą z Astro przez RLS. Zapisy idą przez `POST` i funkcję w Postgresie. W przeglądarce nie ma klienta Supabase. Miesiąc przełącza się w stanie wyspy, bez nowego wejścia na stronę, więc dane treningów muszą przyjść razem ze stroną, a nie przy każdej zmianie miesiąca.

„Dziś” w siatce to lokalna data przeglądarki. Zanim wyspa się nawodni, ta data jest pusta (`todayOnServer` zwraca `null`).

## Desired End State

Zalogowany trener klika dzień dzisiejszy albo przyszły, wpisuje opis (1–200 znaków po obcięciu spacji) i zapisuje. W tej komórce, także gdy dzień należy do sąsiedniego miesiąca w siatce, widać ikonę `Footprints`. Od `lg` (1024 px) obok ikony jest napis „trening”. Poniżej `lg` zostaje sama ikona. Drugi trening tego samego dnia się nie zapisuje.

Ten sam trener na dniu dzisiejszym albo przyszłym poprawia opis albo usuwa trening. Na dniu minionym widzi opis, albo zdanie „Tego dnia nie było treningu.”, bez formularza i bez usuwania.

Zawodnik widzi te same znaczniki i czyta opis. Nie ma dodawania, edycji ani usuwania. Dzień bez treningu mówi „Tego dnia nie ma treningu.”, a miniony pusty dzień — „Tego dnia nie było treningu.”

Sprawdzenie: trener przechodzi dodanie, poprawkę i usunięcie na dziś, podgląd dnia minionego i widok wąski; zawodnik na tym samym zespole widzi ikonę i opis bez akcji zapisu. `npm run lint` i `npm run build` przechodzą.

### Key Discoveries:

- Siatka i okno dnia: `src/components/calendar/MonthCalendar.tsx`. Dzień miniony rozróżnia `isPastCivil` w `src/components/calendar/month.ts`.
- Strona przekazuje tylko `initialDate` i `role`: `src/pages/calendar.astro`.
- Wzorzec zapisu: `src/pages/api/team.ts` woła `supabase.rpc`, potem przekierowanie z `error` w query.
- Zakres zespołu: `private.caller_team_id()` i `private.is_coach_of_team` w `supabase/migrations/20260926184325_athlete_joins_with_code.sql`.
- Ikony: `lucide-react`, już użyty przy logowaniu. Biblioteka ikon w `components.json` to `lucide`.
- FR-001 zostaje: jeden trening na dzień, bez daty wstecznej. FR-002 i FR-003 w dosłownym brzmieniu mówią o edycji tylko przyszłej daty. Ten plan świadomie obejmuje też dzień dzisiejszy, zgodnie z decyzją przy planowaniu.

## What We're NOT Doing

- Wgrywanie zdjęcia, odczyt, lista „kto oddał” i ranking (S-03, S-05, S-04).
- Drugi trening tego samego dnia, osobna godzina, dystans albo tytuł obok opisu.
- Przenoszenie treningu na inny dzień. Zmiana dotyczy tylko opisu.
- Dodawanie, edycja i usuwanie przez zawodnika oraz jakiekolwiek zapisy na dzień miniony.
- Dociąganie miesiąca osobnym API albo klient Supabase w przeglądarce.
- Potwierdzenie usunięcia w drugim kroku. Przycisk „Usuń” od razu wysyła formularz.
- Przepisanie zdań outcome w roadmapie. Status S-01 przechodzi na `planning`; treść outcome zostaje, dopóki roadmapa nie zostanie osobno zaktualizowana.

## Implementation Approach

Jedna tabela `public.trainings` należy do zespołu i ma najwyżej jeden wiersz na dzień. Członkowie zespołu mogą ją czytać przez RLS. Zapis, zmiana opisu i usunięcie idą wyłącznie przez trzy funkcje `security definer`. Funkcja bierze zespół z sesji, wymaga roli trenera, obcina opis i porównuje dzień z cywilnym „dziś” w `Europe/Warsaw`. Przeglądarka nie jest jedyną blokadą.

`calendar.astro` wczytuje wszystkie treningi zespołu i przekazuje je do wyspy. Zmiana miesiąca filtruje już obecną listę. Formularze w oknie dnia to zwykły `POST` na trasy Astro, tak jak założenie zespołu. Po sukcesie i po błędzie przeglądarka wraca na `/calendar?date=YYYY-MM-DD`. Błąd z funkcji jest tym tekstem, który widać w oknie.

Reguła produktu: zapis, edycja i usunięcie działają, gdy `training_on` jest równe warszawskiemu dziś albo od niego późniejsze. Dzień wcześniejszy funkcja odrzuca. Jeden zestaw reguł siedzi w bazie, a interfejs tylko go odzwierciedla.

## Critical Implementation Details

- **Kiedy wolno pokazać zapis.** `today` jest `null` do nawodnienia wyspy. Dopóki nie jest ciągiem `YYYY-MM-DD`, okno nie pokazuje formularza, „Zapisz” ani „Usuń”. Jeśli trening na ten dzień już jest, widać sam opis. Inaczej pusty dzień miniony przez chwilę wyglądałby jak formularz dodawania.
- **Kształt tras.** Trzy endpointy żyją jako `src/pages/api/trainings/create.ts`, `update.ts` i `delete.ts`. Nie dodawaj obok tego pliku `src/pages/api/trainings.ts`: plik i katalog o tej samej nazwie w `src/pages` się wykluczają. Tych ścieżek nie wpisuj do `PROTECTED_ROUTES`. Tak jak `/api/team`, same sprawdzają sesję.

## Phase 1: Rekord treningu

### Overview

W bazie pojawia się trening zespołu oraz trzy funkcje, które pilnują trenera, długości opisu i tego, że dzień nie jest miniony.

### Changes Required:

#### 1. Migracja treningów

**File**: `supabase/migrations/YYYYMMDDHHmmss_coach_trainings.sql`

**Intent**: Dodać miejsce na jeden opis dziennie i wymusić reguły daty w bazie, zanim powstanie formularz. Nazwa pliku bierze znacznik czasu z chwili implementacji.

**Contract**: Tabela `public.trainings`: `id uuid` klucz główny, `team_id uuid not null` z odwołaniem do `public.teams(id)` i `on delete cascade`, `training_on date not null`, `description text not null`, `created_at timestamptz not null default now()`. Unikat `(team_id, training_on)`. `char_length(description)` od 1 do 200. `revoke all` od `anon`, `authenticated` i `public`, potem `grant select` dla `authenticated`. RLS włączone. Jedna polityka `select` dla `authenticated`: `team_id = private.caller_team_id()`. Bez polityk i bez grantów `insert`, `update` i `delete`.

Funkcje `security definer`, `search_path = public`, `grant execute` dla `authenticated`:

```text
public.create_training(training_on date, description text) returns void
public.update_training_description(training_on date, description text) returns void
public.delete_training(training_on date) returns void
```

Zespół bierze `private.caller_team_id()`. Brak zespołu albo brak `private.is_coach_of_team(team_id)` kończy się komunikatem „Tylko trener może zmieniać treningi.” Opis zapisany w tabeli jest obcięty ze spacji na brzegach. Po obcięciu długość spoza 1–200 kończy się komunikatem „Opis musi mieć od 1 do 200 znaków.” Dzień wcześniejszy niż warszawskie dziś kończy się komunikatem „Trening można dodać, zmienić albo usunąć tylko na dziś lub później.” Drugi trening tego samego dnia: „Tego dnia trening już jest.” Aktualizacja albo usunięcie dnia bez wiersza: „Tego dnia nie ma treningu.”

Warszawskie dziś, używane we wszystkich trzech funkcjach:

```sql
(timezone('Europe/Warsaw', now()))::date
```

`create_training` wstawia wiersz. `update_training_description` zmienia tylko `description` istniejącego wiersza tego zespołu i dnia. `delete_training` usuwa ten wiersz. Żadna funkcja nie przyjmuje `team_id` od klienta.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Lokalna migracja aplikuje się przez `npx supabase db reset`, a funkcje odrzucają datę minioną, pusty opis i drugi trening tego samego dnia oraz przyjmują zapis trenera na dziś

**Implementation Note**: Po zielonym lint i build zatrzymaj się na ręczne potwierdzenie migracji, zanim ruszysz fazę 2. Faza używa zwykłych myślników. Odpowiadające im pola `- [ ]` są tylko w `## Progress`.

---

## Phase 2: Kalendarz

### Overview

Kalendarz pokazuje treningi i daje trenerowi dodawanie, poprawkę oraz usuwanie na dziś i później. Zawodnik i dzień miniony zostają przy odczycie.

### Changes Required:

#### 1. Odczyt treningów na stronie kalendarza

**File**: `src/pages/calendar.astro`

**Intent**: Przekazać wyspie listę treningów zespołu i ewentualny błąd zapisu, żeby zmiana miesiąca nie gubiła ikon.

**Contract**: Po ustaleniu roli odczyt `trainings` (`training_on`, `description`) tym samym klientem serwerowym. Błąd zapytania przerywa render, tak jak błąd członkostwa, zamiast pokazać pusty miesiąc. Do `MonthCalendar` dochodzą lista `{ trainingOn: string, description: string }` oraz `error` z query, gdy jest. `training_on` zostaje cywilnym `YYYY-MM-DD`. Bez filtra na widoczny miesiąc.

#### 2. Znacznik i okno dnia

**File**: `src/components/calendar/MonthCalendar.tsx`

**Intent**: Zastąpić placeholdery realnym treningiem: ikona w komórce i okno zależne od roli oraz od tego, czy dzień jest miniony.

**Contract**: Gdy na dacie jest trening, w przycisku dnia pod numerem jest ikona `Footprints` z `lucide-react` i napis `trening`. Napis ma `hidden lg:inline`. Ikona jest zawsze, także poniżej `lg` i na dniach sąsiedniego miesiąca w siatce. Kolor ikony i napisu idzie z koloru tekstu komórki, także na zaznaczonym dniu (`text-primary-foreground`). `aria-label` dnia z treningiem dokleja `, trening`.

Okno, gdy `today` jest już znane:

| Kto | Dzień | Trening | Zawartość |
| --- | --- | --- | --- |
| trener | dziś lub później | nie | formularz opisu, przycisk „Dodaj” |
| trener | dziś lub później | tak | opis w polu, „Zapisz” i osobny formularz „Usuń” |
| trener | miniony | tak | sam opis, bez pól zapisu |
| trener | miniony | nie | „Tego dnia nie było treningu.” |
| zawodnik | dowolny | tak | sam opis |
| zawodnik | dziś lub później | nie | „Tego dnia nie ma treningu.” |
| zawodnik | miniony | nie | „Tego dnia nie było treningu.” |

Etykieta pola: „Opis”. To natywny `textarea` (w repo nie ma komponentu Textarea), z klasami zbliżonymi do pola w `src/components/auth/FormField.tsx`, bez wymogu ikony tego komponentu. `name="description"`, `required`, `maxLength={200}`. Ukryte pole `training_on` równa się wybranej dacie cywilnej, nie „dziś”. „Dodaj” wysyła `POST` na `/api/trainings/create`. „Zapisz” na `/api/trainings/update`. „Usuń” na `/api/trainings/delete`. „Zamknij” zostaje.

Gdy w adresie jest `error` i otwarty jest dzień z tego wejścia, komunikat widać w oknie jako tekst. Zmiana dnia albo zamknięcie okna chowa go w stanie wyspy. Zamknięcie usuwa z adresu także `error`, tak jak dziś usuwa `date`.

#### 3. Trasy zapisu

**File**: `src/pages/api/trainings/create.ts`, `src/pages/api/trainings/update.ts`, `src/pages/api/trainings/delete.ts`

**Intent**: Przyjąć formularz z okna dnia i oddać reguły funkcji w bazie, tym samym kształtem przekierowania co założenie zespołu.

**Contract**: Każda trasa to `POST`. Bez sesji przekierowanie na `/auth/signin`. Brak konfiguracji Supabase przekierowuje na `/calendar` z komunikatem, jak `src/pages/api/team.ts` robi to dla swojej strony. Pola formularza idą do odpowiadającej funkcji: `create_training`, `update_training_description`, `delete_training`. Sukces wraca na `/calendar?date=` z tą datą. Błąd wraca na ten sam adres z `error` równym `error.message` z funkcji, po `encodeURIComponent`. Trasa nie liczy warszawskiego dziś drugi raz i nie obcina opisu po swojemu.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Trener dodaje trening na dziś: w komórce jest ikona, od szerokości lg także napis „trening”, poniżej lg sama ikona
- Trener poprawia opis i usuwa trening na dziś lub w przyszłości; na dniu minionym nie ma tych akcji, jest opis albo informacja, że treningu nie było
- Zawodnik widzi tę samą ikonę i czyta opis, bez dodawania, edycji i usuwania
- Pusty dzień przyszły u trenera pokazuje formularz; pusty dzień miniony pokazuje „Tego dnia nie było treningu.” bez formularza

**Implementation Note**: Po zielonym lint i build zatrzymaj się na ręczne przejście tych czterech sprawdzeń w przeglądarce, na szerokim oknie i poniżej 1024 px, kontem trenera i kontem zawodnika tego samego zespołu.

---

## Testing Strategy

### Unit Tests:

Nie dodajemy runnera. W repozytorium go nie ma. Reguły daty i długości opisu sprawdza faza 1 na lokalnej bazie, a faza 2 w przeglądarce.

### Integration Tests:

Nie dodajemy testu e2e. Przepływ od formularza do ikony jest w ręcznych krokach poniżej.

### Manual Testing Steps:

1. `npx supabase db reset` na lokalnym Supabase. Jako trener: zapis na dziś przechodzi; zapis na wczoraj, pusty opis i drugi zapis tego samego dnia kończą się komunikatami z kontraktu fazy 1.
2. W aplikacji trener dodaje trening na dziś z opisem „minimum 5 km”. Ikona jest w komórce. Od 1024 px widać „trening”, węziej tylko ikonę.
3. Trener zmienia opis i usuwa trening. Po usunięciu ikona znika, a okno znowu jest formularzem.
4. Dzień wczorajszy z treningiem (wstawiony w bazie albo dodany wczoraj, zanim dzień minął) pokazuje opis bez „Zapisz” i „Usuń”. Wczoraj bez treningu pokazuje „Tego dnia nie było treningu.”
5. Zawodnik tego zespołu widzi ikonę i opis oraz zdania o braku treningu. Nie widzi formularza.
6. Opis ze samych spacji i opis dłuższy niż 200 znaków nie zapisują się. W oknie widać komunikat z funkcji.

## Performance Considerations

Jeden zespół ma co najwyżej jeden wiersz na dzień. Odczyt całej historii przy wejściu na `/calendar` jest mały wobec siatki, którą i tak rysujemy w całości. Nie dodajemy paginacji ani dociągania miesiąca.

## Migration Notes

Nie ma istniejących wierszy treningów do przeniesienia. Nowa tabela i funkcje. `npx supabase db reset` czyści lokalną bazę, zanim nałoży migracje. Na środowisku ze wspólnymi danymi resetu nie uruchamiaj. Tam migracja ma tylko dołożyć tabelę.

## References

- PRD: `context/foundation/prd.md` (FR-001–FR-005, US-01)
- Roadmapa: `context/foundation/roadmap.md` (S-01, Change ID `coach-upcoming-training`)
- Kalendarz: `src/components/calendar/MonthCalendar.tsx`, `src/pages/calendar.astro`
- Wzorzec zapisu: `src/pages/api/team.ts`
- Pomocnicze funkcje zespołu: `supabase/migrations/20260926184325_athlete_joins_with_code.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rekord treningu

#### Automated

- [x] 1.1 `npm run lint` przechodzi — 9e633e5
- [x] 1.2 `npm run build` przechodzi — 9e633e5

#### Manual

- [x] 1.3 Lokalna migracja aplikuje się przez `npx supabase db reset`, a funkcje odrzucają datę minioną, pusty opis i drugi trening tego samego dnia oraz przyjmują zapis trenera na dziś — 9e633e5

### Phase 2: Kalendarz

#### Automated

- [x] 2.1 `npm run lint` przechodzi
- [x] 2.2 `npm run build` przechodzi

#### Manual

- [x] 2.3 Trener dodaje trening na dziś: w komórce jest ikona, od szerokości lg także napis „trening”, poniżej lg sama ikona
- [x] 2.4 Trener poprawia opis i usuwa trening na dziś lub w przyszłości; na dniu minionym nie ma tych akcji, jest opis albo informacja, że treningu nie było
- [x] 2.5 Zawodnik widzi tę samą ikonę i czyta opis, bez dodawania, edycji i usuwania
- [x] 2.6 Pusty dzień przyszły u trenera pokazuje formularz; pusty dzień miniony pokazuje „Tego dnia nie było treningu.” bez formularza
