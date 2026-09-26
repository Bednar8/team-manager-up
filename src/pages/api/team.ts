import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const team_name = form.get("team_name") as string;
  const display_name = form.get("display_name") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/team/new?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return context.redirect(`/team/new?error=${encodeURIComponent(membershipError.message)}`);
  }

  if (membership) {
    return context.redirect("/dashboard");
  }

  const { error } = await supabase.rpc("create_coach_team", { team_name, display_name });

  if (error) {
    return context.redirect(`/team/new?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard");
};
