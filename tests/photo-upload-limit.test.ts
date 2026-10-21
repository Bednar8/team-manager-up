import { expect, test } from "vitest";
import type { TestResources } from "../scripts/test-resources.mjs";
import {
  beginTrainingPhoto,
  confirmTrainingPhoto,
  createTraining,
  findTeamMemberByDisplayName,
  insertTraining,
  readTrainingSubmission,
  request,
  uploadTrainingPhoto,
  warsawToday,
  warsawYesterday,
  withTeamFixture,
  type HttpResponse,
  type TeamMember,
  type TrainingSubmissionRow,
} from "./support";

const TEST_TIMEOUT_MS = 0; // Await the entire fixture callback and cleanup; each HTTP request has its own deadline.
const LIMIT = "Dziś można wgrać najwyżej dwa zdjęcia.";
const WRONG_DAY = "Zdjęcie można wgrać tylko w dniu treningu.";

test(
  "begin at two readouts keeps the confirmed submission",
  () =>
    withTeamFixture(async (team, run) => {
      const today = warsawToday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");
      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const upload = await beginTrainingPhoto(confirmingUser.jar, today);
      await uploadTrainingPhoto(upload);
      await confirmTrainingPhoto(confirmingUser.jar, {
        trainingOn: today,
        distanceKm: 5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const before = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(before.distanceKm).toBe(5);
      expect(before.confirmedAt).not.toBeNull();
      expect(before.confirmedAt).not.toBe("");
      expect(before.trainingOn).toBe(today);

      await seedPhotoReadoutUses(run, confirming.userId, today);
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      const begun = await request(confirmingUser.jar, "/api/trainings/photo/begin", {
        method: "POST",
        json: { training_on: today },
      });
      expectError(begun, LIMIT);

      const after = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(after).toEqual(before);
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "readout at two readouts with an object returns the limit instead of a model failure",
  () =>
    withTeamFixture(async (team, run) => {
      const today = warsawToday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");
      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const upload = await beginTrainingPhoto(confirmingUser.jar, today);
      await uploadTrainingPhoto(upload);

      const started = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(started.confirmedAt).toBeNull();
      expect(started.trainingOn).toBe(today);

      await seedPhotoReadoutUses(run, confirming.userId, today);
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      const readout = await request(confirmingUser.jar, "/api/trainings/photo/readout", {
        method: "POST",
        json: { training_on: today },
      });
      expectError(readout, LIMIT);
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);
      const after = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(after.confirmedAt).toBeNull();
      expect(after.trainingOn).toBe(today);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "yesterday's readout with no object returns the training-day sentence",
  () =>
    withTeamFixture(async (team, run) => {
      const yesterday = warsawYesterday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      await insertTraining({
        teamId: confirming.teamId,
        trainingOn: yesterday,
        description: "Bieg wsteczny",
      });
      expect(await readTrainingSubmission(confirming.userId, yesterday)).toBeNull();

      const readout = await request(confirmingUser.jar, "/api/trainings/photo/readout", {
        method: "POST",
        json: { training_on: yesterday },
      });
      expectError(readout, WRONG_DAY);
      expect(await readTrainingSubmission(confirming.userId, yesterday)).toBeNull();
      expect(await readPhotoReadoutCount(run, confirming.userId, yesterday)).toBeNull();
      expect(await readPhotoReadoutCount(run, confirming.userId, warsawToday())).toBeNull();
    }),
  TEST_TIMEOUT_MS,
);

test(
  "deleting the photo leaves two readouts and the next begin returns the limit",
  () =>
    withTeamFixture(async (team, run) => {
      const today = warsawToday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");
      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const upload = await beginTrainingPhoto(confirmingUser.jar, today);
      await uploadTrainingPhoto(upload);
      await confirmTrainingPhoto(confirmingUser.jar, {
        trainingOn: today,
        distanceKm: 5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });
      await seedPhotoReadoutUses(run, confirming.userId, today);
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      const removed = await request(confirmingUser.jar, "/api/trainings/photo/delete", {
        method: "POST",
        json: { training_on: today },
      });
      expect(removed.status).toBe(200);
      expect(await readTrainingSubmission(confirming.userId, today)).toBeNull();
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      const begun = await request(confirmingUser.jar, "/api/trainings/photo/begin", {
        method: "POST",
        json: { training_on: today },
      });
      expectError(begun, LIMIT);
      expect(await readTrainingSubmission(confirming.userId, today)).toBeNull();
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "deleting and recreating today's training leaves two readouts and the next begin returns the limit",
  () =>
    withTeamFixture(async (team, run) => {
      const today = warsawToday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");
      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      await beginTrainingPhoto(confirmingUser.jar, today);
      const started = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(started.trainingOn).toBe(today);

      await seedPhotoReadoutUses(run, confirming.userId, today);
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      const deleted = await request(team.coach.jar, "/api/trainings/delete", {
        method: "POST",
        form: { training_on: today },
      });
      expect(deleted.status).toBe(302);
      expect(decodeURIComponent(deleted.location)).toContain(`/calendar?deleted=${today}`);
      expect(await readTrainingSubmission(confirming.userId, today)).toBeNull();
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      await createTraining(team.coach.jar, today, "Bieg na dziś");
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);

      const begun = await request(confirmingUser.jar, "/api/trainings/photo/begin", {
        method: "POST",
        json: { training_on: today },
      });
      expectError(begun, LIMIT);
      expect(await readTrainingSubmission(confirming.userId, today)).toBeNull();
      expect(await readPhotoReadoutCount(run, confirming.userId, today)).toBe(2);
    }),
  TEST_TIMEOUT_MS,
);

function expectError(response: HttpResponse, error: string): void {
  expect(response.status).toBe(400);
  expect(JSON.parse(response.body) as unknown).toEqual({ error });
}

async function seedPhotoReadoutUses(run: TestResources, userId: string, usedOn: string): Promise<void> {
  await run.api("/rest/v1/photo_readout_uses", {
    method: "POST",
    body: { user_id: userId, used_on: usedOn, used_count: 2 },
  });
}

async function readPhotoReadoutCount(run: TestResources, userId: string, usedOn: string): Promise<number | null> {
  const query = [
    "photo_readout_uses?select=used_count",
    `user_id=eq.${encodeURIComponent(userId)}`,
    `used_on=eq.${encodeURIComponent(usedOn)}`,
  ].join("&");
  const rows = readRows(await run.api(`/rest/v1/${query}`));
  if (rows.length === 0) {
    return null;
  }
  if (rows.length > 1) {
    throw new Error("More than one photo readout row matches that athlete and day");
  }
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Photo readout lookup did not return rows");
  }
  return readUsedCount(row);
}

function readRows(body: unknown): readonly unknown[] {
  if (!isUnknownArray(body)) {
    throw new Error("Photo readout lookup did not return rows");
  }
  return body;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readUsedCount(row: unknown): number {
  if (typeof row !== "object" || row === null || !Object.hasOwn(row, "used_count")) {
    throw new Error("Could not read used_count");
  }
  const value: unknown = Object.getOwnPropertyDescriptor(row, "used_count")?.value;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Could not read used_count");
  }
  return value;
}

function requireMember(member: TeamMember | null, displayName: string): TeamMember {
  if (member === null) {
    throw new Error(`No team_members row for ${displayName}`);
  }
  return member;
}

function requireSubmission(row: TrainingSubmissionRow | null, displayName: string): TrainingSubmissionRow {
  if (row === null) {
    throw new Error(`No training submission for ${displayName}`);
  }
  return row;
}
