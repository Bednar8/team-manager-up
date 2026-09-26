# GitHub issue breakdown — M-1

Created on GitHub with `gh` on 2026-09-26. Milestone: https://github.com/Bednar8/team-manager-up/milestone/1. Repo: `Bednar8/team-manager-up`.

Source: `context/foundation/roadmap.md` (milestone `training-photo-to-km-ranking`, status open).

## Task system

| Candidate         | What is there                                                                                                                        | Decision                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| **GitHub Issues** | Remote `Bednar8/team-manager-up`. Issues enabled. Zero issues, zero milestones, default labels only. `gh` is logged in as `Bednar8`. | **Use this.**                  |
| Linear            | Workspace [Paweł Bednarski](https://linear.app/bednarski), one team, no projects.                                                    | Not the tracker for this repo. |

## Structure

One GitHub **milestone** = roadmap milestone M-1. One **issue** = one `F-NN` or `S-NN`. Parked items stay in the roadmap and are not issues.

| Roadmap field                            | GitHub                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Milestone M-1                            | Milestone `M-1: Od zdjęcia treningu do rankingu kilometrów`                          |
| Roadmap ID + suggested title             | Issue title `[F-01] …` / `[S-01] …`                                                  |
| Change ID                                | Stable key in the issue body (bridge to `/10x-plan`)                                 |
| Status `ready`                           | Label `ready`                                                                        |
| Status `proposed`                        | No status label (open issue)                                                         |
| Status `blocked`                         | Label `blocked`                                                                      |
| Foundation vs slice                      | Label `foundation` or `slice`                                                        |
| Prerequisites                            | Body field now; after creation, GitHub “blocked by” links to the prerequisite issues |
| Parallel with                            | Body field only (informational)                                                      |
| Open questions that do not block a slice | Milestone description                                                                |
| Blocking unknown on S-04                 | That issue’s body, plus label `blocked`                                              |

Labels to create (defaults such as `bug` and `enhancement` stay untouched):

| Label        | Color     | Meaning                                  |
| ------------ | --------- | ---------------------------------------- |
| `foundation` | `#5319e7` | Cross-cutting enabler (`F-NN`)           |
| `slice`      | `#0e8a16` | User-visible vertical slice (`S-NN`)     |
| `ready`      | `#fbca04` | Prerequisites met; can go to `/10x-plan` |
| `blocked`    | `#b60205` | At least one unknown with Block: yes     |

No dates, points, or size labels. Issue state stays **open**. Nothing is closed by this migration.

## Not migrated

- **Parked:** ranking po czasie lub szybkości (FR-012), raporty CSV/PDF, integracje z aplikacjami biegowymi, wiele zespołów, dodatkowe role.
- **Milestone History** and **Done** — both empty.
- **Baseline** — context for planning, not a work item.

## Milestone

**Title:** `M-1: Od zdjęcia treningu do rankingu kilometrów`

**Description:**

```markdown
Jeden zespół przechodzi trening od daty i krótkiego opisu, przez jedno zdjęcie z potwierdzonym odczytem, do listy kto oddał i rankingu po kilometrach. To domyka pierwsze kryterium sukcesu z PRD.

- **Roadmap:** `context/foundation/roadmap.md`
- **Milestone ID:** `training-photo-to-km-ranking`
- **Done when:** F-01 and S-01–S-06 are done.
- **North star:** S-04 — trener i zawodnik widzą ranking po przebiegniętych kilometrach. To najmniejszy pełny przepływ, który udowadnia, że produkt rozwiązuje problem (kilometry ze zdjęć zamiast Excela).

Otwarte pytania, które nie blokują żadnego issue:

1. Jak zawodnik trafia do zespołu? Kierunek: kod od trenera. Nie zablokowane.
2. Jakie przykładowe screeny z różnych zegarków weźmiemy do prób? Nie blokuje S-03.
3. Jaki konkretny mechanizm logowania? Nie wybrany. Nie blokuje (logowanie już jest).

Pytanie, które blokuje S-04, jest na tym issue: US-01 (ranking od razu) vs FR-014 (ranking następnego dnia).
```

## Issues

Created in this order so prerequisite numbers exist before “blocked by” links.

### 1. F-01 — `team-role-for-one-squad`

- **Title:** `[F-01] Konto jest trenerem albo zawodnikiem jednego zespołu`
- **Labels:** `foundation`, `ready`
- **Blocked by:** —

```markdown
## Outcome

(foundation) Zalogowane konto jest albo trenerem, który zakłada jeden zespół, albo zawodnikiem tego zespołu. Istniejące logowanie zostaje bez zmian.

## Identity

- **Roadmap ID:** F-01
- **Change ID:** `team-role-for-one-squad`
- **PRD refs:** Access Control
- **Status:** ready
- **Ready for `/10x-plan`:** yes

## Dependencies

- **Prerequisites:** —
- **Unlocks:** S-01, S-02
- **Parallel with:** —

## Planning

- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stoi na początku, bo trener i zawodnik mają widzieć różne akcje. Bez tego S-01 i S-02 nie da się planować obok siebie.

Source: `context/foundation/roadmap.md` (M-1).
```

### 2. S-01 — `coach-upcoming-training`

- **Title:** `[S-01] Trener ustawia, poprawia i usuwa przyszły trening w kalendarzu`
- **Labels:** `slice`
- **Blocked by:** F-01

```markdown
## Outcome

Trener może dodać trening (data + krótki opis) bez daty wstecznej i bez drugiego treningu tego samego dnia, zmienić opis albo usunąć go tylko gdy data jest przyszła, a zalogowana osoba widzi kalendarz, w tym dni bez treningu.

## Identity

- **Roadmap ID:** S-01
- **Change ID:** `coach-upcoming-training`
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, FR-005, US-01
- **Status:** proposed
- **Ready for `/10x-plan`:** no

## Dependencies

- **Prerequisites:** F-01 (`team-role-for-one-squad`)
- **Parallel with:** S-02 (`athlete-joins-with-code`)

## Planning

- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jeden zestaw reguł daty (brak wstecz, jeden trening na dzień, edycja i usuwanie tylko przyszłych) musi być spójny. Wgrywanie zdjęcia jest dopiero w S-03.

Source: `context/foundation/roadmap.md` (M-1).
```

### 3. S-02 — `athlete-joins-with-code`

- **Title:** `[S-02] Zawodnik dołącza do zespołu kodem od trenera`
- **Labels:** `slice`
- **Blocked by:** F-01

```markdown
## Outcome

Zawodnik może dołączyć do zespołu kodem od trenera, a trener widzi skład zespołu.

## Identity

- **Roadmap ID:** S-02
- **Change ID:** `athlete-joins-with-code`
- **PRD refs:** US-01
- **Status:** proposed
- **Ready for `/10x-plan`:** no

## Dependencies

- **Prerequisites:** F-01 (`team-role-for-one-squad`)
- **Parallel with:** S-01 (`coach-upcoming-training`)

## Planning

- **Blockers:** —
- **Unknowns:** —
- **Risk:** Skład musi istnieć, zanim da się pokazać, kto nie oddał zdjęcia i kto ma 0 km. Kierunek dołączenia (kod od trenera) nie jest zablokowany.

Source: `context/foundation/roadmap.md` (M-1).
```

### 4. S-03 — `photo-readout-confirm`

- **Title:** `[S-03] Zawodnik wgrywa jedno zdjęcie, widzi odczyt i potwierdza dane`
- **Labels:** `slice`
- **Blocked by:** S-01, S-02

```markdown
## Outcome

Zawodnik może wgrać jedno zdjęcie tylko w dniu z treningiem, widzieć na dole, co udało się odczytać, i zaznaczyć, czy dane są poprawne. Bez przynajmniej jednego parametru (liczba kilometrów) zgłoszenie nie przechodzi.

## Identity

- **Roadmap ID:** S-03
- **Change ID:** `photo-readout-confirm`
- **PRD refs:** FR-005, FR-006, FR-007, FR-013, US-01
- **Status:** proposed
- **Ready for `/10x-plan`:** no

## Dependencies

- **Prerequisites:** S-01 (`coach-upcoming-training`), S-02 (`athlete-joins-with-code`)
- **Parallel with:** —

## Planning

- **Blockers:** —
- **Unknowns:**
  - Jakie przykładowe screeny z różnych zegarków weźmiemy do prób? — Owner: user. Block: no.
- **Risk:** Odczyt ze zdjęcia nie istnieje w obecnym kodzie i jest jedynym miejscem, w którym US-01 może polec. Przepływ da się zaplanować: wymagany jest co najmniej jeden parametr.

Source: `context/foundation/roadmap.md` (M-1).
```

### 5. S-04 — `km-ranking-publication`

- **Title:** `[S-04] Ranking po kilometrach dla trenera i zawodnika`
- **Labels:** `slice`, `blocked`
- **Blocked by:** S-03

```markdown
## Outcome

Trener i zawodnik mogą zobaczyć ranking po liczbie przebiegniętych kilometrów, a osoba bez zgłoszenia ma 0 km. Moment pokazania rankingu (od razu albo następnego dnia) nie jest jeszcze ustalony.

## Identity

- **Roadmap ID:** S-04
- **Change ID:** `km-ranking-publication`
- **PRD refs:** FR-010, FR-011, FR-014, US-01
- **Status:** blocked
- **Ready for `/10x-plan`:** no
- **North star:** yes — najmniejszy pełny przepływ, który udowadnia, że kilometry ze zdjęć zastępują przepisywanie do Excela.

## Dependencies

- **Prerequisites:** S-03 (`photo-readout-confirm`)
- **Parallel with:** S-05 (`coach-sees-submissions`), S-06 (`athlete-photo-edit-window`)

## Planning

- **Blockers:** —
- **Unknowns:**
  - US-01 pokazuje ranking od razu po zgłoszeniach, a FR-014 każe opublikować go następnego dnia. Która zasada obowiązuje? — Owner: user. Block: yes.
- **Risk:** Gwiazda przewodnia stoi tuż po odczycie. Dwie sprzeczne zasady publikacji blokują planowanie. S-05 i S-06 mogą iść obok.

Source: `context/foundation/roadmap.md` (M-1).
```

### 6. S-05 — `coach-sees-submissions`

- **Title:** `[S-05] Trener widzi, kto oddał zdjęcie, i może je podejrzeć`
- **Labels:** `slice`
- **Blocked by:** S-03

```markdown
## Outcome

Trener może zobaczyć, kto wysłał zdjęcie treningu, a kto nie, i podejrzeć, co przesłali.

## Identity

- **Roadmap ID:** S-05
- **Change ID:** `coach-sees-submissions`
- **PRD refs:** FR-008, US-01
- **Status:** proposed
- **Ready for `/10x-plan`:** no

## Dependencies

- **Prerequisites:** S-03 (`photo-readout-confirm`)
- **Parallel with:** S-04 (`km-ranking-publication`), S-06 (`athlete-photo-edit-window`)

## Planning

- **Blockers:** —
- **Unknowns:** —
- **Risk:** Druga połowa US-01, w tej samej fali co ranking. Podgląd zdjęcia zostaje przy trenerze.

Source: `context/foundation/roadmap.md` (M-1).
```

### 7. S-06 — `athlete-photo-edit-window`

- **Title:** `[S-06] Zawodnik poprawia albo usuwa zdjęcie, zanim jest następny dzień`
- **Labels:** `slice`
- **Blocked by:** S-03

```markdown
## Outcome

Zawodnik może usunąć albo podmienić swoje jedno zdjęcie treningu tylko jeśli nie ma jeszcze następnego dnia.

## Identity

- **Roadmap ID:** S-06
- **Change ID:** `athlete-photo-edit-window`
- **PRD refs:** FR-009
- **Status:** proposed
- **Ready for `/10x-plan`:** no

## Dependencies

- **Prerequisites:** S-03 (`photo-readout-confirm`)
- **Parallel with:** S-04 (`km-ranking-publication`), S-05 (`coach-sees-submissions`)

## Planning

- **Blockers:** —
- **Unknowns:** —
- **Risk:** Okno poprawki zmienia kilometry, które wejdą do rankingu, dlatego ląduje obok S-04, a nie przed odczytem. Zamknięcie okna wynika z FR-009 i nie czeka na rozstrzygnięcie, kiedy ranking staje się widoczny.

Source: `context/foundation/roadmap.md` (M-1).
```

## Created

Labels `foundation`, `slice`, `ready`, and `blocked` exist. Milestone M-1 is open. Each prerequisite is a GitHub “blocked by” link. `roadmap.md` was left unchanged.

## Issue index

| Roadmap ID | Change ID                   | Title                                                                    | GitHub                                                                      |
| ---------- | --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| F-01       | `team-role-for-one-squad`   | `[F-01] Konto jest trenerem albo zawodnikiem jednego zespołu`            | [#1](https://github.com/Bednar8/team-manager-up/issues/1)                   |
| S-01       | `coach-upcoming-training`   | `[S-01] Trener ustawia, poprawia i usuwa przyszły trening w kalendarzu`  | [#2](https://github.com/Bednar8/team-manager-up/issues/2) blocked by #1     |
| S-02       | `athlete-joins-with-code`   | `[S-02] Zawodnik dołącza do zespołu kodem od trenera`                    | [#3](https://github.com/Bednar8/team-manager-up/issues/3) blocked by #1     |
| S-03       | `photo-readout-confirm`     | `[S-03] Zawodnik wgrywa jedno zdjęcie, widzi odczyt i potwierdza dane`   | [#4](https://github.com/Bednar8/team-manager-up/issues/4) blocked by #2, #3 |
| S-04       | `km-ranking-publication`    | `[S-04] Ranking po kilometrach dla trenera i zawodnika`                  | [#5](https://github.com/Bednar8/team-manager-up/issues/5) blocked by #4     |
| S-05       | `coach-sees-submissions`    | `[S-05] Trener widzi, kto oddał zdjęcie, i może je podejrzeć`            | [#6](https://github.com/Bednar8/team-manager-up/issues/6) blocked by #4     |
| S-06       | `athlete-photo-edit-window` | `[S-06] Zawodnik poprawia albo usuwa zdjęcie, zanim jest następny dzień` | [#7](https://github.com/Bednar8/team-manager-up/issues/7) blocked by #4     |
