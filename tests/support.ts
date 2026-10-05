// HTTP fixture for a running dev server. Inserts one team per run and leaves existing rows in place.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "http://localhost:4321";
const PASSWORD = "Harness-Test-Passw0rd!";
const PHOTO_CONFIG_ERROR = "Odczyt zdjęcia nie jest skonfigurowany.";
const TINY_PNG_BYTES = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4, 133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
];

export interface HttpResponse {
  status: number;
  location: string;
  body: string;
}

export interface SignedInUser {
  email: string;
  displayName: string;
  jar: Map<string, string>;
}

export interface TeamFixture {
  runId: string;
  teamName: string;
  teamCode: string;
  coach: SignedInUser;
  athletes: [SignedInUser, SignedInUser, SignedInUser];
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: "coach" | "athlete";
  displayName: string;
}

export interface TrainingSubmissionRow {
  distanceKm: number | null;
  modelDistanceKm: number | null;
  athleteEdited: boolean;
  confirmedAt: string | null;
  trainingOn: string;
}

export function warsawToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function findTeamMemberByDisplayName(displayName: string): Promise<TeamMember | null> {
  const rows = readRows(
    await serviceGet(
      `team_members?select=id,team_id,user_id,role,display_name&${eqFilter("display_name", displayName)}`,
    ),
    "Team member lookup",
  );
  if (rows.length === 0) {
    return null;
  }
  if (rows.length > 1) {
    throw new Error(`More than one team member is named ${displayName}`);
  }
  return readTeamMember(rows[0]);
}

export async function createTeamFixture(): Promise<TeamFixture> {
  requireServiceConfig();
  await assertDevServerReachable();
  await assertServiceRole();

  const runId = randomUUID();
  const coach = await signUp(`coach-${runId}@example.com`, `Trener ${runId}`);
  const teamName = `Zespół ${runId}`;
  await postForm(coach.jar, "/api/team", { team_name: teamName, display_name: coach.displayName }, "/dashboard");
  const dashboard = await request(coach.jar, "/dashboard");
  if (dashboard.status !== 200) {
    throw new Error(`Coach dashboard returned ${dashboard.status} ${dashboard.location}`);
  }
  const teamCode = readTeamCode(dashboard.body);
  const athletes: [SignedInUser, SignedInUser, SignedInUser] = [
    await createAthlete(runId, "Potwierdza", teamCode),
    await createAthlete(runId, "Wgrywa", teamCode),
    await createAthlete(runId, "Milczy", teamCode),
  ];
  return { runId, teamName, teamCode, coach, athletes };
}

export async function request(
  cookies: Map<string, string>,
  path: string,
  options: {
    method?: string;
    form?: Record<string, string>;
    json?: Record<string, string | number | boolean | null>;
  } = {},
): Promise<HttpResponse> {
  const form = options.form;
  const json = options.json;
  const headers: Record<string, string> = {
    Cookie: cookieHeader(cookies),
    Origin: baseUrl(),
  };
  let body: string | undefined;
  if (form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Accept = "application/json";
    body = JSON.stringify(json);
  }
  const response = await fetch(baseUrl() + path, {
    method: options.method ?? "GET",
    redirect: "manual",
    headers,
    body,
  });
  storeCookies(cookies, response);
  const responseBody = await response.text();
  return { status: response.status, location: response.headers.get("location") ?? "", body: responseBody };
}

export async function createTraining(
  cookies: Map<string, string>,
  trainingOn: string,
  description: string,
): Promise<void> {
  await postForm(
    cookies,
    "/api/trainings/create",
    { training_on: trainingOn, description },
    `/calendar?date=${trainingOn}`,
  );
}

export async function beginTrainingPhoto(cookies: Map<string, string>, trainingOn: string): Promise<string> {
  const result = await request(cookies, "/api/trainings/photo/begin", {
    method: "POST",
    json: { training_on: trainingOn },
  });
  if (result.status === 503 && result.body.includes(PHOTO_CONFIG_ERROR)) {
    throw new Error(`Precondition failed: OPENROUTER_API_KEY is missing in the dev process (${PHOTO_CONFIG_ERROR})`);
  }
  if (result.status !== 200) {
    throw new Error(`POST /api/trainings/photo/begin returned ${result.status} ${readFailureText(result.body)}`);
  }
  const signedUrl = readSignedUrl(parseJsonObject(result.body));
  if (signedUrl === null) {
    throw new Error("POST /api/trainings/photo/begin did not return signedUrl");
  }
  return signedUrl;
}

