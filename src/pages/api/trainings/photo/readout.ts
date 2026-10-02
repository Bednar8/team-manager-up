import type { APIRoute } from "astro";
import { createClient, createServiceClient } from "@/lib/supabase";
import {
  inlineImageDataUrl,
  jsonResponse,
  modelCanFetchUrl,
  photoConfigError,
  readTrainingOn,
  readWorkoutPhoto,
  SIGNED_READ_SECONDS,
  TRAINING_PHOTOS_BUCKET,
} from "@/lib/training-photo";

const READOUT_FAILED = "Nie udało się odczytać zdjęcia. Wpisz dane albo wgraj inne.";

export const POST: APIRoute = async (context) => {
  const configError = photoConfigError();
  if (configError) {
    return jsonResponse({ error: configError }, 503);
  }

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

  const trainingOn = await readTrainingOn(context.request);
  if (!trainingOn) {
    return jsonResponse({ error: "Nieprawidłowa data." }, 400);
  }

  const submission = await loadOwnSubmission(supabase, user.id, trainingOn);
  if ("error" in submission) {
    return jsonResponse({ error: READOUT_FAILED }, 400);
  }
  if (submission.confirmedAt) {
    return jsonResponse({ error: "To zdjęcie jest już potwierdzone." }, 400);
  }

  const { data: exists, error: existsError } = await service.storage
    .from(TRAINING_PHOTOS_BUCKET)
    .exists(submission.storagePath);
  if (existsError || !exists) {
    return jsonResponse({ error: READOUT_FAILED }, 400);
  }

  const imageUrl = await imageUrlForModel(service, submission.storagePath);
  if (!imageUrl) {
    return jsonResponse({ error: READOUT_FAILED }, 502);
  }

  const readout = await readWorkoutPhoto(imageUrl);
  if (!readout) {
    return jsonResponse({ error: READOUT_FAILED }, 502);
  }

  const { error: recordError } = await service.rpc("record_training_readout", {
    user_id: user.id,
    training_on: trainingOn,
    distance_km: readout.distanceKm,
    duration_seconds: readout.durationSeconds,
    max_speed_kmh: readout.maxSpeedKmh,
  });
  if (recordError) {
    return jsonResponse({ error: READOUT_FAILED }, 502);
  }

  return jsonResponse({
    distanceKm: readout.distanceKm,
    durationSeconds: readout.durationSeconds,
    maxSpeedKmh: readout.maxSpeedKmh,
    modelDistanceKm: readout.distanceKm,
    modelDurationSeconds: readout.durationSeconds,
    modelMaxSpeedKmh: readout.maxSpeedKmh,
    athleteEdited: false,
    confirmedAt: null,
  });
};

async function imageUrlForModel(
  service: NonNullable<ReturnType<typeof createServiceClient>>,
  storagePath: string,
): Promise<string | null> {
  const { data: signed } = await service.storage
    .from(TRAINING_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_READ_SECONDS);
  if (!signed?.signedUrl) {
    return null;
  }
  if (modelCanFetchUrl(signed.signedUrl)) {
    return signed.signedUrl;
  }

  const downloaded = await service.storage.from(TRAINING_PHOTOS_BUCKET).download(storagePath);
  if (!isBlob(downloaded.data)) {
    return null;
  }
  return inlineImageDataUrl(downloaded.data);
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

interface OwnSubmission {
  storagePath: string;
  confirmedAt: string | null;
}

async function loadOwnSubmission(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  trainingOn: string,
): Promise<OwnSubmission | { error: true }> {
  const { data: training, error: trainingError } = await supabase
    .from("trainings")
    .select("id")
    .eq("training_on", trainingOn)
    .maybeSingle();
  if (trainingError || !training) {
    return { error: true };
  }
  const trainingId = readString(training, "id");
  if (!trainingId) {
    return { error: true };
  }

  const { data: row, error } = await supabase
    .from("training_submissions")
    .select("storage_path, confirmed_at")
    .eq("training_id", trainingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) {
    return { error: true };
  }

  const storagePath = readString(row, "storage_path");
  const confirmedAt = readNullableString(row, "confirmed_at");
  if (!storagePath || confirmedAt === undefined) {
    return { error: true };
  }
  return { storagePath, confirmedAt };
}

function readString(row: unknown, key: string): string | null {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, key)) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, key)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableString(row: unknown, key: string): string | null | undefined {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, key)) {
    return undefined;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, key)?.value;
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}
