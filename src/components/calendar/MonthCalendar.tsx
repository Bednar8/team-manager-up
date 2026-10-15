import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDecimalInput, parseDurationInput } from "@/lib/training-photo-input";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_LABELS_FULL,
  WEEKDAY_LABELS_NARROW,
  civilMonthOf,
  formatCivilDate,
  formatDayTitle,
  formatMonthHeading,
  isPastCivil,
  monthWeeks,
  parseCivilDate,
  shiftMonth,
} from "@/components/calendar/month";

interface Training {
  trainingOn: string;
  description: string;
}

interface Submission {
  distanceKm: number | null;
  durationSeconds: number | null;
  maxSpeedKmh: number | null;
  modelDistanceKm: number | null;
  modelDurationSeconds: number | null;
  modelMaxSpeedKmh: number | null;
  athleteEdited: boolean;
  confirmedAt: string | null;
}

export interface SquadAthlete {
  userId: string;
  displayName: string;
  createdAt: string;
  id: string;
}

export interface ConfirmedSubmission {
  trainingOn: string;
  userId: string;
  displayName: string;
  athleteEdited: boolean;
}

interface PhotoAttempt {
  date: string;
  status: "reading" | "failed" | "ready";
  message: string | null;
  values: Submission | null;
  /** True after `begin` succeeded and cleared the previous readout. */
  cleared: boolean;
}

interface CoachPreview {
  day: string;
  userId: string;
  status: "loading" | "ready" | "failed";
  signedUrl: string | null;
  message: string | null;
}

interface Props {
  initialDate?: string;
  success?: { date: string; message: string };
  warsawToday: string;
  role: "coach" | "athlete";
  trainings: Training[];
  athletes: SquadAthlete[];
  confirmedSubmissions: ConfirmedSubmission[];
  submission: Submission | null;
  submissionDate: string | null;
  error?: string;
}

const textareaClassName =
  "border-input focus:ring-ring w-full rounded-lg border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2";

const fieldClassName =
  "border-input bg-background text-foreground w-full min-w-0 rounded-lg border px-3 py-2 tabular-nums read-only:bg-muted/40";

const fileClassName =
  "text-foreground w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground";

const READOUT_FAILED = "Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.";
const UPLOAD_FAILED = "Nie udało się wgrać zdjęcia.";
const CONFIRM_FAILED = "Nie udało się potwierdzić.";
const PREVIEW_FAILED = "Nie udało się otworzyć zdjęcia.";
const COACH_SEES_EDIT = "Trener zobaczy, że poprawiłeś odczyt.";

const EMPTY_SUBMISSION: Submission = {
  distanceKm: null,
  durationSeconds: null,
  maxSpeedKmh: null,
  modelDistanceKm: null,
  modelDurationSeconds: null,
  modelMaxSpeedKmh: null,
  athleteEdited: false,
  confirmedAt: null,
};

const decimalFormat = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

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

