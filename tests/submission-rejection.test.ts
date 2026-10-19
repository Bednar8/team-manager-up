import { expect, test } from "vitest";
import {
  beginTrainingPhoto,
  createTraining,
  findTeamMemberByDisplayName,
  readTrainingSubmission,
  request,
  warsawToday,
  withTeamFixture,
  type TeamMember,
  type TrainingSubmissionRow,
} from "./support";

const TEST_TIMEOUT_MS = 0; // Await the entire fixture callback and cleanup; each HTTP request has its own deadline.
const NEEDS_KM = "Podaj liczbę kilometrów większą od zera.";
const NO_TRAINING = "Tego dnia nie ma treningu.";

test(
  "omitted, null, and zero kilometres leave today's begin row unconfirmed",
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
      await beginTrainingPhoto(confirmingUser.jar, today);

      const started = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
      expect(started.confirmedAt).toBeNull();
      expect(started.trainingOn).toBe(today);

      const rejectedKilometres: Record<string, string | number | boolean | null>[] = [
        { training_on: today, duration_seconds: null, max_speed_kmh: null },
        { training_on: today, distance_km: null, duration_seconds: null, max_speed_kmh: null },
        { training_on: today, distance_km: 0, duration_seconds: null, max_speed_kmh: null },
      ];
      for (const json of rejectedKilometres) {
        const rejected = await request(confirmingUser.jar, "/api/trainings/photo/confirm", {
          method: "POST",
          json,
        });
        expect(rejected.status).toBe(400);
        expect(JSON.parse(rejected.body) as unknown).toEqual({ error: NEEDS_KM });
        const row = requireSubmission(await readTrainingSubmission(confirming.userId, today), confirmingName);
        expect(row.confirmedAt).toBeNull();
        expect(row.trainingOn).toBe(today);
      }
    }),
  TEST_TIMEOUT_MS,
);

test(
  "confirm without today's training returns the missing-training error and inserts nothing",
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

      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const rejected = await request(confirmingUser.jar, "/api/trainings/photo/confirm", {
        method: "POST",
        json: {
          training_on: today,
          distance_km: 5,
          duration_seconds: null,
          max_speed_kmh: null,
        },
      });
      expect(rejected.status).toBe(400);
      expect(JSON.parse(rejected.body) as unknown).toEqual({ error: NO_TRAINING });
      expect(await readTrainingSubmission(confirming.userId, today)).toBeNull();
    }),
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
