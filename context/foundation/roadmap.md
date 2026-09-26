---
project: "Team Manager"
version: 1
status: draft
created: 2026-09-26
updated: 2026-09-26
prd_version: 1
main_goal: speed
top_blocker: capacity
milestone_id: training-photo-to-km-ranking
milestone_seq: 1
milestone_status: open
---

# Roadmap: Team Manager

> Derived from context/foundation/prd.md (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Od zdjęcia treningu do rankingu kilometrów** — Status: open

- **Intent:** Jeden zespół przechodzi trening od daty i krótkiego opisu, przez jedno zdjęcie z potwierdzonym odczytem, do listy kto oddał i rankingu po kilometrach. To domyka pierwsze kryterium sukcesu z PRD.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** US-01, FR-001–FR-011, FR-013, FR-014

## Vision recap

Trener zespołu biegowego zbiera screeny treningów na WhatsAppie i sam sprawdza, kto przesłał zdjęcie. Gdy potrzebuje statystyk, przepisuje liczby do Excela, bo czat nie zapisuje danych. Zawodnicy mają różne aplikacje, więc pierwsza wersja bierze zdjęcie i wspólny ranking po kilometrach, a integracje z aplikacjami biegowymi zostają na później.

## North star

> Gwiazda przewodnia (north star) to najmniejszy pełny przepływ widoczny dla użytkownika, który udowadnia, że produkt rozwiązuje opisany problem. Stawiamy go tak wcześnie, jak pozwalają zależności, bo pozostałe kawałki mają sens tylko wtedy, gdy ten przepływ działa.

**S-04: trener i zawodnik widzą ranking po przebiegniętych kilometrach** — ten kawałek domyka pierwsze kryterium sukcesu: kilometry ze zdjęć zastępują przepisywanie do Excela. Lista „kto oddał” (S-05) jest drugą połową tej samej historyjki i może powstać w tej samej fali; ranking jest gwiazdą przewodnią, bo bez niego zostaje sam podgląd obecności.

Publikacja rankingu jest zablokowana, dopóki nie zostanie zsynchronizowana historyjka US-01 (ranking od razu po zgłoszeniach) z FR-014 (ranking następnego dnia).

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                                         | Prerequisites | PRD refs                                      | Status   |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------- | -------- |
| F-01 | team-role-for-one-squad   | (foundation) konto ma rolę trenera albo zawodnika w jednym zespole                           | —             | Access Control                                | done        |
| S-01 | coach-upcoming-training   | trener dodaje, poprawia opis albo usuwa przyszły trening, a zalogowana osoba widzi kalendarz | F-01          | FR-001, FR-002, FR-003, FR-004, FR-005, US-01 | proposed |
| S-02 | athlete-joins-with-code   | zawodnik dołącza do zespołu kodem od trenera                                                 | F-01          | US-01                                         | proposed |
| S-03 | photo-readout-confirm     | zawodnik wgrywa jedno zdjęcie w dniu treningu, widzi odczyt i potwierdza dane                | S-01, S-02    | FR-005, FR-006, FR-007, FR-013, US-01         | proposed |
| S-04 | km-ranking-publication    | trener i zawodnik widzą ranking po kilometrach, z 0 km bez zgłoszenia                        | S-03          | FR-010, FR-011, FR-014, US-01                 | blocked  |
| S-05 | coach-sees-submissions    | trener widzi, kto oddał zdjęcie, a kto nie, i może podejrzeć przesłane                       | S-03          | FR-008, US-01                                 | proposed |
| S-06 | athlete-photo-edit-window | zawodnik zmienia albo usuwa swoje zdjęcie, dopóki nie ma następnego dnia                     | S-03          | FR-009                                        | proposed |

## Baseline

What's already in place in the codebase as of 2026-09-26 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7, wyspy React 19, Tailwind 4, shadcn/ui (`package.json`, `astro.config.mjs`). Per tech-stack.md: starter Astro.
- **Backend / API:** partial — SSR na Cloudflare, tylko trasy logowania (`src/pages/api/auth/`). Brak API domeny. Per tech-stack.md: serwer Astro i Workers.
- **Data:** partial — klient Supabase tylko do logowania (`src/lib/supabase.ts`). Brak migracji, schematu i seed. Per tech-stack.md: Postgres przez Supabase.
- **Auth:** present — Supabase Auth, sesja w ciasteczkach, middleware chroni `/dashboard` (`src/middleware.ts`). Per tech-stack.md: logowanie włączone.
- **Deploy / infra:** partial — konfiguracja Workers (`wrangler.jsonc`); CI tylko lint, build i smoke, bez wdrożenia (`.github/workflows/ci.yml`). Per tech-stack.md: Cloudflare Workers, GitHub Actions, wdrożenie ręczne.
- **Observability:** absent — brak logowania aplikacji, śledzenia błędów i metryk. tech-stack.md tego nie nazywa.

## Foundations

### F-01: Rola w jednym zespole

- **Outcome:** (foundation) zalogowane konto jest albo trenerem, który zakłada jeden zespół, albo zawodnikiem tego zespołu; istniejące logowanie zostaje bez zmian.
- **Change ID:** team-role-for-one-squad
- **PRD refs:** Access Control
- **Unlocks:** S-01, S-02
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stoi na początku, bo trener i zawodnik mają widzieć różne akcje. Bez tego S-01 i S-02 nie da się planować obok siebie, a każda z nich musiałaby na nowo ustalać, kto jest kim.
- **Status:** done

## Slices

### S-01: Trening na przyszły dzień

- **Outcome:** trener może dodać trening (data + krótki opis) bez daty wstecznej i bez drugiego treningu tego samego dnia, zmienić opis albo usunąć go tylko gdy data jest przyszła, a zalogowana osoba widzi kalendarz, w tym dni bez treningu.
- **Change ID:** coach-upcoming-training
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, FR-005, US-01
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jeden zestaw reguł daty (brak wstecz, jeden trening na dzień, edycja i usuwanie tylko przyszłych) musi być spójny, inaczej obecność i ranking rozjadą się już na starcie. Wgrywanie zdjęcia jest dopiero w S-03; tu kalendarz tylko pokazuje, gdzie trening jest.
- **Status:** proposed

### S-02: Dołączenie kodem trenera

- **Outcome:** zawodnik może dołączyć do zespołu kodem od trenera, a trener widzi skład zespołu.
- **Change ID:** athlete-joins-with-code
- **PRD refs:** US-01
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** US-01 zakłada zespół z zawodnikami, a Access Control wskazuje kod od trenera i oznacza to jako nie zablokowane. Skład musi istnieć, zanim da się pokazać, kto nie oddał zdjęcia i kto ma 0 km.
- **Status:** proposed

### S-03: Zdjęcie, odczyt i potwierdzenie

- **Outcome:** zawodnik może wgrać jedno zdjęcie tylko w dniu z treningiem, widzieć na dole, co udało się odczytać, i zaznaczyć, czy dane są poprawne; bez przynajmniej jednego parametru (liczba kilometrów) zgłoszenie nie przechodzi.
- **Change ID:** photo-readout-confirm
- **PRD refs:** FR-005, FR-006, FR-007, FR-013, US-01
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jakie przykładowe screeny z różnych zegarków weźmiemy do prób? — Owner: user. Block: no.
- **Risk:** Odczyt ze zdjęcia nie istnieje w obecnym kodzie i jest jedynym miejscem, w którym US-01 może polec, mimo że sam przepływ da się zaplanować (wymagany jest co najmniej jeden parametr). Po wgraniu zawodnik ma widzieć, że odczyt trwa, a zdjęcie ma zostać w zespole i dać się wgrać z telefonu.
- **Status:** proposed

### S-04: Ranking po kilometrach

- **Outcome:** trener i zawodnik mogą zobaczyć ranking po liczbie przebiegniętych kilometrów, a osoba bez zgłoszenia ma 0 km; moment pokazania rankingu (od razu albo następnego dnia) nie jest jeszcze ustalony.
- **Change ID:** km-ranking-publication
- **PRD refs:** FR-010, FR-011, FR-014, US-01
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - US-01 pokazuje ranking od razu po zgłoszeniach, a FR-014 każe opublikować go następnego dnia. Która zasada obowiązuje? — Owner: user. Block: yes.
- **Risk:** To gwiazda przewodnia i stoi tuż po odczycie, bo prędkość każe dowieźć konieczny dowód, gdy tylko są kilometry. Dwie sprzeczne zasady publikacji blokują planowanie; S-05 i S-06 mogą iść obok, bo nie rozstrzygają tego pytania.
- **Status:** blocked

### S-05: Kto oddał zdjęcie

- **Outcome:** trener może zobaczyć, kto wysłał zdjęcie treningu, a kto nie, i podejrzeć, co przesłali.
- **Change ID:** coach-sees-submissions
- **PRD refs:** FR-008, US-01
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Druga połowa US-01, w tej samej fali co ranking. Podgląd zdjęcia zostaje przy trenerze; osoby spoza zespołu go nie widzą.
- **Status:** proposed

### S-06: Poprawka zdjęcia do następnego dnia

- **Outcome:** zawodnik może usunąć albo podmienić swoje jedno zdjęcie treningu tylko jeśli nie ma jeszcze następnego dnia.
- **Change ID:** athlete-photo-edit-window
- **PRD refs:** FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Okno poprawki zmienia kilometry, które wejdą do rankingu, dlatego ląduje obok S-04, a nie przed odczytem. Zamknięcie okna wynika z FR-009 (brak następnego dnia) i nie czeka na rozstrzygnięcie, kiedy ranking staje się widoczny.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                           | Ready for `/10x-plan` | Notes                                      |
| ---------- | ------------------------- | --------------------------------------------------------------- | --------------------- | ------------------------------------------ |
| F-01       | team-role-for-one-squad   | Konto jest trenerem albo zawodnikiem jednego zespołu            | yes                   | Jedyny kawałek gotowy do planu             |
| S-01       | coach-upcoming-training   | Trener ustawia, poprawia i usuwa przyszły trening w kalendarzu  | no                    | Czeka na F-01; równolegle z S-02           |
| S-02       | athlete-joins-with-code   | Zawodnik dołącza do zespołu kodem od trenera                    | no                    | Czeka na F-01; równolegle z S-01           |
| S-03       | photo-readout-confirm     | Zawodnik wgrywa jedno zdjęcie, widzi odczyt i potwierdza dane   | no                    | Czeka na S-01 i S-02                       |
| S-04       | km-ranking-publication    | Ranking po kilometrach dla trenera i zawodnika                  | no                    | Zablokowany przez sprzeczność US-01/FR-014 |
| S-05       | coach-sees-submissions    | Trener widzi, kto oddał zdjęcie, i może je podejrzeć            | no                    | Czeka na S-03; równolegle z S-04 i S-06    |
| S-06       | athlete-photo-edit-window | Zawodnik poprawia albo usuwa zdjęcie, zanim jest następny dzień | no                    | Czeka na S-03; równolegle z S-04 i S-05    |

## Open Roadmap Questions

1. **Jak zawodnik trafia do zespołu?** — Kierunek: kod od trenera. Nie zablokowane. Owner: user. Block: —.
2. **Jakie przykładowe screeny z różnych zegarków weźmiemy do prób?** — TBD. Owner: user. Block: —.
3. **Jaki konkretny mechanizm logowania?** — "Mechanizm logowania (email + hasło / OAuth / bez hasła) nie został wybrany." TBD. Owner: user. Block: —.
4. **US-01 vs FR-014:** historyjka pokazuje ranking od razu po zgłoszeniach; Socrates ustalił publikację następnego dnia. Zsynchronizować US-01. Owner: user. Block: S-04.

## Parked

- **Ranking po czasie lub szybkości (FR-012)** — Why parked: nice-to-have i drugie kryterium sukcesu „jeśli starczy czasu”; cel sekwencjonowania to szybkość, więc poza konieczną ścieżką.
- **Raporty CSV/PDF** — Why parked: PRD §Non-Goals; trener ma listę kto oddał i ranking.
- **Integracje z aplikacjami biegowymi** — Why parked: PRD §Non-Goals; pierwsza wersja bierze zdjęcie.
- **Wiele zespołów** — Why parked: PRD §Non-Goals; v1 to jeden zespół.
- **Dodatkowe role (admin klubu, rodzic)** — Why parked: PRD §Non-Goals; v1 to trener i zawodnik.

## Milestone History

(Pusty — pierwszy kamień milowy.)

## Done

- **F-01: (foundation) zalogowane konto jest albo trenerem, który zakłada jeden zespół, albo zawodnikiem tego zespołu; istniejące logowanie zostaje bez zmian.** — Archived 2026-09-26 → `context/archive/2026-09-26-team-role-for-one-squad/`. Lesson: —.
