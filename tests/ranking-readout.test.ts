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
  withTeamFixture,
  type TeamMember,
  type TrainingSubmissionRow,
} from "./support";

const TEST_TIMEOUT_MS = 0; // Await the entire fixture callback and cleanup; each HTTP request has its own deadline.

test(
  "today's ranking ties Potwierdza and Wgrywa at place 1 with 5 km",
  () =>
    withTeamFixture(async (team) => {
      const today = warsawToday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const uploadingName = `Wgrywa ${team.runId}`;
      const silentName = `Milczy ${team.runId}`;
      const confirmingUser = team.athletes[0];
      const uploadingUser = team.athletes[1];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([confirmingName, uploadingName, silentName]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");

      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const uploading = requireMember(await findTeamMemberByDisplayName(uploadingName), uploadingName);
      const silent = requireMember(await findTeamMemberByDisplayName(silentName), silentName);

      const confirmingUpload = await beginTrainingPhoto(confirmingUser.jar, today);
      await uploadTrainingPhoto(confirmingUpload);
      await confirmTrainingPhoto(confirmingUser.jar, {
        trainingOn: today,
        distanceKm: 5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const uploadingUpload = await beginTrainingPhoto(uploadingUser.jar, today);
      await uploadTrainingPhoto(uploadingUpload);
      await confirmTrainingPhoto(uploadingUser.jar, {
        trainingOn: today,
        distanceKm: 5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const confirmingRow = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(confirmingRow.distanceKm).toBe(5);
      expect(confirmingRow.confirmedAt).not.toBeNull();
      expect(confirmingRow.confirmedAt).not.toBe("");
      expect(confirmingRow.trainingOn).toBe(today);

      const uploadingRow = requireSubmission(await readTrainingSubmission(uploading.userId, today), uploadingName);
      expect(uploadingRow.distanceKm).toBe(5);
      expect(uploadingRow.confirmedAt).not.toBeNull();
      expect(uploadingRow.confirmedAt).not.toBe("");
      expect(uploadingRow.trainingOn).toBe(today);

      expect(await readTrainingSubmission(silent.userId, today)).toBeNull();

      const ranking = await request(team.coach.jar, "/ranking");
      expect(ranking.status).toBe(200);

      const confirmingItem = listItemContaining(ranking.body, confirmingName);
      const uploadingItem = listItemContaining(ranking.body, uploadingName);
      const silentItem = listItemContaining(ranking.body, silentName);

      expect(confirmingItem).toMatch(paragraphPattern("1"));
      expect(confirmingItem).toMatch(paragraphPattern("5 km"));
      expect(uploadingItem).toMatch(paragraphPattern("1"));
      expect(uploadingItem).toMatch(paragraphPattern("5 km"));
      expect(silentItem).toMatch(paragraphPattern("3"));
      expect(silentItem).toMatch(paragraphPattern("0 km"));
      expect(ranking.body).not.toMatch(paragraphPattern("2"));

      const confirmingAt = ranking.body.indexOf(confirmingItem);
      const uploadingAt = ranking.body.indexOf(uploadingItem);
      expect(confirmingAt).toBeGreaterThanOrEqual(0);
      expect(uploadingAt).toBeGreaterThan(confirmingAt);

      expect(() => listItemContaining(ranking.body, team.coach.displayName)).toThrow(
        `Calendar HTML has no list item for ${team.coach.displayName}`,
      );
    }),
  TEST_TIMEOUT_MS,
);

test(
  "ranking keeps 5 km when a future confirmation is 100 km and an unconfirmed readout is 6.5",
  () =>
    withTeamFixture(async (team) => {
      const today = warsawToday();
      const tomorrow = nextCivilDate(today);
      const confirmingName = `Potwierdza ${team.runId}`;
      const uploadingName = `Wgrywa ${team.runId}`;
      const silentName = `Milczy ${team.runId}`;
      const confirmingUser = team.athletes[0];
      const uploadingUser = team.athletes[1];

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([confirmingName, uploadingName, silentName]);

      await createTraining(team.coach.jar, today, "Bieg na dziś");

      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const uploading = requireMember(await findTeamMemberByDisplayName(uploadingName), uploadingName);

      const confirmingUpload = await beginTrainingPhoto(confirmingUser.jar, today);
      await uploadTrainingPhoto(confirmingUpload);
      await confirmTrainingPhoto(confirmingUser.jar, {
        trainingOn: today,
        distanceKm: 5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const futureTrainingId = await insertTraining({
        teamId: confirming.teamId,
        trainingOn: tomorrow,
        description: "Bieg przyszły",
      });
      await insertConfirmedSubmission({
        trainingId: futureTrainingId,
        userId: confirming.userId,
        storagePath: `${confirming.teamId}/${futureTrainingId}/${confirming.userId}`,
        distanceKm: 100,
        confirmedAt: new Date().toISOString(),
        submitterDisplayName: confirmingName,
      });

      const uploadingUpload = await beginTrainingPhoto(uploadingUser.jar, today);
      await uploadTrainingPhoto(uploadingUpload);
      await recordTrainingReadout({
        userId: uploading.userId,
        trainingOn: today,
        distanceKm: 6.5,
        durationSeconds: null,
        maxSpeedKmh: null,
      });

      const todayRow = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(todayRow.distanceKm).toBe(5);
      expect(todayRow.confirmedAt).not.toBeNull();
      expect(todayRow.confirmedAt).not.toBe("");
      expect(todayRow.trainingOn).toBe(today);

      const futureRow = requireSubmission(await readTrainingSubmission(confirming.userId, tomorrow), confirmingName);
      expect(futureRow.distanceKm).toBe(100);
      expect(futureRow.confirmedAt).not.toBeNull();
      expect(futureRow.confirmedAt).not.toBe("");
      expect(futureRow.trainingOn).toBe(tomorrow);

      const uploadingRow = requireSubmission(await readTrainingSubmission(uploading.userId, today), uploadingName);
      expect(uploadingRow.distanceKm).toBe(6.5);
      expect(uploadingRow.confirmedAt).toBeNull();
      expect(uploadingRow.trainingOn).toBe(today);

      const ranking = await request(team.coach.jar, "/ranking");
      expect(ranking.status).toBe(200);

      const confirmingItem = listItemContaining(ranking.body, confirmingName);
      const uploadingItem = listItemContaining(ranking.body, uploadingName);
      expect(confirmingItem).toMatch(paragraphPattern("5 km"));
      expect(uploadingItem).toMatch(paragraphPattern("0 km"));
      expect(uploadingItem).not.toContain("6,5");
    }),
  TEST_TIMEOUT_MS,
);

function paragraphPattern(text: "0 km" | "1" | "2" | "3" | "5 km"): RegExp {
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
