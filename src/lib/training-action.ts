import type { APIRoute } from "astro";
import { parseCivilDate } from "@/components/calendar/month";
import { createClient } from "@/lib/supabase";

type Operation = "create" | "update" | "delete";
const functions = { create: "create_training", update: "update_training_description", delete: "delete_training" };
const notices = { create: "created", update: "updated", delete: "deleted" };

export function trainingAction(operation: Operation): APIRoute {
  return async (context) => {
    const json = context.request.headers.get("accept")?.includes("application/json") ?? false;
    const reply = (body: object, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    const fail = (error: string, status: number, date?: string) =>
      json
        ? reply({ error }, status)
        : context.redirect(`/calendar?${date ? `date=${date}&` : ""}error=${encodeURIComponent(error)}`);
    const form = await context.request.formData();
    const trainingOn = form.get("training_on");
    const description = form.get("description");
    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) return fail("Supabase is not configured", 503);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json ? reply({ error: "Zaloguj się ponownie." }, 401) : context.redirect("/auth/signin");
    if (typeof trainingOn !== "string" || !parseCivilDate(trainingOn)) return fail("Nieprawidłowa data.", 400);
    if (operation !== "delete" && typeof description !== "string") return fail("Podaj opis treningu.", 400, trainingOn);
    const args = operation === "delete" ? { training_on: trainingOn } : { training_on: trainingOn, description };
    const { error } = await supabase.rpc(functions[operation], args);
    if (error) return fail(error.message, 400, trainingOn);
    return json
      ? reply(
          {
            trainingOn,
            description: operation !== "delete" && typeof description === "string" ? description.trim() : null,
          },
          200,
        )
      : context.redirect(`/calendar?${notices[operation]}=${trainingOn}`);
  };
}
