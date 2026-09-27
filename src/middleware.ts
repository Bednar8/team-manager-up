import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/calendar", "/ranking", "/team/new", "/team/code"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const pathname = context.url.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtected) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    if (
      supabase &&
      (pathname.startsWith("/dashboard") ||
        pathname.startsWith("/calendar") ||
        pathname.startsWith("/ranking") ||
        pathname.startsWith("/team/new") ||
        pathname.startsWith("/team/code"))
    ) {
      const { data: membership, error } = await supabase
        .from("team_members")
        .select("id, role")
        .eq("user_id", context.locals.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (
        !membership &&
        (pathname.startsWith("/dashboard") ||
          pathname.startsWith("/calendar") ||
          pathname.startsWith("/ranking") ||
          pathname.startsWith("/team/code"))
      ) {
        return context.redirect("/team/new");
      }

      if (membership && pathname.startsWith("/team/code") && readRole(membership) !== "coach") {
        return context.redirect("/dashboard");
      }

      if (membership && pathname.startsWith("/team/new")) {
        return context.redirect("/dashboard");
      }
    }
  }

  return next();
});

function readRole(row: unknown): string | null {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, "role")) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, "role")?.value;
  return typeof value === "string" ? value : null;
}
