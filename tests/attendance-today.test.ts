import { expect, test } from "vitest";
import {
  beginTrainingPhoto,
  confirmTrainingPhoto,
  createTeamFixture,
  createTraining,
  findTeamMemberByDisplayName,
  listItemContaining,
  readTrainingSubmission,
  recordTrainingReadout,
  request,
  uploadTrainingPhoto,
  warsawToday,
  type TeamMember,
  type TrainingSubmissionRow,
} from "./support";

const TEST_TIMEOUT_MS = 60_000;

test(
  "today's coach list binds Oddał to the confirming athlete and stores 7 km",
  async () => {
    const team = await createTeamFixture();
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

    const confirmingUpload = await beginTrainingPhoto(confirmingUser.jar, today);
    await uploadTrainingPhoto(confirmingUpload);
    await recordTrainingReadout({
      userId: confirming.userId,
      trainingOn: today,
      distanceKm: 6.5,
      durationSeconds: null,
      maxSpeedKmh: null,
    });
    await confirmTrainingPhoto(confirmingUser.jar, {
      trainingOn: today,
      distanceKm: 7,
      durationSeconds: null,
      maxSpeedKmh: null,
    });

    const uploadingUpload = await beginTrainingPhoto(uploadingUser.jar, today);
    await uploadTrainingPhoto(uploadingUpload);

    const calendar = await request(team.coach.jar, `/calendar?date=${today}`);
    expect(calendar.status).toBe(200);

    const confirmingItem = listItemContaining(calendar.body, confirmingName);
    expect(confirmingItem).toContain("Oddał");
    expect(confirmingItem).not.toContain("Nie oddał");

    const uploadingItem = listItemContaining(calendar.body, uploadingName);
    expect(uploadingItem).toContain("Nie oddał");
    expect(uploadingItem).not.toContain("Oddał");

    const silentItem = listItemContaining(calendar.body, silentName);
    expect(silentItem).toContain("Nie oddał");
    expect(silentItem).not.toContain("Oddał");

    const confirmingRow = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
    expect(confirmingRow.distanceKm).toBe(7);
    expect(confirmingRow.modelDistanceKm).toBe(6.5);
    expect(confirmingRow.athleteEdited).toBe(true);
    expect(confirmingRow.confirmedAt).not.toBeNull();
    expect(confirmingRow.confirmedAt).not.toBe("");
    expect(confirmingRow.trainingOn).toBe(today);

    const uploadingRow = requireSubmission(await readTrainingSubmission(uploading.userId, today), uploadingName);
    expect(uploadingRow.confirmedAt).toBeNull();
    expect(uploadingRow.trainingOn).toBe(today);
  },
  TEST_TIMEOUT_MS,
);

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
