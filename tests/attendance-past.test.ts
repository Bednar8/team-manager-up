import { expect, test } from "vitest";
import {
  withTeamFixture,
  findTeamMemberByDisplayName,
  insertConfirmedSubmission,
  insertTraining,
  listItemContaining,
  request,
  warsawYesterday,
  type TeamMember,
} from "./support";

const TEST_TIMEOUT_MS = 0; // Await the entire fixture callback and cleanup; each HTTP request has its own deadline.
const PAST_DESCRIPTION = "Bieg wsteczny";

test(
  "yesterday's coach list binds Oddał to the seeded athlete",
  () =>
    withTeamFixture(async (team) => {
      const yesterday = warsawYesterday();
      const confirmingName = `Potwierdza ${team.runId}`;
      const uploadingName = `Wgrywa ${team.runId}`;
      const silentName = `Milczy ${team.runId}`;

      expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([confirmingName, uploadingName, silentName]);

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

      const calendar = await request(team.coach.jar, `/calendar?date=${yesterday}`);
      expect(calendar.status).toBe(200);
      expect(calendar.body).toContain(PAST_DESCRIPTION);

      const confirmingItem = listItemContaining(calendar.body, confirmingName);
      expect(confirmingItem).toContain("Oddał");
      expect(confirmingItem).not.toContain("Nie oddał");

      const uploadingItem = listItemContaining(calendar.body, uploadingName);
      expect(uploadingItem).toContain("Nie oddał");
      expect(uploadingItem).not.toContain("Oddał");

      const silentItem = listItemContaining(calendar.body, silentName);
      expect(silentItem).toContain("Nie oddał");
      expect(silentItem).not.toContain("Oddał");
    }),
  TEST_TIMEOUT_MS,
);

function requireMember(member: TeamMember | null, displayName: string): TeamMember {
  if (member === null) {
    throw new Error(`No team_members row for ${displayName}`);
  }
  return member;
}