export async function uploadTrainingPhoto(signedUrl: string): Promise<void> {
  const file = tinyPngFile();
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  let response: Response;
  try {
    response = await fetch(signedUrl, { method: "PUT", body });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "connection failed";
    throw new Error(`Signed photo upload failed (${reason})`, { cause: error });
  }
  const status = response.status;
  const failureText = await response.text();
  if (!response.ok) {
    throw new Error(`Signed photo upload returned ${status} ${failureText}`);
  }
}

export async function recordTrainingReadout(input: {
  userId: string;
  trainingOn: string;
  distanceKm: number;
  durationSeconds: null;
  maxSpeedKmh: null;
}): Promise<void> {
  await serviceRpc("record_training_readout", {
    user_id: input.userId,
    training_on: input.trainingOn,
    distance_km: input.distanceKm,
    duration_seconds: input.durationSeconds,
    max_speed_kmh: input.maxSpeedKmh,
  });
}

export async function confirmTrainingPhoto(
  cookies: Map<string, string>,
  input: {
    trainingOn: string;
    distanceKm: number;
    durationSeconds: null;
    maxSpeedKmh: null;
  },
): Promise<void> {
  const result = await request(cookies, "/api/trainings/photo/confirm", {
    method: "POST",
    json: {
      training_on: input.trainingOn,
      distance_km: input.distanceKm,
      duration_seconds: input.durationSeconds,
      max_speed_kmh: input.maxSpeedKmh,
    },
  });
  if (result.status !== 200) {
    throw new Error(`POST /api/trainings/photo/confirm returned ${result.status} ${readFailureText(result.body)}`);
  }
}

export async function readTrainingSubmission(
  userId: string,
  trainingOn: string,
): Promise<TrainingSubmissionRow | null> {
  const select = [
    "distance_km",
    "model_distance_km",
    "athlete_edited",
    "confirmed_at",
    "trainings!inner(training_on)",
  ].join(",");
  const query = [
    `training_submissions?select=${select}`,
    eqFilter("user_id", userId),
    eqFilter("trainings.training_on", trainingOn),
  ].join("&");
  const rows = readRows(await serviceGet(query), "Training submission lookup");
  if (rows.length === 0) {
    return null;
  }
  if (rows.length > 1) {
    throw new Error("More than one training submission matches that athlete and day");
  }
  return readTrainingSubmissionRow(rows[0]);
}

export function listItemContaining(html: string, displayName: string): string {
  const items = listItems(html).filter((item) => item.includes(displayName));
  if (items.length === 0) {
    throw new Error(`Calendar HTML has no list item for ${displayName}`);
  }
  if (items.length > 1) {
    throw new Error(`More than one list item contains ${displayName}`);
  }
  return items[0];
}

function baseUrl(): string {
  // Vitest injects BASE_URL=/ for Vite's asset base. An http(s) origin is the app.
  return httpOrigin(process.env.TEST_APP_URL) ?? httpOrigin(process.env.BASE_URL) ?? DEFAULT_BASE_URL;
}

