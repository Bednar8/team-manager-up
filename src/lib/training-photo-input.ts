/** Empty input is `null`. A comma or a dot is the same decimal. Anything else is `undefined`. */
export function parseDecimalInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return undefined;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Empty input is `null`. `m:ss` and `h:mm:ss` become seconds. Anything else is `undefined`. */
export function parseDurationInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  const withHours = /^(\d+):(\d{2}):(\d{2})$/.exec(trimmed);
  if (withHours) {
    const hours = Number(withHours[1]);
    const minutes = Number(withHours[2]);
    const seconds = Number(withHours[3]);
    if (minutes > 59 || seconds > 59) {
      return undefined;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  const minutesAndSeconds = /^(\d+):(\d{2})$/.exec(trimmed);
  if (!minutesAndSeconds) {
    return undefined;
  }
  const minutes = Number(minutesAndSeconds[1]);
  const seconds = Number(minutesAndSeconds[2]);
  if (seconds > 59) {
    return undefined;
  }
  return minutes * 60 + seconds;
}
