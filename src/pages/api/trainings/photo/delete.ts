import type { APIRoute } from "astro";
import { createClient, createServiceClient } from "@/lib/supabase";
import { jsonResponse, readTrainingOn, TRAINING_PHOTOS_BUCKET } from "@/lib/training-photo";

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

  const trainingOn = await readTrainingOn(context.request);
  if (!trainingOn) {
    return jsonResponse({ error: "Nieprawidłowa data." }, 400);
  }

  const deleted = await supabase.rpc("delete_training_photo", {
    training_on: trainingOn,
  });
  if (deleted.error) {
    return jsonResponse({ error: deleted.error.message }, 400);
  }
  const storagePath: unknown = deleted.data as unknown;
  if (typeof storagePath !== "string" || storagePath.length === 0) {
    return jsonResponse({ error: "Nie udało się usunąć zdjęcia." }, 500);
  }

  const removed = await service.storage.from(TRAINING_PHOTOS_BUCKET).remove([storagePath]);
  if (removed.error) {
    return jsonResponse({ error: "Nie udało się usunąć zdjęcia." }, 500);
  }

  return jsonResponse({});
};
