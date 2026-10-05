import { expect, test } from "vitest";
import { createTeamFixture, findTeamMemberByDisplayName, request, type TeamMember } from "./support";

const TEST_TIMEOUT_MS = 30_000;

test(
  "coach and three athletes share a new team and the coach opens the calendar",
  async () => {
    const team = await createTeamFixture();
    const confirmingName = `Potwierdza ${team.runId}`;
    const uploadingName = `Wgrywa ${team.runId}`;
    const silentName = `Milczy ${team.runId}`;

    expect(team.coach.displayName).toBe(`Trener ${team.runId}`);
    expect(team.athletes.map((athlete) => athlete.displayName)).toEqual([confirmingName, uploadingName, silentName]);

    const coach = requireMember(await findTeamMemberByDisplayName(team.coach.displayName), team.coach.displayName);
    const confirming = requireMember(await findTeamMemberByDisplayName(confirmingName), confirmingName);
    const uploading = requireMember(await findTeamMemberByDisplayName(uploadingName), uploadingName);
    const silent = requireMember(await findTeamMemberByDisplayName(silentName), silentName);

    expect(coach).toMatchObject({ role: "coach", displayName: team.coach.displayName });
    expect([confirming, uploading, silent].map((member) => member.role)).toEqual(["athlete", "athlete", "athlete"]);
    expect([confirming, uploading, silent].map((member) => member.displayName)).toEqual([
      confirmingName,
      uploadingName,
      silentName,
    ]);
    expect(new Set([coach.teamId, confirming.teamId, uploading.teamId, silent.teamId]).size).toBe(1);

    const calendar = await request(team.coach.jar, "/calendar");
    expect(calendar.status).toBe(200);
    expect(calendar.body).toContain("Kalendarz");
  },
  TEST_TIMEOUT_MS,
);

function requireMember(member: TeamMember | null, displayName: string): TeamMember {
  if (member === null) {
    throw new Error(`No team_members row for ${displayName}`);
  }
  return member;
}
