import type { APIRoute } from "astro";
import { parseCivilDate } from "@/components/calendar/month";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const training_on = form.get("training_on");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/calendar?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect("/auth/signin");
  }

  if (typeof training_on !== "string" || !parseCivilDate(training_on)) {
    return context.redirect(`/calendar?error=${encodeURIComponent("Nieprawidłowa data.")}`);
  }

  const { error } = await supabase.rpc("delete_training", { training_on });

  if (error) {
    return context.redirect(`/calendar?date=${training_on}&error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect(`/calendar?date=${training_on}`);
};
