import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/team/new"];

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

    if (supabase && (pathname.startsWith("/dashboard") || pathname.startsWith("/team/new"))) {
      const { data: membership, error } = await supabase
        .from("team_members")
        .select("id")
        .eq("user_id", context.locals.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!membership && pathname.startsWith("/dashboard")) {
        return context.redirect("/team/new");
      }

      if (membership && pathname.startsWith("/team/new")) {
        return context.redirect("/dashboard");
      }
    }
  }

  return next();
});
