import { expect, test } from "vitest";
import { withTeamFixture, request, warsawToday } from "./support";

test(
  "coach creates, updates and deletes training through JSON responses, preserving failures",
  () =>
    withTeamFixture(async (team, run) => {
      const day = warsawToday();
      const coach = run.data.rows.team_members.find((member) => member.user_id === run.data.users[0].id);
      if (!coach) throw new Error("Missing fixture coach");
      const send = (operation: string, description?: string) =>
        fetch(`${run.config.appUrl}/api/trainings/${operation}`, {
          method: "POST",
          redirect: "manual",
          headers: {
            Accept: "application/json",
            Origin: run.config.appUrl,
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: [...team.coach.jar].map(([key, value]) => `${key}=${value}`).join("; "),
          },
          body: new URLSearchParams({ training_on: day, ...(description === undefined ? {} : { description }) }),
        });
      const created = await run.capture("trainings", { team_id: coach.team_id, training_on: day }, () =>
        send("create", "Async training"),
      );
      expect(created.status).toBe(200);
      expect(created.headers.get("location")).toBeNull();
      expect(await created.json()).toEqual({ trainingOn: day, description: "Async training" });
      const updated = await send("update", "Updated async training");
      expect(updated.status).toBe(200);
      expect(await updated.json()).toEqual({ trainingOn: day, description: "Updated async training" });
      const rejected = await send("update", "");
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toHaveProperty("error");
      const calendar = await request(team.coach.jar, `/calendar?date=${day}`);
      expect(calendar.status).toBe(200);
      expect(calendar.body).toContain("Updated async training");
      const deleted = await send("delete");
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ trainingOn: day, description: null });
      expect(await run.rows("trainings", { team_id: coach.team_id })).toEqual([]);
    }),
  0,
);
