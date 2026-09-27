import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/team/code?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return context.redirect(`/team/code?error=${encodeURIComponent(membershipError.message)}`);
  }

  if (readRole(membership) !== "coach") {
    return context.redirect("/dashboard");
  }

  const { error } = await supabase.rpc("replace_team_join_code");

  if (error) {
    return context.redirect(`/team/code?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard");
};

function readRole(row: unknown): string | null {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, "role")) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, "role")?.value;
  return typeof value === "string" ? value : null;
}
