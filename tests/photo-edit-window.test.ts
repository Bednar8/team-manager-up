import { expect, test } from "vitest";
import {
  beginTrainingPhoto,
  confirmTrainingPhoto,
  createTraining,
  findTeamMemberByDisplayName,
  insertConfirmedSubmission,
  insertTraining,
  listItemContaining,
  readTrainingSubmission,
  recordTrainingReadout,
  request,
  uploadTrainingPhoto,
  warsawToday,
  warsawYesterday,
  withTeamFixture,
  type TeamMember,
  type TrainingSubmissionRow,
} from "./support";

const TEST_TIMEOUT_MS = 0; // Await the entire fixture callback and cleanup; each HTTP request has its own deadline.
const WRONG_DAY = "Zdjęcie można wgrać tylko w dniu treningu.";
const ATHLETE_ONLY = "Tylko zawodnik może dodać zdjęcie treningu.";
const NO_PHOTO = "Tego dnia nie ma zdjęcia.";

test(
  "a second begin on the training day clears 6.5 and confirming 4 replaces it in the ranking",
  () =>
    withTeamFixture(async (team) => {
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
        distanceKm: 6.5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const confirmed = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(confirmed.distanceKm).toBe(6.5);
      expect(confirmed.confirmedAt).not.toBeNull();
      expect(confirmed.confirmedAt).not.toBe("");
      expect(confirmed.trainingOn).toBe(today);

      const replaced = await beginTrainingPhoto(confirmingUser.jar, today);
      const cleared = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(cleared.confirmedAt).toBeNull();
      expect(cleared.distanceKm).toBeNull();
      expect(cleared.trainingOn).toBe(today);

      const clearedRanking = await request(team.coach.jar, "/ranking");
      expect(clearedRanking.status).toBe(200);
      expect(listItemContaining(clearedRanking.body, confirmingName)).toMatch(paragraphPattern("0 km"));

      await uploadTrainingPhoto(replaced);
      await recordTrainingReadout({
        userId: confirming.userId,
        trainingOn: today,
        distanceKm: 4,
        durationSeconds: null,
        maxSpeedKmh: null,
      });
      await confirmTrainingPhoto(confirmingUser.jar, {
        trainingOn: today,
        distanceKm: 4,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const ranking = await request(team.coach.jar, "/ranking");
      expect(ranking.status).toBe(200);
      const confirmingItem = listItemContaining(ranking.body, confirmingName);
      expect(confirmingItem).toMatch(paragraphPattern("4 km"));
      expect(confirmingItem).not.toContain("6,5");
      expect(ranking.body).not.toContain("6,5");
      expect(ranking.body).not.toContain("6.5");
    }),
  TEST_TIMEOUT_MS,
);

test(
  "deleting today's confirmed photo shows 0 km and Nie oddał, then begin signs a new upload",
  () =>
    withTeamFixture(async (team) => {
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

      const removed = await request(confirmingUser.jar, "/api/trainings/photo/delete", {
        method: "POST",
        json: { training_on: today },
      });
      expect(removed.status).toBe(200);
      expect(await readTrainingSubmission(confirming.userId, today)).toBeNull();

      const ranking = await request(team.coach.jar, "/ranking");
      expect(ranking.status).toBe(200);
      expect(listItemContaining(ranking.body, confirmingName)).toMatch(paragraphPattern("0 km"));

      const calendar = await request(team.coach.jar, `/calendar?date=${today}`);
      expect(calendar.status).toBe(200);
      const confirmingItem = listItemContaining(calendar.body, confirmingName);
      expect(confirmingItem).toContain("Nie oddał");
      expect(confirmingItem).not.toContain("Oddał");

      const again = await beginTrainingPhoto(confirmingUser.jar, today);
      expect(again).toContain("/storage/v1/object/upload/sign/training-photos/");
    }),
  TEST_TIMEOUT_MS,
);

test(
  "a training tomorrow still lets a second begin today return a signed upload",
  () =>
    withTeamFixture(async (team) => {
      const today = warsawToday();
      const tomorrow = nextCivilDate(today);
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");
      await createTraining(team.coach.jar, tomorrow, "Bieg na jutro");
      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);

      const upload = await beginTrainingPhoto(confirmingUser.jar, today);
      await uploadTrainingPhoto(upload);
      await confirmTrainingPhoto(confirmingUser.jar, {
        trainingOn: today,
        distanceKm: 5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const replaced = await beginTrainingPhoto(confirmingUser.jar, today);
      expect(replaced).toContain("/storage/v1/object/upload/sign/training-photos/");
      const cleared = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(cleared.confirmedAt).toBeNull();
      expect(cleared.distanceKm).toBeNull();
      expect(cleared.trainingOn).toBe(today);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "yesterday's begin and delete keep the confirmed submission",
  () =>
    withTeamFixture(async (team) => {
      const yesterday = warsawYesterday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([
        confirmingName,
        `Wgrywa ${team.runId}`,
        `Milczy ${team.runId}`,
      ]);

      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const trainingId = await insertTraining({
        teamId: confirming.teamId,
        trainingOn: yesterday,
        description: "Bieg wsteczny",
      });
      await insertConfirmedSubmission({
        trainingId,
        userId: confirming.userId,
        storagePath: `${confirming.teamId}/${trainingId}/${confirming.userId}`,
        distanceKm: 1,
        confirmedAt: new Date().toISOString(),
        submitterDisplayName: confirmingName,
      });

      const before = requireSubmission(await readTrainingSubmission(confirming.userId, yesterday), confirmingName);
      expect(before.distanceKm).toBe(1);
      expect(before.confirmedAt).not.toBeNull();
      expect(before.confirmedAt).not.toBe("");
      expect(before.trainingOn).toBe(yesterday);

      const begun = await request(confirmingUser.jar, "/api/trainings/photo/begin", {
        method: "POST",
        json: { training_on: yesterday },
      });
      expect(begun.status).toBe(400);
      expect(JSON.parse(begun.body) as unknown).toEqual({ error: WRONG_DAY });

      const removed = await request(confirmingUser.jar, "/api/trainings/photo/delete", {
        method: "POST",
        json: { training_on: yesterday },
      });
      expect(removed.status).toBe(400);
      expect(JSON.parse(removed.body) as unknown).toEqual({ error: WRONG_DAY });

      const after = requireSubmission(await readTrainingSubmission(confirming.userId, yesterday), confirmingName);
      expect(after.distanceKm).toBe(before.distanceKm);
      expect(after.confirmedAt).toBe(before.confirmedAt);
      expect(after.trainingOn).toBe(yesterday);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "a coach and another athlete cannot delete the owner's photo",
  () =>
    withTeamFixture(async (team) => {
      const today = warsawToday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirmingUser = team.athletes[0];
      const otherUser = team.athletes[1];

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

      const coachRejected = await request(team.coach.jar, "/api/trainings/photo/delete", {
        method: "POST",
        json: { training_on: today },
      });
      expect(coachRejected.status).toBe(400);
      expect(JSON.parse(coachRejected.body) as unknown).toEqual({ error: ATHLETE_ONLY });

      const otherRejected = await request(otherUser.jar, "/api/trainings/photo/delete", {
        method: "POST",
        json: { training_on: today },
      });
      expect(otherRejected.status).toBe(400);
      expect(JSON.parse(otherRejected.body) as unknown).toEqual({ error: NO_PHOTO });

      const after = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(after.distanceKm).toBe(before.distanceKm);
      expect(after.confirmedAt).toBe(before.confirmedAt);
      expect(after.trainingOn).toBe(today);
    }),
  TEST_TIMEOUT_MS,
);

function paragraphPattern(text: "0 km" | "4 km"): RegExp {
  return new RegExp(`<p[^>]*>\\s*${text}\\s*</p>`, "u");
}

function nextCivilDate(civilDate: string): string {
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
  utc.setUTCDate(day + 1);
  const shiftedYear = utc.getUTCFullYear().toString().padStart(4, "0");
  const shiftedMonth = (utc.getUTCMonth() + 1).toString().padStart(2, "0");
  const shiftedDay = utc.getUTCDate().toString().padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
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
