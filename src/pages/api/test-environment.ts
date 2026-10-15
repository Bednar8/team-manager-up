import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "astro:env/server";

// Read-only proof for local test tools. No credentials or database operations are exposed.
export const POST: APIRoute = async ({ request }) => {
  const response = (body: object, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/;
  if (
    !local.test(new URL(request.url).origin) ||
    !SUPABASE_URL ||
    !local.test(SUPABASE_URL) ||
    !SUPABASE_SERVICE_ROLE
  ) {
    return response({ error: "Local test environment unavailable" }, 404);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid challenge" }, 400);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("challenge" in body) ||
    typeof body.challenge !== "string" ||
    !/^[0-9a-f-]{36}$/.test(body.challenge)
  )
    return response({ error: "Invalid challenge" }, 400);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`local-test-environment:${new URL(SUPABASE_URL).origin}:${body.challenge}`),
  );
  const proof = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return response({ proof }, 200);
};
