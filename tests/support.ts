// HTTP fixtures own their resources; managed teardown preserves preexisting local data.

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { testConfig, withTestResources, type TestResources } from "../scripts/test-resources.mjs";

const runs = new AsyncLocalStorage<TestResources>();
const users = new WeakMap<Map<string, string>, string>();
const uploads = new Map<string, { run: TestResources; path: string }>();

function currentRun(): TestResources {
  const run = runs.getStore();
  if (!run) throw new Error("Mutations require withTeamFixture");
  return run;
}

export async function withTeamFixture(action: (team: TeamFixture, run: TestResources) => Promise<void>): Promise<void> {
  await withTestResources(testConfig(baseUrl()), async (run) => {
    // eslint-disable-next-line no-console -- The run ID enables interrupted-run cleanup.
    console.log(`Test resource run: ${run.data.runId}`);
    await runs.run(run, async () => {
      await action(await createTeamFixture(), run);
    });
  });
}

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

export function warsawYesterday(): string {
  return previousCivilDate(warsawToday());
}

function previousCivilDate(civilDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(civilDate);
  if (match === null) {
    throw new Error("Could not read civil date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error("Could not read civil date");
  }
  utc.setUTCDate(day - 1);
  const shiftedYear = utc.getUTCFullYear().toString().padStart(4, "0");
  const shiftedMonth = (utc.getUTCMonth() + 1).toString().padStart(2, "0");
  const shiftedDay = utc.getUTCDate().toString().padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
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

async function createTeamFixture(): Promise<TeamFixture> {
  requireServiceConfig();
  await assertDevServerReachable();
  await assertServiceRole();

  const runId = currentRun().data.runId;
  const coach = await signUp(`coach-${runId}@example.com`, `Trener ${runId}`);
  const teamName = `Zespół ${runId}`;
  await currentRun().createTeam(requireUser(coach.jar), () =>
    postForm(coach.jar, "/api/team", { team_name: teamName, display_name: coach.displayName }, "/dashboard"),
  );
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
  const run = currentRun();
  const action = () => rawRequest(cookies, path, options);
  const userId = users.get(cookies);
  if (options.method === "POST" && path === "/api/trainings/create") {
    const member = await run.rows("team_members", { user_id: requireUser(cookies) });
    return run.capture(
      "trainings",
      { team_id: member[0].team_id, training_on: options.form?.training_on ?? "" },
      action,
    );
  }
  if (options.method === "POST" && path === "/api/trainings/photo/begin") {
    const member = await run.rows("team_members", { user_id: requireUser(cookies) });
    const training = readRows(
      await serviceGet(
        `trainings?select=id&${eqFilter("team_id", member[0].team_id)}&${eqFilter("training_on", String(options.json?.training_on))}`,
      ),
      "Training lookup",
    );
    if (training.length !== 1) throw new Error("Expected one owned training");
    return run.capture(
      "training_submissions",
      { training_id: readString(training[0], "id"), user_id: userId ?? "" },
      action,
    );
  }
  return action();
}

function requireUser(cookies: Map<string, string>): string {
  const userId = users.get(cookies);
  if (!userId) throw new Error("Unknown fixture account");
  return userId;
}

async function rawRequest(
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
    signal: AbortSignal.timeout(15_000),
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
    `/calendar?created=${trainingOn}`,
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
  const parsed = new URL(signedUrl);
  const run = currentRun();
  if (
    parsed.origin !== run.config.url ||
    parsed.username ||
    parsed.password ||
    !parsed.pathname.startsWith("/storage/v1/object/upload/sign/training-photos/")
  ) {
    throw new Error("Signed upload URL does not match local Supabase");
  }
  const path = decodeURIComponent(parsed.pathname.slice("/storage/v1/object/upload/sign/training-photos/".length));
  if (!run.ownsPath(path)) throw new Error("Unowned signed upload path");
  uploads.set(signedUrl, { run, path });
  return signedUrl;
}

export async function uploadTrainingPhoto(signedUrl: string): Promise<void> {
  const file = tinyPngFile();
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  let response: Response;
  try {
    const upload = uploads.get(signedUrl);
    if (upload?.run !== currentRun()) throw new Error("Unknown signed upload");
    response = await upload.run.upload(upload.path, () =>
      fetch(signedUrl, { method: "PUT", body, redirect: "manual", signal: AbortSignal.timeout(15_000) }),
    );
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
  const run = currentRun();
  if (!run.ownsUser(input.userId)) throw new Error("Readout requires a registered fixture account");
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

export async function insertTraining(input: {
  teamId: string;
  trainingOn: string;
  description: string;
}): Promise<string> {
  const id = randomUUID();
  const row = readInsertedRow(
    await currentRun().capture("trainings", { id }, () =>
      servicePost("trainings", {
        id,
        team_id: input.teamId,
        training_on: input.trainingOn,
        description: input.description,
      }),
    ),
    "Training insert",
  );
  if (readString(row, "id") !== id || readString(row, "team_id") !== input.teamId) {
    throw new Error("Training insert did not return the inserted row");
  }
  if (readString(row, "training_on") !== input.trainingOn || readString(row, "description") !== input.description) {
    throw new Error("Training insert did not return the inserted row");
  }
  return id;
}

export async function insertConfirmedSubmission(input: {
  trainingId: string;
  userId: string;
  storagePath: string;
  distanceKm: number;
  confirmedAt: string;
  submitterDisplayName: string;
}): Promise<void> {
  const row = readInsertedRow(
    await currentRun().capture("training_submissions", { training_id: input.trainingId, user_id: input.userId }, () =>
      servicePost("training_submissions", {
        training_id: input.trainingId,
        user_id: input.userId,
        storage_path: input.storagePath,
        distance_km: input.distanceKm,
        confirmed_at: input.confirmedAt,
        submitter_display_name: input.submitterDisplayName,
      }),
    ),
    "Training submission insert",
  );
  if (readString(row, "training_id") !== input.trainingId || readString(row, "user_id") !== input.userId) {
    throw new Error("Training submission insert did not return the inserted row");
  }
  if (readString(row, "storage_path") !== input.storagePath) {
    throw new Error("Training submission insert did not return the inserted row");
  }
  if (readString(row, "submitter_display_name") !== input.submitterDisplayName) {
    throw new Error("Training submission insert did not return the inserted row");
  }
  if (readString(row, "confirmed_at").trim() === "") {
    throw new Error("Training submission insert did not return the inserted row");
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
    await fetch(address, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
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
  await currentRun().capture("team_members", { user_id: requireUser(athlete.jar) }, () =>
    postForm(athlete.jar, "/api/team/join", { join_code: teamCode, display_name: displayName }, "/dashboard"),
  );
  return athlete;
}

async function signUp(email: string, displayName: string): Promise<SignedInUser> {
  const jar = new Map<string, string>();
  const { userId } = await currentRun().signup(email, PASSWORD, () =>
    postForm(jar, "/api/auth/signup", { email, password: PASSWORD }, "/auth/confirm-email"),
  );
  users.set(jar, userId);
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

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requireServiceConfig(): { url: string; serviceRole: string } {
  return testConfig(baseUrl());
}

async function serviceGet(pathAndQuery: string): Promise<unknown> {
  const { url, serviceRole } = requireServiceConfig();
  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
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

async function servicePost(table: string, row: Record<string, string | number | boolean | null>): Promise<unknown> {
  const { url, serviceRole } = requireServiceConfig();
  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/${table}`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify(row),
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
  return text === "" ? null : parseJson(text);
}

function readInsertedRow(body: unknown, label: string): unknown {
  const rows = readRows(body, label);
  if (rows.length !== 1) {
    throw new Error(`${label} did not return the inserted row`);
  }
  return rows[0];
}

async function serviceRpc(name: string, args: Record<string, string | number | boolean | null>): Promise<void> {
  const { url, serviceRole } = requireServiceConfig();
  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
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
