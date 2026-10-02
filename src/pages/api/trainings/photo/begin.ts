import type { APIRoute } from "astro";
import { createClient, createServiceClient } from "@/lib/supabase";
import { jsonResponse, photoConfigError, readTrainingOn, TRAINING_PHOTOS_BUCKET } from "@/lib/training-photo";

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

  const started = await supabase.rpc("begin_training_photo", {
    training_on: trainingOn,
  });
  if (started.error) {
    return jsonResponse({ error: started.error.message }, 400);
  }
  const storagePath: unknown = started.data as unknown;
  if (typeof storagePath !== "string" || storagePath.length === 0) {
    return jsonResponse({ error: "Nie udało się przygotować wgrania." }, 500);
  }

  // Local Storage rejects ON CONFLICT upsert (42P10): uniqueness is (bucket_id, name, version).
  // Drop the previous object, then sign a plain upload to the same path.
  const removed = await service.storage.from(TRAINING_PHOTOS_BUCKET).remove([storagePath]);
  if (removed.error) {
    return jsonResponse({ error: "Nie udało się przygotować wgrania.", cleared: true }, 500);
  }

  const { data: signed } = await service.storage.from(TRAINING_PHOTOS_BUCKET).createSignedUploadUrl(storagePath);
  if (!signed) {
    return jsonResponse({ error: "Nie udało się przygotować wgrania.", cleared: true }, 500);
  }

  return jsonResponse({ signedUrl: signed.signedUrl });
};