export default function MonthCalendar({
  initialDate,
  success,
  warsawToday,
  role,
  trainings,
  athletes,
  confirmedSubmissions,
  submission,
  submissionDate,
  error,
}: Props) {
  const initialParts = initialDate ? parseCivilDate(initialDate) : null;
  const createdParts = success ? parseCivilDate(success.date) : null;
  const shownMonth = initialParts ?? createdParts;
  const [toast, setToast] = useState<{ message: string } | null>(() => (success ? { message: success.message } : null));
  const [trainingList, setTrainingList] = useState(trainings);
  const [saving, setSaving] = useState<"create" | "update" | "delete" | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const trainingLock = useRef(false);
  const today = useSyncExternalStore(subscribeToToday, localTodayCivil, todayOnServer);
  const [paged, setPaged] = useState<{ year: number; month: number } | null>(() =>
    shownMonth ? { year: shownMonth.year, month: shownMonth.month } : null,
  );
  const [selected, setSelected] = useState<string | null>(() =>
    initialParts ? formatCivilDate(initialParts.year, initialParts.month, initialParts.day) : null,
  );
  const [notice, setNotice] = useState<string | null>(() => error ?? null);
  const [photo, setPhoto] = useState<PhotoAttempt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [coachPreview, setCoachPreview] = useState<CoachPreview | null>(null);
  const photoAttempt = useRef(0);
  const confirmAttempt = useRef(0);
  const coachPreviewAttempt = useRef(0);
  const confirmLock = useRef(false);
  const entryDate = initialDate ?? null;
  const visible = paged ?? (today ? civilMonthOf(today) : null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pushedRef = useRef(false);
  const lastDayRef = useRef<string | null>(selected);

  const trainingByDate = new Map(trainingList.map((training) => [training.trainingOn, training.description]));

  useEffect(() => {
    if (!success) return;
    const url = new URL(window.location.href);
    for (const param of ["created", "updated", "deleted"]) url.searchParams.delete(param);
    history.replaceState(history.state, "", `${url.pathname}${url.search}`);
  }, [success]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  async function saveTraining(event: React.SubmitEvent<HTMLFormElement>, operation: "create" | "update" | "delete") {
    event.preventDefault();
    if (trainingLock.current) return;
    const body = new FormData(event.currentTarget);
    const day = body.get("training_on");
    if (typeof day !== "string") return;
    trainingLock.current = true;
    setSaving(operation);
    setTrainingError(null);
    try {
      const response = await fetch(`/api/trainings/${operation}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
        redirect: "error",
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setTrainingError(readErrorMessage(result) ?? "Nie udało się zapisać treningu. Spróbuj ponownie.");
        return;
      }
      if (
        typeof result !== "object" ||
        result === null ||
        readOwn(result, "trainingOn") !== day ||
        (operation !== "delete" && typeof readOwn(result, "description") !== "string")
      ) {
        setTrainingError("Nie udało się potwierdzić zapisu treningu. Odśwież kalendarz.");
        return;
      }
      const description = readOwn(result, "description");
      setTrainingList((previous) => {
        const remaining = previous.filter((training) => training.trainingOn !== day);
        return operation === "delete" || typeof description !== "string"
          ? remaining
          : [...remaining, { trainingOn: day, description }];
      });
      const messages = {
        create: "Trening dodany pomyślnie!",
        update: "Trening zaktualizowany pomyślnie!",
        delete: "Trening usunięty pomyślnie!",
      };
      setToast({ message: messages[operation] });
      const url = new URL(window.location.href);
      for (const param of ["date", "error", "created", "updated", "deleted"]) url.searchParams.delete(param);
      history.replaceState(null, "", `${url.pathname}${url.search}`);
      pushedRef.current = false;
      setNotice(null);
      setSelected(null);
    } catch {
      setTrainingError("Nie udało się zapisać treningu. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      trainingLock.current = false;
      setSaving(null);
    }
  }

  function selectDay(civil: string) {
    const month = civilMonthOf(civil);
    if (!month) return;
    setTrainingError(null);
    setPaged(month);
    setSelected(civil);
    confirmAttempt.current += 1;
    setConfirming(false);
    setConfirmError(null);
    coachPreviewAttempt.current += 1;
    setCoachPreview(null);
    if (civil !== entryDate) setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("date", civil);
    history.pushState({ calendarDate: civil }, "", `${url.pathname}?date=${civil}`);
    pushedRef.current = true;
  }

  function closePopup() {
    if (trainingLock.current) return;
    coachPreviewAttempt.current += 1;
    setCoachPreview(null);
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
      confirmAttempt.current += 1;
      setConfirming(false);
      setConfirmError(null);
      coachPreviewAttempt.current += 1;
      setCoachPreview(null);
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

  function onPhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.item(0) ?? null;
    event.currentTarget.value = "";
    if (!file || !selected) return;
    void runPhotoReadout(selected, file);
  }

  async function runPhotoReadout(day: string, file: File) {
    const attempt = photoAttempt.current + 1;
    photoAttempt.current = attempt;
    let cleared = false;
    setConfirmError(null);
    setPhoto({ date: day, status: "reading", message: null, values: null, cleared: false });

    try {
      const beginResponse = await fetch("/api/trainings/photo/begin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ training_on: day }),
      });
      const beginBody: unknown = await beginResponse.json().catch(() => null);
      if (photoAttempt.current !== attempt) return;
      if (!beginResponse.ok) {
        setPhoto({
          date: day,
          status: "failed",
          message: readErrorMessage(beginBody) ?? UPLOAD_FAILED,
          values: null,
          cleared: readCleared(beginBody),
        });
        return;
      }
      const signedUrl = readSignedUrl(beginBody);
      if (!signedUrl) {
        setPhoto({ date: day, status: "failed", message: UPLOAD_FAILED, values: null, cleared: true });
        return;
      }

      cleared = true;
      setPhoto({ date: day, status: "reading", message: null, values: null, cleared: true });
      const uploaded = await uploadTrainingPhoto(signedUrl, file);
      if (photoAttempt.current !== attempt) return;
      if (!uploaded) {
        setPhoto({ date: day, status: "failed", message: UPLOAD_FAILED, values: null, cleared: true });
        return;
      }

      const readoutResponse = await fetch("/api/trainings/photo/readout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ training_on: day }),
      });
      const readoutBody: unknown = await readoutResponse.json().catch(() => null);
      if (photoAttempt.current !== attempt) return;
      if (readoutResponse.status === 503) {
        setPhoto({
          date: day,
          status: "failed",
          message: readErrorMessage(readoutBody) ?? READOUT_FAILED,
          values: null,
          cleared: true,
        });
        return;
      }
      const values = readoutResponse.ok ? readSubmission(readoutBody) : null;
      if (!values) {
        setPhoto({ date: day, status: "failed", message: READOUT_FAILED, values: null, cleared: true });
        return;
      }
      setPhoto({ date: day, status: "ready", message: null, values, cleared: true });
    } catch {
      if (photoAttempt.current !== attempt) return;
      setPhoto({
        date: day,
        status: "failed",
        message: cleared ? READOUT_FAILED : UPLOAD_FAILED,
        values: null,
        cleared,
      });
    }
  }

  async function confirmPhoto(day: string, draft: PhotoDraft) {
    if (confirmLock.current) return;
    confirmLock.current = true;
    const attempt = confirmAttempt.current + 1;
    confirmAttempt.current = attempt;
    setConfirming(true);
    setConfirmError(null);

    try {
      const response = await fetch("/api/trainings/photo/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          training_on: day,
          distance_km: draft.distance,
          duration_seconds: draft.duration,
          max_speed_kmh: draft.speed,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (confirmAttempt.current === attempt) {
          setConfirmError(readErrorMessage(body) ?? CONFIRM_FAILED);
        }
        return;
      }
      const values = readSubmission(body);
      if (!values?.confirmedAt) {
        if (confirmAttempt.current === attempt) setConfirmError(CONFIRM_FAILED);
        return;
      }
      setPhoto({ date: day, status: "ready", message: null, values, cleared: true });
      window.dispatchEvent(new CustomEvent("training-submitted", { detail: day }));
      if (confirmAttempt.current === attempt) {
        setToast({ message: "Trening zapisany!" });
        const url = new URL(window.location.href);
        url.searchParams.delete("date");
        url.searchParams.delete("error");
        history.replaceState(null, "", `${url.pathname}${url.search}`);
        pushedRef.current = false;
        setNotice(null);
        setSelected(null);
      }
    } catch {
      if (confirmAttempt.current === attempt) setConfirmError(CONFIRM_FAILED);
    } finally {
      confirmLock.current = false;
      if (confirmAttempt.current === attempt) setConfirming(false);
    }
  }

  async function openSquadPhoto(day: string, userId: string) {
    const attempt = coachPreviewAttempt.current + 1;
    coachPreviewAttempt.current = attempt;
    setCoachPreview({ day, userId, status: "loading", signedUrl: null, message: null });

    try {
      const params = new URLSearchParams({ training_on: day, user_id: userId });
      const response = await fetch(`/api/trainings/photo/preview?${params.toString()}`);
      const body: unknown = await response.json().catch(() => null);
      if (coachPreviewAttempt.current !== attempt) return;
      if (!response.ok) {
        setCoachPreview({
          day,
          userId,
          status: "failed",
          signedUrl: null,
          message: readErrorMessage(body) ?? PREVIEW_FAILED,
        });
        return;
      }
      const signedUrl = readSignedUrl(body);
      if (!signedUrl) {
        setCoachPreview({ day, userId, status: "failed", signedUrl: null, message: PREVIEW_FAILED });
        return;
      }
      setCoachPreview({ day, userId, status: "ready", signedUrl, message: null });
    } catch {
      if (coachPreviewAttempt.current !== attempt) return;
      setCoachPreview({ day, userId, status: "failed", signedUrl: null, message: PREVIEW_FAILED });
    }
  }

  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) closePopup();
  }

  const weeks = visible ? monthWeeks(visible.year, visible.month) : null;

  const selectedDescription = selected ? trainingByDate.get(selected) : undefined;
  const selectedHasTraining = selectedDescription !== undefined;
  const warsawTodayKnown = parseCivilDate(warsawToday) !== null;
  const squadListVisible =
    role === "coach" && selectedHasTraining && warsawTodayKnown && selected !== null && selected <= warsawToday;
  const squadRows = squadListVisible && selected ? rowsForTrainingDay(selected, athletes, confirmedSubmissions) : [];
  const showNotice = Boolean(notice && selected && selected === entryDate);
  const todayKnown = today !== null;
  const selectedIsPast = todayKnown && selected !== null && isPastCivil(selected, today);
  const coachCanWrite = role === "coach" && todayKnown && selected !== null && !selectedIsPast;
  const athleteCanUpload = role === "athlete" && selectedHasTraining && selected === warsawToday;
  const livePhoto = photo && selected && photo.date === selected ? photo : null;
  const savedSubmission = submission && selected === submissionDate ? submission : null;
  let shownSubmission: Submission | null = savedSubmission;
  if (livePhoto?.status === "ready" && livePhoto.values) {
    shownSubmission = livePhoto.values;
  } else if (livePhoto?.status === "reading") {
    shownSubmission = null;
  } else if (livePhoto?.status === "failed" && livePhoto.cleared) {
    shownSubmission = livePhoto.values ?? EMPTY_SUBMISSION;
  } else if (livePhoto?.cleared) {
    shownSubmission = null;
  }
  const photoReading = livePhoto?.status === "reading";
  const photoMessage = livePhoto?.status === "failed" ? livePhoto.message : null;
  const photoConfirmed = shownSubmission?.confirmedAt != null;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      {toast ? (
        <div
          role="status"
          className="bg-card text-card-foreground fixed right-4 bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg sm:left-auto"
        >
          <CircleCheck aria-hidden className="text-primary size-5 shrink-0" />
          {toast.message}
        </div>
      ) : null}
      {notice && !selected ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
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
        <h2 className="relative min-h-8 text-center text-xl font-semibold whitespace-nowrap tabular-nums sm:text-2xl">
          {visible ? (
            <>
              <span className="invisible inline-grid" aria-hidden="true">
                {Array.from({ length: 12 }, (_, index) => (
                  <span key={index} className="col-start-1 row-start-1">
                    {formatMonthHeading(visible.year, index + 1)}
                  </span>
                ))}
              </span>
              <span className="absolute inset-0 flex items-center justify-center">
                {formatMonthHeading(visible.year, visible.month)}
              </span>
            </>
          ) : (
            "\u00a0"
          )}
        </h2>
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

        <div
          className="grid min-h-0 flex-1 grid-cols-7 gap-1.5"
          style={{ gridTemplateRows: `repeat(${weeks?.length ?? 6}, minmax(0, 1fr))` }}
        >
          {weeks
            ? weeks.flatMap((week) =>
                week.map((day) => {
                  if (!day.inMonth) {
                    return <div key={day.civil} aria-hidden="true" />;
                  }

                  const { civil } = day;
                  const dayNumber = Number(civil.slice(8, 10));
                  const isToday = today !== null && civil === today;
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
                        "bg-card text-foreground hover:bg-accent flex h-full min-h-24 w-full flex-col items-start rounded-xl border p-2 text-left tabular-nums transition-colors sm:min-h-28 sm:p-3",
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
                }),
              )
            : Array.from({ length: 42 }, (_, index) => (
                <div key={index} className="bg-muted min-h-24 rounded-xl sm:min-h-28" aria-hidden="true" />
              ))}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="calendar-day-title"
        className="bg-card text-card-foreground backdrop:bg-foreground/40 fixed top-1/2 left-1/2 z-50 m-0 max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-lg"
        onClose={closePopup}
        onCancel={(event) => {
          if (trainingLock.current) event.preventDefault();
        }}
        onClick={onDialogClick}
      >
        {selected ? (
          <>
            <h2 id="calendar-day-title" className="text-xl font-semibold">
              {formatDayTitle(selected)}
            </h2>

            {showNotice ? <p className="text-destructive mt-3 text-sm">{notice}</p> : null}
            {trainingError ? (
              <p role="alert" className="text-destructive mt-3 text-sm">
                {trainingError}
              </p>
            ) : null}

            {coachCanWrite && !selectedHasTraining ? (
              <form
                key={selected}
                method="post"
                action="/api/trainings/create"
                onSubmit={(event) => {
                  void saveTraining(event, "create");
                }}
                className="mt-3"
              >
                <input type="hidden" name="training_on" value={selected} />
                <label htmlFor="training-description" className="text-muted-foreground mb-1 block text-sm">
                  Opis
                </label>
                <textarea
                  id="training-description"
                  name="description"
                  disabled={saving !== null}
                  required
                  maxLength={200}
                  rows={4}
                  className={textareaClassName}
                />
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closePopup}>
                    Zamknij
                  </Button>
                  <Button type="submit" disabled={saving !== null}>
                    {saving === "create" ? "Dodawanie…" : "Dodaj"}
                  </Button>
                </div>
              </form>
            ) : null}

            {coachCanWrite && selectedHasTraining ? (
              <div key={selected}>
                <form
                  method="post"
                  action="/api/trainings/update"
                  onSubmit={(event) => {
                    void saveTraining(event, "update");
                  }}
                  className="mt-3"
                >
                  <input type="hidden" name="training_on" value={selected} />
                  <label htmlFor="training-description" className="text-muted-foreground mb-1 block text-sm">
                    Opis
                  </label>
                  <textarea
                    id="training-description"
                    name="description"
                    disabled={saving !== null}
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
                    <Button type="submit" disabled={saving !== null}>
                      {saving === "update" ? "Zapisywanie…" : "Zapisz"}
                    </Button>
                  </div>
                </form>
                <form
                  method="post"
                  action="/api/trainings/delete"
                  onSubmit={(event) => {
                    void saveTraining(event, "delete");
                  }}
                  className="mt-2 flex justify-end"
                >
                  <input type="hidden" name="training_on" value={selected} />
                  <Button type="submit" variant="destructive" disabled={saving !== null}>
                    {saving === "delete" ? "Usuwanie…" : "Usuń"}
                  </Button>
                </form>
                {squadListVisible ? (
                  <SquadDayList
                    rows={squadRows}
                    preview={coachPreview?.day === selected ? coachPreview : null}
                    onOpen={(userId) => {
                      void openSquadPhoto(selected, userId);
                    }}
                  />
                ) : null}
              </div>
            ) : null}

            {athleteCanUpload ? (
              <div key={selected}>
                <p className="mt-3 text-sm whitespace-pre-wrap">{selectedDescription}</p>
                {photoConfirmed ? null : (
                  <>
                    <label htmlFor="training-photo" className="text-muted-foreground mt-4 mb-1 block text-sm">
                      Zdjęcie
                    </label>
                    <input
                      id="training-photo"
                      type="file"
                      accept="image/*"
                      className={fileClassName}
                      disabled={photoReading || confirming}
                      onChange={onPhotoSelected}
                    />
                  </>
                )}
                {photoReading ? <p className="mt-3 text-sm">Odczyt trwa</p> : null}
                {photoMessage ? <p className="text-destructive mt-3 text-sm">{photoMessage}</p> : null}
                {shownSubmission ? (
                  <PhotoFields
                    key={photoFieldsKey(selected, shownSubmission)}
                    values={shownSubmission}
                    confirming={confirming}
                    error={confirmError}
                    onConfirm={(draft) => {
                      void confirmPhoto(selected, draft);
                    }}
                    onClose={closePopup}
                  />
                ) : (
                  <div className="mt-6 flex justify-end">
                    <Button type="button" variant="outline" onClick={closePopup}>
                      Zamknij
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {!coachCanWrite && selectedHasTraining && !athleteCanUpload ? (
              <>
                <p className="mt-3 text-sm whitespace-pre-wrap">{selectedDescription}</p>
                {squadListVisible ? (
                  <SquadDayList
                    rows={squadRows}
                    preview={coachPreview?.day === selected ? coachPreview : null}
                    onOpen={(userId) => {
                      void openSquadPhoto(selected, userId);
                    }}
                  />
                ) : null}
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

interface SquadDayRow {
  userId: string;
  displayName: string;
  createdAt: string | null;
  submitted: boolean;
  athleteEdited: boolean;
}

function SquadDayList({
  rows,
  preview,
  onOpen,
}: {
  rows: SquadDayRow[];
  preview: CoachPreview | null;
  onOpen: (userId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground mt-4 text-sm">W zespole nie ma zawodników.</p>;
  }

  return (
    <ul className="mt-4 flex flex-col gap-1">
      {rows.map((row) => {
        const rowPreview = preview?.userId === row.userId ? preview : null;
        const photoUrl = rowPreview !== null && rowPreview.status === "ready" ? rowPreview.signedUrl : null;
        const photoError =
          rowPreview !== null && rowPreview.status === "failed" ? (rowPreview.message ?? PREVIEW_FAILED) : null;

        return (
          <li key={row.userId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">{row.displayName}</span>
              {row.submitted ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 py-0 font-normal text-current"
                  onClick={() => {
                    onOpen(row.userId);
                  }}
                >
                  Oddał
                </Button>
              ) : (
                <span className="shrink-0">Nie oddał</span>
              )}
            </div>
            {photoError ? <p className="text-destructive mt-1 text-sm">{photoError}</p> : null}
            {photoUrl ? (
              <>
                <img src={photoUrl} alt="" className="mt-2 block max-w-full" />
                {row.athleteEdited ? <p className="mt-2 text-sm">Poprawił odczyt.</p> : null}
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function rowsForTrainingDay(day: string, athletes: SquadAthlete[], submissions: ConfirmedSubmission[]): SquadDayRow[] {
  const onSquad = new Set(athletes.map((athlete) => athlete.userId));
  const submitted = new Map<string, boolean>();
  const outside: ConfirmedSubmission[] = [];

  for (const submission of submissions) {
    if (submission.trainingOn !== day) continue;
    if (onSquad.has(submission.userId)) {
      if (!submitted.has(submission.userId)) {
        submitted.set(submission.userId, submission.athleteEdited);
      }
      continue;
    }
    outside.push(submission);
  }

  const rows: SquadDayRow[] = athletes.map((athlete) => ({
    userId: athlete.userId,
    displayName: athlete.displayName,
    createdAt: athlete.createdAt,
    submitted: submitted.has(athlete.userId),
    athleteEdited: submitted.get(athlete.userId) ?? false,
  }));

  const seenOutside = new Set<string>();
  for (const submission of outside) {
    if (seenOutside.has(submission.userId)) continue;
    seenOutside.add(submission.userId);
    rows.push({
      userId: submission.userId,
      displayName: submission.displayName,
      createdAt: null,
      submitted: true,
      athleteEdited: submission.athleteEdited,
    });
  }

  rows.sort(compareSquadRows);
  return rows;
}

function compareSquadRows(a: SquadDayRow, b: SquadDayRow): number {
  const byName = a.displayName.localeCompare(b.displayName, "pl");
  if (byName !== 0) return byName;
  if (a.createdAt !== null && b.createdAt !== null) {
    const byCreated = a.createdAt.localeCompare(b.createdAt);
    if (byCreated !== 0) return byCreated;
  }
  return a.userId.localeCompare(b.userId);
}

interface PhotoDraft {
  distance: string;
  duration: string;
  speed: string;
}

function PhotoFields({
  values,
  confirming,
  error,
  onConfirm,
  onClose,
}: {
  values: Submission;
  confirming: boolean;
  error: string | null;
  onConfirm: (draft: PhotoDraft) => void;
  onClose: () => void;
}) {
  const confirmed = values.confirmedAt !== null;
  const [distance, setDistance] = useState(() => formatDecimal(values.distanceKm));
  const [duration, setDuration] = useState(() =>
    values.durationSeconds === null ? "" : formatDuration(values.durationSeconds),
  );
  const [speed, setSpeed] = useState(() => formatDecimal(values.maxSpeedKmh));
  const distanceValue = parseDecimalInput(distance);
  const durationValue = parseDurationInput(duration);
  const speedValue = parseDecimalInput(speed);
  const canConfirm = typeof distanceValue === "number" && distanceValue > 0;
  const edited =
    !confirmed &&
    (enteredDiffers(distanceValue, values.modelDistanceKm) ||
      enteredDiffers(durationValue, values.modelDurationSeconds) ||
      enteredDiffers(speedValue, values.modelMaxSpeedKmh));

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div>
        <label htmlFor="photo-distance" className="text-muted-foreground mb-1 block text-sm">
          Kilometry
        </label>
        <div className="flex items-center gap-2">
          <input
            id="photo-distance"
            inputMode="decimal"
            readOnly={confirmed}
            disabled={confirming}
            value={distance}
            onChange={(event) => {
              setDistance(event.currentTarget.value);
            }}
            className={fieldClassName}
          />
          <span className="text-sm">km</span>
        </div>
      </div>
      <div>
        <label htmlFor="photo-duration" className="text-muted-foreground mb-1 block text-sm">
          Czas
        </label>
        <input
          id="photo-duration"
          inputMode="numeric"
          readOnly={confirmed}
          disabled={confirming}
          value={duration}
          onChange={(event) => {
            setDuration(event.currentTarget.value);
          }}
          className={fieldClassName}
        />
      </div>
      <div>
        <label htmlFor="photo-speed" className="text-muted-foreground mb-1 block text-sm">
          Prędkość maksymalna
        </label>
        <div className="flex items-center gap-2">
          <input
            id="photo-speed"
            inputMode="decimal"
            readOnly={confirmed}
            disabled={confirming}
            value={speed}
            onChange={(event) => {
              setSpeed(event.currentTarget.value);
            }}
            className={fieldClassName}
          />
          <span className="text-sm">km/h</span>
        </div>
      </div>
      <div className="mt-3 flex flex-col items-end gap-3">
        {edited ? <p className="w-full text-sm">{COACH_SEES_EDIT}</p> : null}
        {error ? <p className="text-destructive w-full text-sm">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Zamknij
          </Button>
          {confirmed ? null : (
            <Button
              type="button"
              disabled={!canConfirm || confirming}
              onClick={() => {
                onConfirm({ distance, duration, speed });
              }}
            >
              Potwierdź
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDecimal(value: number | null): string {
  return value === null ? "" : decimalFormat.format(value);
}

function enteredDiffers(entered: number | null | undefined, model: number | null): boolean {
  if (entered === undefined) {
    return true;
  }
  return entered !== model;
}

function photoFieldsKey(day: string, values: Submission): string {
  return [
    day,
    values.confirmedAt ?? "",
    String(values.distanceKm),
    String(values.durationSeconds),
    String(values.maxSpeedKmh),
    String(values.modelDistanceKm),
    String(values.modelDurationSeconds),
    String(values.modelMaxSpeedKmh),
  ].join("|");
}

function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.trunc(totalSeconds));
  const seconds = total % 60;
  const minutesTotal = Math.floor(total / 60);
  if (minutesTotal >= 60) {
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutesTotal}:${String(seconds).padStart(2, "0")}`;
}

async function uploadTrainingPhoto(signedUrl: string, file: File): Promise<boolean> {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const response = await fetch(signedUrl, {
    method: "PUT",
    body,
  });
  return response.ok;
}

function readSignedUrl(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "signedUrl")) {
    return null;
  }
  const signedUrl: unknown = Object.getOwnPropertyDescriptor(value, "signedUrl")?.value;
  return typeof signedUrl === "string" && signedUrl.length > 0 ? signedUrl : null;
}

function readCleared(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "cleared")) {
    return false;
  }
  return Object.getOwnPropertyDescriptor(value, "cleared")?.value === true;
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "error")) {
    return null;
  }
  const message: unknown = Object.getOwnPropertyDescriptor(value, "error")?.value;
  return typeof message === "string" && message.length > 0 ? message : null;
}

