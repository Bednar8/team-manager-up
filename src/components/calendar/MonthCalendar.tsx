import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_LABELS_FULL,
  WEEKDAY_LABELS_NARROW,
  civilMonthOf,
  formatCivilDate,
  formatDayTitle,
  formatMonthHeading,
  isPastCivil,
  monthGrid,
  parseCivilDate,
  shiftMonth,
} from "@/components/calendar/month";

interface Training {
  trainingOn: string;
  description: string;
}

interface Props {
  initialDate?: string;
  role: "coach" | "athlete";
  trainings: Training[];
  error?: string;
}

const textareaClassName =
  "border-input focus:ring-ring w-full rounded-lg border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2";

function localTodayCivil(): string {
  const now = new Date();
  return formatCivilDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function subscribeToToday(onStoreChange: () => void): () => void {
  const id = window.setInterval(onStoreChange, 60_000);
  return () => {
    window.clearInterval(id);
  };
}

function todayOnServer(): null {
  return null;
}

export default function MonthCalendar({ initialDate, role, trainings, error }: Props) {
  const initialParts = initialDate ? parseCivilDate(initialDate) : null;
  const today = useSyncExternalStore(subscribeToToday, localTodayCivil, todayOnServer);
  const [paged, setPaged] = useState<{ year: number; month: number } | null>(() =>
    initialParts ? { year: initialParts.year, month: initialParts.month } : null,
  );
  const [selected, setSelected] = useState<string | null>(() =>
    initialParts ? formatCivilDate(initialParts.year, initialParts.month, initialParts.day) : null,
  );
  const [notice, setNotice] = useState<string | null>(() => error ?? null);
  const entryDate = initialDate ?? null;
  const visible = paged ?? (today ? civilMonthOf(today) : null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pushedRef = useRef(false);
  const lastDayRef = useRef<string | null>(selected);

  const trainingByDate = new Map(trainings.map((training) => [training.trainingOn, training.description]));

  function selectDay(civil: string) {
    const month = civilMonthOf(civil);
    if (!month) return;
    setPaged(month);
    setSelected(civil);
    if (civil !== entryDate) setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("date", civil);
    history.pushState({ calendarDate: civil }, "", `${url.pathname}?date=${civil}`);
    pushedRef.current = true;
  }

  function closePopup() {
    const param = new URL(window.location.href).searchParams.get("date");
    if (!param || !parseCivilDate(param)) return;
    setNotice(null);
    if (pushedRef.current) {
      pushedRef.current = false;
      history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("date");
    url.searchParams.delete("error");
    history.replaceState(null, "", url.pathname);
    setSelected(null);
  }

  function goPrev() {
    if (!visible) return;
    setPaged(shiftMonth(visible.year, visible.month, -1));
  }

  function goNext() {
    if (!visible) return;
    setPaged(shiftMonth(visible.year, visible.month, 1));
  }

  useEffect(() => {
    function onPop() {
      const param = new URL(window.location.href).searchParams.get("date");
      const parts = param ? parseCivilDate(param) : null;
      pushedRef.current = false;
      if (param && parts) {
        setSelected(param);
        setPaged({ year: parts.year, month: parts.month });
        if (param !== entryDate) setNotice(null);
        return;
      }
      setNotice(null);
      setSelected(null);
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [entryDate]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected) {
      lastDayRef.current = selected;
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
    if (lastDayRef.current) document.getElementById(`day-${lastDayRef.current}`)?.focus();
  }, [selected]);

  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) closePopup();
  }

  const days = visible ? monthGrid(visible.year, visible.month) : null;
  const visibleMonthPrefix = visible
    ? `${String(visible.year).padStart(4, "0")}-${String(visible.month).padStart(2, "0")}-`
    : "";

  const selectedDescription = selected ? trainingByDate.get(selected) : undefined;
  const selectedHasTraining = selectedDescription !== undefined;
  const showNotice = Boolean(notice && selected && selected === entryDate);
  const todayKnown = today !== null;
  const selectedIsPast = todayKnown && selected !== null && isPastCivil(selected, today);
  const coachCanWrite = role === "coach" && todayKnown && selected !== null && !selectedIsPast;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-h-8 text-xl font-semibold sm:text-2xl">
          {visible ? formatMonthHeading(visible.year, visible.month) : "\u00a0"}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={!visible}
            aria-label="Poprzedni miesiąc"
          >
            ←
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              selectDay(localTodayCivil());
            }}
            disabled={!visible}
          >
            Dziś
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={!visible}
            aria-label="Następny miesiąc"
          >
            →
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1 overflow-x-hidden">
        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS_NARROW.map((narrow, index) => (
            <div key={narrow} className="text-muted-foreground px-1 py-1 text-center text-xs font-medium sm:text-sm">
              <span className="lg:hidden">{narrow}</span>
              <span className="hidden lg:inline">{WEEKDAY_LABELS_FULL[index]}</span>
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5">
          {days
            ? days.map((civil) => {
                const dayNumber = Number(civil.slice(8, 10));
                const inMonth = civil.startsWith(visibleMonthPrefix);
                const isToday = today !== null && civil === today;
                const isPast = today !== null && isPastCivil(civil, today);
                const isSelected = selected === civil;
                const hasTraining = trainingByDate.has(civil);
                const dayLabel = hasTraining ? `${formatDayTitle(civil)}, trening` : formatDayTitle(civil);

                return (
                  <button
                    key={civil}
                    id={`day-${civil}`}
                    type="button"
                    aria-label={dayLabel}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => {
                      selectDay(civil);
                    }}
                    className={cn(
                      "flex h-full min-h-24 w-full flex-col items-start rounded-xl border p-2 text-left tabular-nums transition-colors sm:min-h-28 sm:p-3",
                      inMonth && !isPast
                        ? "bg-card text-foreground hover:bg-accent"
                        : "bg-muted text-muted-foreground hover:bg-muted/70",
                      isToday && !isSelected && "ring-primary ring-2 ring-inset",
                      isSelected &&
                        "bg-primary text-primary-foreground ring-primary-foreground hover:bg-primary ring-2 ring-inset",
                    )}
                  >
                    <span className="text-lg font-semibold sm:text-xl">{dayNumber}</span>
                    {hasTraining ? (
                      <span className="mt-1 flex items-center gap-1 text-xs font-normal">
                        <Footprints aria-hidden className="size-3.5 shrink-0" />
                        <span className="hidden lg:inline">trening</span>
                      </span>
                    ) : null}
                  </button>
                );
              })
            : Array.from({ length: 42 }, (_, index) => (
                <div key={index} className="bg-muted min-h-24 rounded-xl sm:min-h-28" aria-hidden="true" />
              ))}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="calendar-day-title"
        className="bg-card text-card-foreground backdrop:bg-foreground/40 fixed top-1/2 left-1/2 z-50 m-0 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg"
        onClose={closePopup}
        onClick={onDialogClick}
      >
        {selected ? (
          <>
            <h2 id="calendar-day-title" className="text-xl font-semibold">
              {formatDayTitle(selected)}
            </h2>

            {showNotice ? <p className="text-destructive mt-3 text-sm">{notice}</p> : null}

            {coachCanWrite && !selectedHasTraining ? (
              <form key={selected} method="post" action="/api/trainings/create" className="mt-3">
                <input type="hidden" name="training_on" value={selected} />
                <label htmlFor="training-description" className="text-muted-foreground mb-1 block text-sm">
                  Opis
                </label>
                <textarea
                  id="training-description"
                  name="description"
                  required
                  maxLength={200}
                  rows={4}
                  className={textareaClassName}
                />
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closePopup}>
                    Zamknij
                  </Button>
                  <Button type="submit">Dodaj</Button>
                </div>
              </form>
            ) : null}

            {coachCanWrite && selectedHasTraining ? (
              <div key={selected}>
                <form method="post" action="/api/trainings/update" className="mt-3">
                  <input type="hidden" name="training_on" value={selected} />
                  <label htmlFor="training-description" className="text-muted-foreground mb-1 block text-sm">
                    Opis
                  </label>
                  <textarea
                    id="training-description"
                    name="description"
                    required
                    maxLength={200}
                    rows={4}
                    defaultValue={selectedDescription}
                    className={textareaClassName}
                  />
                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={closePopup}>
                      Zamknij
                    </Button>
                    <Button type="submit">Zapisz</Button>
                  </div>
                </form>
                <form method="post" action="/api/trainings/delete" className="mt-2 flex justify-end">
                  <input type="hidden" name="training_on" value={selected} />
                  <Button type="submit" variant="destructive">
                    Usuń
                  </Button>
                </form>
              </div>
            ) : null}

            {!coachCanWrite && selectedHasTraining ? (
              <>
                <p className="mt-3 text-sm whitespace-pre-wrap">{selectedDescription}</p>
                <div className="mt-6 flex justify-end">
                  <Button type="button" variant="outline" onClick={closePopup}>
                    Zamknij
                  </Button>
                </div>
              </>
            ) : null}

            {!coachCanWrite && !selectedHasTraining && todayKnown ? (
              <>
                <p className="text-muted-foreground mt-3 text-sm">
                  {selectedIsPast ? "Tego dnia nie było treningu." : "Tego dnia nie ma treningu."}
                </p>
                <div className="mt-6 flex justify-end">
                  <Button type="button" variant="outline" onClick={closePopup}>
                    Zamknij
                  </Button>
                </div>
              </>
            ) : null}

            {!coachCanWrite && !selectedHasTraining && !todayKnown ? (
              <div className="mt-6 flex justify-end">
                <Button type="button" variant="outline" onClick={closePopup}>
                  Zamknij
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </dialog>
    </div>
  );
}