function httpOrigin(value: string | undefined): string | undefined {
  const trimmed = nonEmpty(value);
  if (trimmed === undefined || !/^https?:\/\//.test(trimmed)) {
    return undefined;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

async function assertDevServerReachable(): Promise<void> {
  const address = baseUrl();
  try {
    await fetch(address, { redirect: "manual" });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "connection failed";
    throw new Error(`Dev server is not reachable at ${address} (${reason})`, { cause: error });
  }
}

async function assertServiceRole(): Promise<void> {
  // select id from teams limit 1 — fails the run before signup when the key cannot read.
  const rows = readRows(await serviceGet("teams?select=id&limit=1"), "Service role check");
  for (const row of rows) {
    readString(row, "id");
  }
}

async function createAthlete(
  runId: string,
  givenName: "Potwierdza" | "Wgrywa" | "Milczy",
  teamCode: string,
): Promise<SignedInUser> {
  const displayName = `${givenName} ${runId}`;
  const athlete = await signUp(`${givenName.toLowerCase()}-${runId}@example.com`, displayName);
  await postForm(athlete.jar, "/api/team/join", { join_code: teamCode, display_name: displayName }, "/dashboard");
  return athlete;
}

async function signUp(email: string, displayName: string): Promise<SignedInUser> {
  const jar = new Map<string, string>();
  await postForm(jar, "/api/auth/signup", { email, password: PASSWORD }, "/auth/confirm-email");
  await postForm(jar, "/api/auth/signin", { email, password: PASSWORD }, "/");
  return { email, displayName, jar };
}

async function postForm(
  cookies: Map<string, string>,
  path: string,
  form: Record<string, string>,
  expectedPath: string,
): Promise<void> {
  const result = await request(cookies, path, { method: "POST", form });
  if (result.status !== 302 || !redirectMatches(result.location, expectedPath)) {
    throw new Error(`${path} returned ${result.status} ${result.location}`);
  }
}

function redirectMatches(location: string, expectedPath: string): boolean {
  const path = redirectPath(location);
  return path === expectedPath || path.startsWith(`${expectedPath}?`);
}

function redirectPath(location: string): string {
  const decoded = decodeURIComponent(location);
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    const url = new URL(decoded);
    return `${url.pathname}${url.search}`;
  }
  return decoded;
}

function readTeamCode(html: string): string {
  const match = /data-team-code="([^"]+)"/.exec(html);
  const code = match?.[1];
  if (code === undefined || code === "") {
    throw new Error("Dashboard response did not include data-team-code");
  }
  return code;
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function storeCookies(cookies: Map<string, string>, response: Response): void {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((attr) => /max-age=0/i.test(attr.trim()));
    if (expired) {
      cookies.delete(name.trim());
    } else {
      cookies.set(name.trim(), rest.join("="));
    }
  }
}

let serviceEnvLoaded = false;

function loadServiceEnv(): void {
  if (serviceEnvLoaded) {
    return;
  }
  applyEnvFile(resolve(repoRoot, ".env"));
  applyEnvFile(resolve(repoRoot, ".dev.vars"));
  serviceEnvLoaded = true;
}

function applyEnvFile(filePath: string): void {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return;
    }
    throw error;
  }
  for (const line of text.split(/\r?\n/u)) {
    applyEnvLine(line);
  }
}

function applyEnvLine(line: string): void {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return;
  }
  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const separator = withoutExport.indexOf("=");
  if (separator <= 0) {
    return;
  }
  const key = withoutExport.slice(0, separator).trim();
  if (key !== "SUPABASE_URL" && key !== "SUPABASE_SERVICE_ROLE") {
    return;
  }
  if (nonEmpty(process.env[key]) !== undefined) {
    return;
  }
  const value = nonEmpty(unquote(withoutExport.slice(separator + 1)));
  if (value === undefined) {
    return;
  }
  process.env[key] = value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const doubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const singleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  if ((doubleQuoted || singleQuoted) && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") {
    return undefined;
  }
  return trimmed;
}

function isEnoent(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !Object.hasOwn(error, "code")) {
    return false;
  }
  const code: unknown = Object.getOwnPropertyDescriptor(error, "code")?.value;
  return code === "ENOENT";
}

function requireServiceConfig(): { url: string; serviceRole: string } {
  loadServiceEnv();
  const url = nonEmpty(process.env.SUPABASE_URL);
  const serviceRole = nonEmpty(process.env.SUPABASE_SERVICE_ROLE);
  const missing: string[] = [];
  if (url === undefined) {
    missing.push("SUPABASE_URL");
  }
  if (serviceRole === undefined) {
    missing.push("SUPABASE_SERVICE_ROLE");
  }
  if (url === undefined || serviceRole === undefined) {
    throw new Error(`Missing ${missing.join(" and ")}. Set them in the environment, .env, or .dev.vars.`);
  }
  return { url, serviceRole };
}

