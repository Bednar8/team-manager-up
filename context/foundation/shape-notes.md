---
project: "Team Manager"
context_type: greenfield
created: 2026-09-14
updated: 2026-09-14
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: pain category
      decision: "Narzut koordynacji + tarcie w procesie (WhatsApp + Excel) + dane uwięzione na zdjęciach + brak wspólnego rankingu."
    - topic: insight
      decision: "WhatsApp jest dobry do szybkiej komunikacji, ale nie zapisuje danych. Zawodnicy mogą mieć różne aplikacje, więc przesyłają screeny. Integracje z aplikacjami biegowymi — później, nie w pierwszej wersji."
    - topic: persona scope
      decision: "Na teraz jeden zespół; docelowo wiele zespołów mogłoby korzystać. Osoba główna: trener."
    - topic: auth strategy
      decision: "Login (konto). Dwie role: trener i zawodnik widzą różne rzeczy. Mechanizm logowania (email/hasło vs OAuth vs bez hasła) nie został wybrany."
    - topic: athlete joins team
      decision: "Nie zablokowane. Kierunek: zawodnik otrzymuje kod od trenera."
    - topic: training fields
      decision: "v1: data + krótki opis treningu (żeby była treść do edycji). Data-only odwołane. Bez podziału czasowy/odległościowy."
    - topic: empty extraction
      decision: "Pusty odczyt może zablokować zgłoszenie. Wymagany przynajmniej jeden parametr, np. liczba przebiegniętych kilometrów. Zastępuje wcześniejsze „brak pola nie blokuje”."
    - topic: mvp timeline
      decision: "Użytkownik potwierdził, że ten przepływ da się dowieźć w ok. 3 tygodnie po godzinach."
    - topic: socrates revisions
      decision: "Brak daty wstecznej i jednego treningu na dzień; usuwanie i edycja treningu tylko z przyszłą datą; zawodnik widzi inne dni kalendarza, ale wgrywa jedno zdjęcie i tylko przy dniu z treningiem; potwierdza odczyt; ranking globalny z 0 km bez zgłoszenia, publikowany od razu po zatwierdzeniu zgłoszenia."
    - topic: product framing
      decision: "Aplikacja webowa (używalna na telefonie). Skala: garstka / jeden zespół. Deadline 2026-11-04. Praca po godzinach. Przy 100× skali ranking per zespół."
    - topic: non-goals
      decision: "Poza v1: raporty CSV/PDF, integracje z aplikacjami biegowymi, wiele zespołów, dodatkowe role."
  frs_drafted: 14
  quality_check_status: accepted
---

## Seed idea

Aplikacja dla zespołu biegowego/sportowego. Role: trener i zawodnik. Trener ustala datę treningu, zawodnicy tego dnia przesyłają zdjęcie z zegarka lub telefonu. Trener widzi, kto przesłał. Model odczytuje ze zdjęcia co się da (km, prędkość itd.) i zapisuje JSON; brak pola nie blokuje zgłoszenia. Na kurs: jeden ranking z dostępnych danych. Eksport CSV/PDF poza zakresem kursu. Otwarte: jak zawodnik trafia do zespołu; co pokazać w rankingu, gdy odczyt jest pusty; jakie przykładowe screeny z różnych zegarków weźmiemy do prób.

## Vision & Problem Statement

Trener zespołu biegowego/sportowego zbiera screeny treningów na WhatsAppie. Sam sprawdza, kto przesłał zdjęcie z treningu, a kto nie. Gdy potrzebuje statystyk, przepisuje dane z treningów do Excela. Kosztuje go to czas.

WhatsApp jest dobry do szybkiej komunikacji, ale nie zapisuje danych. Każdy zawodnik może mieć inną aplikację, więc na ten moment przesyłają screeny. Rankingi mają dać zawodnikom rywalizację i motywację. Integracje z różnymi aplikacjami biegowymi zostają na później, nie w pierwszej wersji.

Przy 100× skali ranking musi być per zespół, nie jeden globalny na całą aplikację.

## User & Persona

Trener jednego zespołu. Sięga po produkt po dniu treningowym, gdy na czacie musi zestawić, kto oddał screen, oraz gdy chce statystyki bez przepisywania liczb do Excela.

### Secondary persona

Zawodnik tego samego zespołu. Ma widzieć ranking i czuć rywalizację oraz motywację.

## Access Control

Wejście przez login (konto). Dwie role: trener i zawodnik — widzą różne rzeczy.

Jak zawodnik trafia do zespołu: nie zablokowane. Kierunek: kod od trenera.

