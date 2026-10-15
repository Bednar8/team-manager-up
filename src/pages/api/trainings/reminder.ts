import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { pendingTrainingDate } from "@/lib/training-reminder";

export const GET: APIRoute = async (context) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const client = createClient(context.request.headers, context.cookies);
  const user = context.locals.user;
  if (!client || !user) return new Response(JSON.stringify({ date: null }), { status: 401, headers });
  try {
    return new Response(JSON.stringify({ date: await pendingTrainingDate(client, user.id) }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "Nie udało się sprawdzić treningu." }), { status: 503, headers });
  }
};
