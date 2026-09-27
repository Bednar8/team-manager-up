import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_LABELS_FULL,
  WEEKDAY_LABELS_NARROW,
  civilMonthOf,
  formatCivilDate,
  formatDayTitle,
  formatMonthHeading,
  monthGrid,
  parseCivilDate,
  shiftMonth,
} from "@/components/calendar/month";

interface Props {
  initialDate?: string;
  role: "coach" | "athlete";
}

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

const PLACEHOLDER = {
  coach: "Tutaj będzie dodanie treningu",
  athlete: "Tutaj będziesz wrzucał zdjęcie z treningu",
} as const;

export default function MonthCalendar({ initialDate, role }: Props) {
  const initialParts = initialDate ? parseCivilDate(initialDate) : null;
  const today = useSyncExternalStore(subscribeToToday, localTodayCivil, todayOnServer);
  const [paged, setPaged] = useState<{ year: number; month: number } | null>(() =>
    initialParts ? { year: initialParts.year, month: initialParts.month } : null,
  );
  const [selected, setSelected] = useState<string | null>(() =>
    initialParts ? formatCivilDate(initialParts.year, initialParts.month, initialParts.day) : null,
  );
  const visible = paged ?? (today ? civilMonthOf(today) : null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pushedRef = useRef(false);
  const lastDayRef = useRef<string | null>(selected);

  function selectDay(civil: string) {
    const month = civilMonthOf(civil);
    if (!month) return;
    setPaged(month);
    setSelected(civil);
    const url = new URL(window.location.href);
    url.searchParams.set("date", civil);
    history.pushState({ calendarDate: civil }, "", `${url.pathname}?date=${civil}`);
    pushedRef.current = true;
  }

  function closePopup() {
    const param = new URL(window.location.href).searchParams.get("date");
    if (!param || !parseCivilDate(param)) return;
    if (pushedRef.current) {
      pushedRef.current = false;
      history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("date");
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
        return;
      }
      setSelected(null);
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);

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
                const isSelected = selected === civil;

                return (
                  <button
                    key={civil}
                    id={`day-${civil}`}
                    type="button"
                    aria-label={formatDayTitle(civil)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => {
                      selectDay(civil);
                    }}
                    className={cn(
                      "flex h-full min-h-24 w-full items-start rounded-xl border p-2 text-left text-lg font-semibold tabular-nums transition-colors sm:min-h-28 sm:p-3 sm:text-xl",
                      inMonth
                        ? "bg-card text-foreground hover:bg-accent"
                        : "bg-muted text-muted-foreground hover:bg-muted/70",
                      isToday && !isSelected && "ring-primary ring-2 ring-inset",
                      isSelected &&
                        "bg-primary text-primary-foreground ring-primary-foreground hover:bg-primary ring-2 ring-inset",
                    )}
                  >
                    {dayNumber}
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
            <p className="text-muted-foreground mt-3 text-sm">{PLACEHOLDER[role]}</p>
            <div className="mt-6 flex justify-end">
              <Button type="button" variant="outline" onClick={closePopup}>
                Zamknij
              </Button>
            </div>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
