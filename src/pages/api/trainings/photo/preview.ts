import type { APIRoute } from "astro";
import { parseCivilDate } from "@/components/calendar/month";
import { createClient, createServiceClient } from "@/lib/supabase";
import { jsonResponse, SIGNED_READ_SECONDS, TRAINING_PHOTOS_BUCKET } from "@/lib/training-photo";

const MISSING_PHOTO = "Nie ma potwierdzonego zdjęcia.";
const OPEN_FAILED = "Nie udało się otworzyć zdjęcia.";
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async (context) => {
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

  const trainingOn = context.url.searchParams.get("training_on");
  if (!trainingOn || !parseCivilDate(trainingOn)) {
    return jsonResponse({ error: "Nieprawidłowa data." }, 400);
  }

  const userId = context.url.searchParams.get("user_id");
  if (!userId || !USER_ID_RE.test(userId)) {
    return jsonResponse({ error: MISSING_PHOTO }, 404);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return jsonResponse({ error: OPEN_FAILED }, 500);
  }
  if (readRole(membership) !== "coach") {
    return jsonResponse({ error: MISSING_PHOTO }, 404);
  }

  const { data: training, error: trainingError } = await supabase
    .from("trainings")
    .select("id")
    .eq("training_on", trainingOn)
    .maybeSingle();
  if (trainingError) {
    return jsonResponse({ error: OPEN_FAILED }, 500);
  }
  const trainingId = readString(training, "id");
  if (!trainingId) {
    return jsonResponse({ error: MISSING_PHOTO }, 404);
  }

  const { data: row, error: submissionError } = await supabase
    .from("training_submissions")
    .select("storage_path, confirmed_at")
    .eq("training_id", trainingId)
    .eq("user_id", userId)
    .not("confirmed_at", "is", null)
    .maybeSingle();
  if (submissionError) {
    return jsonResponse({ error: OPEN_FAILED }, 500);
  }

  const storagePath = readString(row, "storage_path");
  const confirmedAt = readNullableString(row, "confirmed_at");
  if (!storagePath || !confirmedAt) {
    return jsonResponse({ error: MISSING_PHOTO }, 404);
  }

  try {
    const { data: signed } = await service.storage
      .from(TRAINING_PHOTOS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_READ_SECONDS);
    if (!signed?.signedUrl) {
      return jsonResponse({ error: OPEN_FAILED }, 500);
    }
    return jsonResponse({ signedUrl: signed.signedUrl });
  } catch {
    return jsonResponse({ error: OPEN_FAILED }, 500);
  }
};

function readRole(row: unknown): string | null {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, "role")) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, "role")?.value;
  return typeof value === "string" ? value : null;
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
