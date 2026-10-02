import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_KEY, SUPABASE_SERVICE_ROLE, SUPABASE_URL } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

/** Service role client for signed Storage URLs and `record_training_readout`. No user cookies. */
export function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