async function serviceGet(pathAndQuery: string): Promise<unknown> {
  const { url, serviceRole } = requireServiceConfig();
  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
      redirect: "manual",
      headers: {
        Accept: "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "connection failed";
    throw new Error(`Service role request failed (${reason})`, { cause: error });
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Service role request failed with status ${response.status}`);
  }
  const text = await response.text();
  const body = text === "" ? null : parseJson(text);
  if (!response.ok) {
    throw new Error(`Service role request failed: ${readErrorMessage(body)}`);
  }
  return body;
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function readErrorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !Object.hasOwn(body, "message")) {
    return "request failed";
  }
  const message: unknown = Object.getOwnPropertyDescriptor(body, "message")?.value;
  if (typeof message !== "string" || message === "") {
    return "request failed";
  }
  return message;
}

function eqFilter(column: string, value: string): string {
  return `${column}=eq.${encodeURIComponent(value)}`;
}

function readRows(body: unknown, label: string): readonly unknown[] {
  if (!isUnknownArray(body)) {
    throw new Error(`${label} did not return rows`);
  }
  return body;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readTeamMember(row: unknown): TeamMember {
  const role = readString(row, "role");
  if (role !== "coach" && role !== "athlete") {
    throw new Error("Could not read team member role");
  }
  return {
    id: readString(row, "id"),
    teamId: readString(row, "team_id"),
    userId: readString(row, "user_id"),
    role,
    displayName: readString(row, "display_name"),
  };
}

function readString(row: unknown, key: string): string {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, key)) {
    throw new Error(`Could not read ${key}`);
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, key)?.value;
  if (typeof value !== "string" || value === "") {
    throw new Error(`Could not read ${key}`);
  }
  return value;
}

async function serviceRpc(name: string, args: Record<string, string | number | boolean | null>): Promise<void> {
  const { url, serviceRole } = requireServiceConfig();
  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify(args),
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "connection failed";
    throw new Error(`Service role request failed (${reason})`, { cause: error });
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Service role request failed with status ${response.status}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Service role request failed: ${readFailureText(text)}`);
  }
}

function parseJsonObject(text: string): unknown {
  try {
    return parseJson(text);
  } catch {
    return null;
  }
}

function readFailureText(text: string): string {
  const body = parseJsonObject(text);
  const errorText = readOptionalString(body, "error");
  if (errorText !== undefined) {
    return errorText;
  }
  return readErrorMessage(body);
}

function readOptionalString(row: unknown, key: string): string | undefined {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, key)) {
    return undefined;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, key)?.value;
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  return value;
}

function readSignedUrl(value: unknown): string | null {
  const signedUrl = readOptionalString(value, "signedUrl");
  return signedUrl ?? null;
}

function readTrainingSubmissionRow(row: unknown): TrainingSubmissionRow {
  return {
    distanceKm: readNullableNumber(row, "distance_km"),
    modelDistanceKm: readNullableNumber(row, "model_distance_km"),
    athleteEdited: readBoolean(row, "athlete_edited"),
    confirmedAt: readNullableString(row, "confirmed_at"),
    trainingOn: readEmbeddedTrainingOn(row),
  };
}

function readEmbeddedTrainingOn(row: unknown): string {
  const embedded = readOwn(row, "trainings");
  if (typeof embedded !== "object" || embedded === null || Array.isArray(embedded)) {
    throw new Error("Could not read training_on");
  }
  return readString(embedded, "training_on");
}

function readOwn(row: unknown, key: string): unknown {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, key)) {
    throw new Error(`Could not read ${key}`);
  }
  return Object.getOwnPropertyDescriptor(row, key)?.value;
}

function readNullableNumber(row: unknown, key: string): number | null {
  const value = readOwn(row, key);
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Could not read ${key}`);
}

function readBoolean(row: unknown, key: string): boolean {
  const value = readOwn(row, key);
  if (typeof value !== "boolean") {
    throw new Error(`Could not read ${key}`);
  }
  return value;
}

function readNullableString(row: unknown, key: string): string | null {
  const value = readOwn(row, key);
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Could not read ${key}`);
  }
  return value;
}

function tinyPngFile(): File {
  const buffer = new ArrayBuffer(TINY_PNG_BYTES.length);
  new Uint8Array(buffer).set(TINY_PNG_BYTES);
  return new File([buffer], "photo.png", { type: "image/png" });
}

function listItems(html: string): string[] {
  const items: string[] = [];
  const openTag = "<li";
  const closeTag = "</li>";
  let cursor = 0;
  while (cursor < html.length) {
    const open = html.indexOf(openTag, cursor);
    if (open < 0) {
      break;
    }
    const boundary = html[open + openTag.length];
    if (boundary !== ">" && boundary !== " " && boundary !== "\n" && boundary !== "\t" && boundary !== "\r") {
      cursor = open + openTag.length;
      continue;
    }
    const close = html.indexOf(closeTag, open);
    if (close < 0) {
      break;
    }
    items.push(html.slice(open, close + closeTag.length));
    cursor = close + closeTag.length;
  }
  return items;
}
