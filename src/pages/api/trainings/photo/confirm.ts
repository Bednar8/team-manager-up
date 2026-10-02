import type { APIRoute } from "astro";
import { createClient, createServiceClient } from "@/lib/supabase";
import { parseDecimalInput, parseDurationInput } from "@/lib/training-photo-input";
import { jsonResponse, TRAINING_PHOTOS_BUCKET } from "@/lib/training-photo";
import { parseCivilDate } from "@/components/calendar/month";

const NEEDS_KM = "Podaj liczbę kilometrów większą od zera.";
const MISSING_PHOTO = "Tego dnia nie ma zdjęcia.";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const service = createServiceClient();
  if (!supabase || !service) {
    return jsonResponse({ error: "Supabase nie jest skonfigurowany." }, 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: "Zaloguj się." }, 401);
  }

  const input = await readConfirmInput(context.request);
  if ("error" in input) {
    return jsonResponse({ error: input.error }, 400);
  }

  const submission = await loadOwnSubmission(supabase, user.id, input.trainingOn);
  if (!("error" in submission)) {
    const { data: exists, error: existsError } = await service.storage
      .from(TRAINING_PHOTOS_BUCKET)
      .exists(submission.storagePath);
    if (existsError || !exists) {
      return jsonResponse({ error: MISSING_PHOTO }, 400);
    }
  }

  const { error } = await supabase.rpc("confirm_training_photo", {
    training_on: input.trainingOn,
    distance_km: input.distanceKm,
    duration_seconds: input.durationSeconds,
    max_speed_kmh: input.maxSpeedKmh,
  });
  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const saved = await loadConfirmedSubmission(supabase, user.id, input.trainingOn);
  if ("error" in saved) {
    return jsonResponse({ error: "Nie udało się potwierdzić." }, 500);
  }
  return jsonResponse(saved);
};

interface ConfirmInput {
  trainingOn: string;
  distanceKm: number;
  durationSeconds: number | null;
  maxSpeedKmh: number | null;
}

async function readConfirmInput(request: Request): Promise<ConfirmInput | { error: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "Nieprawidłowa data." };
  }
  if (typeof body !== "object" || body === null) {
    return { error: "Nieprawidłowa data." };
  }

  const trainingOn = readString(body, "training_on");
  if (!trainingOn || !parseCivilDate(trainingOn)) {
    return { error: "Nieprawidłowa data." };
  }

  const distanceKm = readMeasure(body, "distance_km");
  if (typeof distanceKm !== "number" || distanceKm <= 0) {
    return { error: NEEDS_KM };
  }

  const durationSeconds = readDuration(body, "duration_seconds");
  if (durationSeconds === undefined) {
    return { error: "Nieprawidłowy czas." };
  }

  const maxSpeedKmh = readMeasure(body, "max_speed_kmh");
  if (maxSpeedKmh === undefined) {
    return { error: "Nieprawidłowa prędkość." };
  }

  return { trainingOn, distanceKm, durationSeconds, maxSpeedKmh };
}

interface OwnSubmission {
  storagePath: string;
}

async function loadOwnSubmission(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  trainingOn: string,
): Promise<OwnSubmission | { error: true }> {
  const trainingId = await loadTrainingId(supabase, trainingOn);
  if (!trainingId) {
    return { error: true };
  }

  const { data: row, error } = await supabase
    .from("training_submissions")
    .select("storage_path")
    .eq("training_id", trainingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) {
    return { error: true };
  }

  const storagePath = readString(row, "storage_path");
  if (!storagePath) {
    return { error: true };
  }
  return { storagePath };
}

interface ConfirmedSubmission {
  distanceKm: number | null;
  durationSeconds: number | null;
  maxSpeedKmh: number | null;
  modelDistanceKm: number | null;
  modelDurationSeconds: number | null;
  modelMaxSpeedKmh: number | null;
  athleteEdited: boolean;
  confirmedAt: string | null;
}

async function loadConfirmedSubmission(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  trainingOn: string,
): Promise<ConfirmedSubmission | { error: true }> {
  const trainingId = await loadTrainingId(supabase, trainingOn);
  if (!trainingId) {
    return { error: true };
  }

  const { data: row, error } = await supabase
    .from("training_submissions")
    .select(
      "distance_km, duration_seconds, max_speed_kmh, model_distance_km, model_duration_seconds, model_max_speed_kmh, athlete_edited, confirmed_at",
    )
    .eq("training_id", trainingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) {
    return { error: true };
  }

  const distanceKm = readNullableNumber(row, "distance_km");
  const durationSeconds = readNullableInteger(row, "duration_seconds");
  const maxSpeedKmh = readNullableNumber(row, "max_speed_kmh");
  const modelDistanceKm = readNullableNumber(row, "model_distance_km");
  const modelDurationSeconds = readNullableInteger(row, "model_duration_seconds");
  const modelMaxSpeedKmh = readNullableNumber(row, "model_max_speed_kmh");
  const athleteEdited = readBoolean(row, "athlete_edited");
  const confirmedAt = readNullableString(row, "confirmed_at");
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
    return { error: true };
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

async function loadTrainingId(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  trainingOn: string,
): Promise<string | null> {
  const { data: training, error } = await supabase
    .from("trainings")
    .select("id")
    .eq("training_on", trainingOn)
    .maybeSingle();
  if (error || !training) {
    return null;
  }
  return readString(training, "id");
}

function readMeasure(body: object, key: string): number | null | undefined {
  if (!Object.hasOwn(body, key)) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    return parseDecimalInput(value);
  }
  return undefined;
}

function readDuration(body: object, key: string): number | null | undefined {
  if (!Object.hasOwn(body, key)) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === "string") {
    return parseDurationInput(value);
  }
  return undefined;
}

function readString(row: object, key: string): string | null {
  if (!Object.hasOwn(row, key)) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, key)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
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
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
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
