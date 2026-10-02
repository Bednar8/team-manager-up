import { OPENROUTER_API_KEY, SUPABASE_SERVICE_ROLE, SUPABASE_URL } from "astro:env/server";
import { parseCivilDate } from "@/components/calendar/month";

export const TRAINING_PHOTOS_BUCKET = "training-photos";

/** Short read link for the model. Minutes, not days. */
export const SIGNED_READ_SECONDS = 5 * 60;

/** One server-side vision model. The browser never sees this id. */
export const READOUT_MODEL = "google/gemini-2.5-flash";

export const PHOTO_CONFIG_ERROR = "Odczyt zdjęcia nie jest skonfigurowany.";

const READOUT_PROMPT = [
  "Read one running-workout screenshot.",
  "Reply with JSON only, no markdown, using keys distance_km, duration_seconds, and max_speed_kmh.",
  "distance_km is kilometers as a number.",
  "duration_seconds is the workout duration as an integer number of seconds (42:10 is 2530).",
  "max_speed_kmh is maximum speed in km/h as a number.",
  "Use null when the screenshot does not show that value. Do not guess.",
].join(" ");

export interface ReadoutNumbers {
  distanceKm: number | null;
  durationSeconds: number | null;
  maxSpeedKmh: number | null;
}

export function photoConfigError(): string | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !OPENROUTER_API_KEY) {
    return PHOTO_CONFIG_ERROR;
  }
  return null;
}

export async function readTrainingOn(request: Request): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || !Object.hasOwn(body, "training_on")) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(body, "training_on")?.value;
  if (typeof value !== "string" || !parseCivilDate(value)) {
    return null;
  }
  return value;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** OpenRouter cannot fetch loopback Storage. Those photos are sent inline. */
export function modelCanFetchUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
  } catch {
    return false;
  }
}

const INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

export async function inlineImageDataUrl(blob: Blob): Promise<string | null> {
  if (blob.size === 0 || blob.size > INLINE_IMAGE_BYTES) {
    return null;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = imageContentType(blob.type, bytes);
  if (!type) {
    return null;
  }
  return `data:${type};base64,${bytesToBase64(bytes)}`;
}

export async function readWorkoutPhoto(imageUrl: string): Promise<ReadoutNumbers | null> {
  if (!OPENROUTER_API_KEY) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: READOUT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: READOUT_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const text = openRouterText(payload);
  if (text === null) {
    return null;
  }
  return parseReadoutJson(text);
}

function openRouterText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !Object.hasOwn(payload, "choices")) {
    return null;
  }
  const choices: unknown = Object.getOwnPropertyDescriptor(payload, "choices")?.value;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null || !Object.hasOwn(first, "message")) {
    return null;
  }
  const message: unknown = Object.getOwnPropertyDescriptor(first, "message")?.value;
  if (typeof message !== "object" || message === null || !Object.hasOwn(message, "content")) {
    return null;
  }
  const content: unknown = Object.getOwnPropertyDescriptor(message, "content")?.value;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const parts: string[] = [];
  const items: unknown[] = content as unknown[];
  for (const part of items) {
    if (typeof part !== "object" || part === null || !Object.hasOwn(part, "text")) {
      continue;
    }
    const text: unknown = Object.getOwnPropertyDescriptor(part, "text")?.value;
    if (typeof text === "string") {
      parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

function parseReadoutJson(text: string): ReadoutNumbers | null {
  const fenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const direct = parseReadoutObject(fenced);
  if (direct) {
    return direct;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  return parseReadoutObject(text.slice(start, end + 1));
}

function parseReadoutObject(text: string): ReadoutNumbers | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const distanceKm = readJsonNumber(parsed, "distance_km", false);
  const durationSeconds = readJsonNumber(parsed, "duration_seconds", true);
  const maxSpeedKmh = readJsonNumber(parsed, "max_speed_kmh", false);
  if (distanceKm === undefined || durationSeconds === undefined || maxSpeedKmh === undefined) {
    return null;
  }
  return { distanceKm, durationSeconds, maxSpeedKmh };
}

function imageContentType(reported: string, bytes: Uint8Array): string | null {
  if (reported.startsWith("image/")) {
    return reported;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** `null` when the value is missing. `undefined` when the value is present but not a number. */
function readJsonNumber(source: object, key: string, integer: boolean): number | null | undefined {
  if (!Object.hasOwn(source, key)) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(source, key)?.value;
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (integer && !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}