Mechanizm logowania (email + hasło / OAuth / bez hasła) nie został wybrany.

## Success Criteria

### Primary

- Trener ustawia trening w dniu (data + krótki opis), zawodnik wgrywa zdjęcie, odczyt pojawia się na dole, trener widzi kto przesłał a kto nie, wszyscy widzą ranking po przebiegniętych kilometrach.
- Zawodnik klika w kalendarzu tylko dni z treningiem; zgłoszenie można edytować albo usunąć tylko jeśli nie ma jeszcze następnego dnia.

### Secondary

- Dodatkowe rankingi (czas, szybkość), jeśli starczy czasu.

### Guardrails

- Zawodnik nie edytuje ani nie usuwa zgłoszenia po dniu treningu.
- Pusty odczyt może zablokować zgłoszenie — ma być przynajmniej jeden parametr, np. liczba przebiegniętych kilometrów.

## User Stories

### US-01: Trener widzi kto oddał trening i ranking po kilometrach

- **Given** trener dodał trening na 15.09 z opisem do przebiegnięcia minimum 5 km, a w zespole jest 4 zawodników
- **When** 3 zawodników wrzuca zdjęcia, a odczyt pokazuje: zaw. 1 — 6 km, zaw. 2 — 6,5 km, zaw. 3 — 4,8 km
- **Then** trener widzi, że zaw. 4 nie dodał treningu; na stronie rankingu wszyscy (zawodnicy i trener) widzą: zaw. 2 pierwsze miejsce i tyle km ile przebiegł, zaw. 1 drugie miejsce, zaw. 3 trzecie miejsce, zaw. 4 czwarte miejsce i 0 km przebiegniętych

#### Acceptance Criteria

- Trzy zgłoszenia mają odczytane kilometry (6 / 6,5 / 4,8)
- Czwarty zawodnik jest widoczny jako osoba, która nie dodała treningu
- Ranking porządkuje: 6,5 km → 6 km → 4,8 km → 0 km

## Functional Requirements

### Kalendarz i treningi

- FR-001: Trener może dodać trening (data + krótki opis), bez daty wstecznej i bez drugiego treningu tego samego dnia. Priority: must-have
  > Socrates: Counter-argument considered: trening wstecz i dwa treningi w jednym dniu rozjeżdżają obecność i ranking. Resolution: zmienione — trener nie dodaje daty wstecznej ani drugiego treningu tego samego dnia.
- FR-002: Trener może usunąć trening tylko z przyszłą datą (jeszcze niewykonany). Priority: must-have
  > Socrates: Counter-argument considered: usunięcie po zgłoszeniach kasuje zdjęcia i kilometry. Resolution: zmienione — usuwanie tylko treningu, który jeszcze nie został wykonany (przyszła data).
- FR-003: Trener może edytować trening (krótki opis) tylko z przyszłą datą. Priority: must-have
  > Socrates: Counter-argument considered: zmiana opisu albo daty po zgłoszeniach zmienia zadanie w trakcie. Resolution: zmienione — edycja tylko treningów z przyszłą datą.
- FR-004: Zalogowana osoba może zobaczyć kalendarz. Priority: must-have
  > Socrates: Counter-argument considered: kalendarz jest za duży, wystarczy lista. Resolution: kept; it stands as written.
- FR-005: Zawodnik widzi inne dni w kalendarzu; zdjęcie wgrywa tylko przy dniu z treningiem. Priority: must-have
  > Socrates: Counter-argument considered: zablokowane dni mylą; zawodnik powinien widzieć inne dni, tylko bez wgrywania. Resolution: zmienione — widać inne dni, upload tylko przy dniu z treningiem.

### Zgłoszenia zdjęć

- FR-006: Zawodnik może wgrać jedno zdjęcie treningu (nie wiele). Priority: must-have
  > Socrates: Counter-argument considered: kilka zdjęć jednego dnia rozjedzie odczyt i ranking. Resolution: zmienione — jedno zdjęcie; ewentualna edycja tego zdjęcia w ten sam dzień (FR-009).
- FR-007: Po wgraniu zdjęcia zawodnik widzi na dole, co udało się odczytać. Priority: must-have
  > Socrates: Counter-argument considered: błędny odczyt idzie prosto do rankingu. Resolution: kept wyświetlanie odczytu; dodane FR-013 — zawodnik zaznacza, czy dane są poprawne.
