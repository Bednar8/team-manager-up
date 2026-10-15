import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { TestResources, testConfig, withTestResources } from "../scripts/test-resources.mjs";
import {
  withTeamFixture,
  createTraining,
  beginTrainingPhoto,
  uploadTrainingPhoto,
  confirmTrainingPhoto,
  findTeamMemberByDisplayName,
  request,
  warsawToday,
} from "./support";

const config = () => testConfig(process.env.TEST_APP_URL);

async function assertRemoved(run: TestResources) {
  expect(run.data.status).toBe("cleaned");
  for (const [table, rows] of Object.entries(run.data.rows)) {
    for (const row of rows) {
      const column = table === "team_join_codes" ? "team_id" : "id";
      expect(await run.rows(table, { [column]: row[column] })).toEqual([]);
    }
  }
  for (const user of run.data.users) {
    expect(await run.api(`/auth/v1/admin/users/${user.id}`, { missing: true })).toBeNull();
  }
}

async function photoBytes(path: string) {
  const c = config();
  const response = await fetch(`${c.url}/storage/v1/object/authenticated/training-photos/${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { apikey: c.serviceRole, Authorization: `Bearer ${c.serviceRole}` },
  });
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

test("existing account, records, session and photo survive success, failure and partial setup", async () => {
  await withTeamFixture(async (control, owner) => {
    const today = warsawToday();
    await createTraining(control.coach.jar, today, "Control data must survive");
    await uploadTrainingPhoto(await beginTrainingPhoto(control.athletes[0].jar, today));
    await confirmTrainingPhoto(control.athletes[0].jar, {
      trainingOn: today,
      distanceKm: 4,
      durationSeconds: null,
      maxSpeedKmh: null,
    });
    const member = await findTeamMemberByDisplayName(control.coach.displayName);
    expect(member).not.toBeNull();
    if (!member) throw new Error("Missing control team");
    const training = owner.data.rows.trainings[0];
    const submission = owner.data.rows.training_submissions[0];
    const before = await owner.api(`/rest/v1/teams?select=*&id=eq.${member.teamId}`);
    const trainingBefore = await owner.api(`/rest/v1/trainings?select=*&id=eq.${training.id}`);
    const submissionBefore = await owner.api(`/rest/v1/training_submissions?select=*&id=eq.${submission.id}`);
    const photoBefore = await photoBytes(submission.storage_path);

    for (const scenario of ["success", "failure", "partial"]) {
      let subject: TestResources | undefined;
      if (scenario === "partial") {
        await expect(
          withTestResources(config(), async (run) => {
            subject = run;
            const email = `partial-${run.data.runId}@example.com`;
            const password = "Partial-Test-Passw0rd!";
            await run.signup(email, password, async () => {
              const response = await fetch(`${config().appUrl}/api/auth/signup`, {
                method: "POST",
                redirect: "manual",
                signal: AbortSignal.timeout(15_000),
                headers: { Origin: config().appUrl, "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ email, password }),
              });
              expect(response.status).toBe(302);
              throw new Error("partial setup failure after signup");
            });
          }),
        ).rejects.toThrow("partial setup failure");
      } else {
        const execute = withTeamFixture(async (team, run) => {
          subject = run;
          await createTraining(team.coach.jar, today, "Disposable training");
          await uploadTrainingPhoto(await beginTrainingPhoto(team.athletes[0].jar, today));
          if (scenario === "failure") throw new Error("deliberate assertion failure");
        });
        if (scenario === "failure") await expect(execute).rejects.toThrow("deliberate assertion failure");
        else await execute;
      }
      if (!subject) throw new Error("Missing subject run");
      await assertRemoved(subject);
      for (const path of subject.data.objects) {
        const c = config();
        const response = await fetch(`${c.url}/storage/v1/object/authenticated/training-photos/${path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
          headers: { apikey: c.serviceRole, Authorization: `Bearer ${c.serviceRole}` },
        });
        expect(response.ok).toBe(false);
      }
      expect(await owner.api(`/rest/v1/teams?select=*&id=eq.${member.teamId}`)).toEqual(before);
      expect(await owner.api(`/rest/v1/trainings?select=*&id=eq.${training.id}`)).toEqual(trainingBefore);
      expect(await owner.api(`/rest/v1/training_submissions?select=*&id=eq.${submission.id}`)).toEqual(
        submissionBefore,
      );
      expect(await photoBytes(submission.storage_path)).toEqual(photoBefore);
      expect((await request(control.coach.jar, "/dashboard")).status).toBe(200);
      const login = await request(new Map(), "/api/auth/signin", {
        method: "POST",
        form: { email: control.coach.email, password: "Harness-Test-Passw0rd!" },
      });
      expect(login.status).toBe(302);
      expect(login.location).toBe("/");
    }
  });
}, 0);

test("cleanup command recovers a killed process and can be repeated", async () => {
  const modulePath = new URL("../scripts/test-resources.mjs", import.meta.url).href;
  const code = `
    import {TestResources, testConfig} from ${JSON.stringify(modulePath)};
    const c=testConfig(process.env.TEST_APP_URL);
    const run=await new TestResources(c).start();
    const email='interrupted-'+run.data.runId+'@example.com';
    const password='Interrupted-Test-Passw0rd!';
    await run.signup(email,password,async()=>{
      const r=await fetch(c.appUrl+'/api/auth/signup',{method:'POST',redirect:'manual',
        headers:{Origin:c.appUrl,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({email,password})});
      if(r.status!==302) throw new Error('signup failed');
    });
    process.send({runId:run.data.runId});
    setInterval(()=>{},1000);
  `;
  const child = fork("-", [], { execArgv: ["--input-type=module"], stdio: ["pipe", "pipe", "pipe", "ipc"] });
  let runId: string | undefined;
  try {
    const ready = new Promise<string>((accept, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Recovery worker timed out"));
      }, 30_000);
      child.once("message", (message: unknown) => {
        clearTimeout(timer);
        if (typeof message === "object" && message && "runId" in message && typeof message.runId === "string")
          accept(message.runId);
        else reject(new Error("Invalid recovery worker response"));
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Recovery worker exited before ready"));
      });
    });
    child.stdin?.end(code);
    runId = await ready;
    child.kill("SIGKILL");
    await once(child, "exit");
    for (let attempt = 0; attempt < 2; attempt++) {
      const cleanup = spawn(process.execPath, ["scripts/test-cleanup.mjs", runId], { stdio: "pipe" });
      const outcome: unknown[] = await once(cleanup, "exit");
      expect(outcome[0]).toBe(0);
    }
    const saved: unknown = JSON.parse(readFileSync(resolve(".test-runs", `${runId}.json`), "utf8"));
    expect(saved).toMatchObject({ status: "cleaned" });
    const resumed = await new TestResources(config()).resume(runId);
    try {
      await assertRemoved(resumed);
    } finally {
      resumed.release();
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    if (runId) {
      const run = await new TestResources(config()).resume(runId);
      await run.cleanup();
    }
  }
}, 0);
