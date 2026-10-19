import { expect, test } from "vitest";
import {
  findTeamMemberByDisplayName,
  insertConfirmedSubmission,
  insertTraining,
  readTrainingSubmission,
  warsawToday,
  warsawYesterday,
  withTeamFixture,
  type TeamMember,
  type TrainingSubmissionRow,
} from "./support";
import type { TestResources } from "../scripts/test-resources.mjs";

const TEST_TIMEOUT_MS = 0; // Await the entire fixture callback and cleanup; each HTTP request has its own deadline.
const PAST_DATE = "Trening można dodać, zmienić albo usunąć tylko na dziś lub później.";
const ALREADY_THAT_DAY = "Tego dnia trening już jest.";
const PAST_DESCRIPTION = "Bieg wsteczny";
const TODAY_DESCRIPTION = "Bieg na dziś";

test(
  "creating a training on yesterday returns the date error and inserts no row",
  () =>
    withTeamFixture(async (team, run) => {
      const yesterday = warsawYesterday();
      const teamId = coachTeamId(run);
      const rejected = await run.capture("trainings", { team_id: teamId, training_on: yesterday }, () =>
        sendTraining(run.config.appUrl, team.coach.jar, "create", yesterday, PAST_DESCRIPTION),
      );
      expect(rejected.status).toBe(400);
      expect(await readJson(rejected)).toEqual({ error: PAST_DATE });
      expect(await run.rows("trainings", { team_id: teamId, training_on: yesterday })).toEqual([]);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "a second training on the same day returns the duplicate error and leaves one row",
  () =>
    withTeamFixture(async (team, run) => {
      const today = warsawToday();
      const teamId = coachTeamId(run);
      const created = await run.capture("trainings", { team_id: teamId, training_on: today }, () =>
        sendTraining(run.config.appUrl, team.coach.jar, "create", today, TODAY_DESCRIPTION),
      );
      expect(created.status).toBe(200);
      expect(await readJson(created)).toEqual({ trainingOn: today, description: TODAY_DESCRIPTION });
      const rejected = await run.capture("trainings", { team_id: teamId, training_on: today }, () =>
        sendTraining(run.config.appUrl, team.coach.jar, "create", today, "Drugi bieg"),
      );
      expect(rejected.status).toBe(400);
      expect(await readJson(rejected)).toEqual({ error: ALREADY_THAT_DAY });
      expect(await run.rows("trainings", { team_id: teamId, training_on: today })).toHaveLength(1);
    }),
  TEST_TIMEOUT_MS,
);

test(
  "deleting yesterday's training with a submission returns the date error and keeps the submission",
  () =>
    withTeamFixture(async (team, run) => {
      const yesterday = warsawYesterday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
      const trainingId = await insertTraining({
        teamId: confirming.teamId,
        trainingOn: yesterday,
        description: PAST_DESCRIPTION,
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

      const rejected = await sendTraining(run.config.appUrl, team.coach.jar, "delete", yesterday);
      expect(rejected.status).toBe(400);
      expect(await readJson(rejected)).toEqual({ error: PAST_DATE });

      const after = requireSubmission(await readTrainingSubmission(confirming.userId, yesterday), confirmingName);
      expect(after.distanceKm).toBe(1);
      expect(after.confirmedAt).toBe(before.confirmedAt);
      expect(after.trainingOn).toBe(yesterday);
      expect(await run.rows("trainings", { team_id: confirming.teamId, training_on: yesterday })).toHaveLength(1);
    }),
  TEST_TIMEOUT_MS,
);

function coachTeamId(run: TestResources): string {
  const coach = run.data.rows.team_members.find((member) => member.user_id === run.data.users[0].id);
  if (!coach) throw new Error("Missing fixture coach");
  return coach.team_id;
}

function sendTraining(
  appUrl: string,
  cookies: Map<string, string>,
  operation: "create" | "delete",
  trainingOn: string,
  description?: string,
): Promise<Response> {
  return fetch(`${appUrl}/api/trainings/${operation}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      Origin: appUrl,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    },
    body: new URLSearchParams({ training_on: trainingOn, ...(description === undefined ? {} : { description }) }),
  });
}

async function readJson(response: Response): Promise<unknown> {
  return JSON.parse(await response.text()) as unknown;
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