function readSubmission(value: unknown): Submission | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const distanceKm = readNullableNumber(value, "distanceKm");
  const durationSeconds = readNullableInteger(value, "durationSeconds");
  const maxSpeedKmh = readNullableNumber(value, "maxSpeedKmh");
  const modelDistanceKm = readNullableNumber(value, "modelDistanceKm");
  const modelDurationSeconds = readNullableInteger(value, "modelDurationSeconds");
  const modelMaxSpeedKmh = readNullableNumber(value, "modelMaxSpeedKmh");
  const athleteEdited = readBoolean(value, "athleteEdited");
  const confirmedAt = readNullableString(value, "confirmedAt");
  if (
    distanceKm === undefined ||
    durationSeconds === undefined ||
    maxSpeedKmh === undefined ||
    modelDistanceKm === undefined ||
    modelDurationSeconds === undefined ||
    modelMaxSpeedKmh === undefined ||
    athleteEdited === undefined ||
    confirmedAt === undefined
  ) {
    return null;
  }
  return {
    distanceKm,
    durationSeconds,
    maxSpeedKmh,
    modelDistanceKm,
    modelDurationSeconds,
    modelMaxSpeedKmh,
    athleteEdited,
    confirmedAt,
  };
}

function readOwn(row: object, key: string): unknown {
  if (!Object.hasOwn(row, key)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(row, key)?.value;
}

function readNullableNumber(row: object, key: string): number | null | undefined {
  if (!Object.hasOwn(row, key)) {
    return undefined;
  }
  const value = readOwn(row, key);
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function readNullableInteger(row: object, key: string): number | null | undefined {
  const value = readNullableNumber(row, key);
  if (value === null || value === undefined) {
    return value;
  }
  return Number.isInteger(value) ? value : undefined;
}

function readBoolean(row: object, key: string): boolean | undefined {
  if (!Object.hasOwn(row, key)) {
    return undefined;
  }
  const value = readOwn(row, key);
  return typeof value === "boolean" ? value : undefined;
}

function readNullableString(row: object, key: string): string | null | undefined {
  if (!Object.hasOwn(row, key)) {
    return undefined;
  }
  const value = readOwn(row, key);
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}