- FR-008: Trener może zobaczyć, kto wysłał zdjęcie treningu, a kto nie, i podejrzeć, co przesłali. Priority: must-have
  > Socrates: Counter-argument considered: podgląd zdjęcia jest za dużym wglądem. Resolution: kept; it stands as written.
- FR-009: Zawodnik może usunąć albo edytować swoje zdjęcie treningu tylko jeśli nie ma jeszcze następnego dnia. Priority: must-have
  > Socrates: Counter-argument considered: edycja zmienia miejsca w rankingu wstecz. Resolution: kept okno edycji; potwierdzone kilometry wchodzą do rankingu od razu (FR-014), więc poprawka tego samego dnia przesuwa miejsca.

### Ranking

- FR-010: Trener może zobaczyć ranking globalny po liczbie przebiegniętych kilometrów. Priority: must-have
  > Socrates: Counter-argument considered: ranking po km nagradza ilość, nie zadanie z opisu; trenerowi wystarczy lista obecności. Resolution: kept — ranking globalny; wgląd do zdjęć zostaje przy FR-008.
- FR-011: Zawodnik może zobaczyć ranking globalny po liczbie przebiegniętych kilometrów; osoba bez zgłoszenia ma 0 km. Priority: must-have
  > Socrates: Counter-argument considered: publiczne 0 km wstydzi osobę, która nie oddała. Resolution: kept — ranking ma być globalnie dostępny, więc 0 km trzeba zapisać.
- FR-012: Zalogowana osoba może zobaczyć ranking po czasie lub szybkości. Priority: nice-to-have
  > Socrates: Counter-argument considered: nice-to-have w dokumencie wciąga czas z must-have. Resolution: zostaje nice-to-have, nie must-have.
- FR-013: Zawodnik może zaznaczyć, czy odczytane ze zdjęcia dane są poprawne. Priority: must-have
  > Socrates: Dodane w rundzie FR-007; bez osobnego wyzwania w tej rundzie.
- FR-014: Ranking za dany trening pojawia się od razu po zatwierdzeniu zgłoszenia, także gdy trening jest dzisiaj. Priority: must-have
  > Socrates: Zmienione 2026-10-03 — wygrywa US-01. Potwierdzone kilometry wchodzą do sumy przy odczycie; trening z przyszłą datą zostaje poza sumą. Poprawka zdjęcia tego samego dnia przesuwa miejsca.

## Business Logic

Aplikacja ustala miejsca w rankingu po liczbie przebiegniętych kilometrów; osoba bez zgłoszenia ma 0 km.

Zawodnik wprowadza zdjęcie ze swojej aplikacji biegowej i urządzenia oraz potwierdza dane odczytane ze zdjęcia. Wynikiem są odczytane wartości, np. liczba przebiegniętych km, czas, maksymalna prędkość. Ranking widać dla wszystkich od razu po zatwierdzeniu zgłoszenia; zawodnik widzi wyraźniej swoje miejsce. Trener dodaje trening, potem widzi przepływ zawodników oraz ranking. Raporty — później, poza pierwszą wersją.

## Non-Functional Requirements

- Zdjęcie treningu nie jest widoczne dla osób spoza zespołu.
- Po wgraniu zdjęcia zawodnik nie zostaje bez informacji, że odczyt trwa — nie ma ciszy przez kilka sekund.
- Zawodnik jest w stanie wgrać zdjęcie i zobaczyć ranking na telefonie.

## Non-Goals

- Raporty CSV/PDF — poza pierwszą wersją; trener ma listę kto oddał i ranking.
- Integracje z aplikacjami biegowymi — zawodnicy mają różne apki, v1 bierze zdjęcie.
- Wiele zespołów — v1 to jeden zespół; ranking per zespół dopiero przy większej skali.
- Dodatkowe role (admin klubu, rodzic) — v1 to trener i zawodnik.

## Open Questions

1. **Jak zawodnik trafia do zespołu?** — Kierunek: kod od trenera. Nie zablokowane. Owner: user.
2. **Jakie przykładowe screeny z różnych zegarków weźmiemy do prób?** — TBD. Owner: user.
3. **Jaki konkretny mechanizm logowania?** — TBD. Owner: user.
4. **US-01 vs FR-014:** rozstrzygnięte. Potwierdzone kilometry wchodzą do rankingu od razu, także z dzisiejszego treningu. Owner: user.

## Quality cross-check

Brak luk bramki. Access Control, Business Logic (jedno zdanie), artefakt shape-notes, timeline (3 tygodnie ≤ 3, bez osobnego acknowledgment), Non-Goals — obecne. Preserved behavior: n/a (greenfield).
