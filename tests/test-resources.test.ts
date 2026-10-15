import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localOrigin, TestResources, withTestResources } from "../scripts/test-resources.mjs";

const config = { appUrl: "http://localhost:4321", url: "http://127.0.0.1:54321", serviceRole: "fake-test-key" };
type Row = Record<string, string>;

class FakeService {
  rows: Partial<Record<string, Row[]>> = {};
  users = new Map<string, string>();
  objects = new Set<string>();
  deletes: string[] = [];
  failDelete = "";
  badProof = false;
  fetcher = vi.fn(async (input: string, options?: RequestInit): Promise<Response> => {
    await Promise.resolve();
    const url = new URL(input);
    const method = options?.method ?? "GET";
    if (url.pathname === "/api/test-environment") {
      if (typeof options?.body !== "string") throw new Error("Expected JSON request body");
      const body = JSON.parse(options.body) as { challenge: string };
      const proof = createHmac("sha256", config.serviceRole)
        .update(`local-test-environment:${config.url}:${body.challenge}`)
        .digest("hex");
      return Response.json({ proof: this.badProof ? "wrong-instance" : proof });
    }
    if (method === "DELETE") {
      this.deletes.push(url.pathname);
      if (url.pathname === this.failDelete) return new Response(null, { status: 503 });
    }
    if (url.pathname === "/auth/v1/token") {
      if (typeof options?.body !== "string") throw new Error("Expected JSON request body");
      const body = JSON.parse(options.body) as { email: string };
      const id = [...this.users].find(([, email]) => email === body.email)?.[0];
      return Response.json({ user: { id, email: body.email } });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      const id = url.pathname.split("/").at(-1) ?? "";
      const email = this.users.get(id);
      if (!email) return new Response(null, { status: 404 });
      if (method === "DELETE") this.users.delete(id);
      return Response.json({ id, email });
    }
    if (url.pathname.startsWith("/storage/")) {
      if (typeof options?.body !== "string") throw new Error("Expected JSON request body");
      const body = JSON.parse(options.body) as { prefixes: string[] };
      for (const path of body.prefixes) this.objects.delete(path);
      return Response.json([]);
    }
    const table = url.pathname.split("/").at(-1) ?? "";
    const matches = (row: Row) =>
      [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || row[key] === value.slice(3));
    const rows = this.rows[table] ?? [];
    if (method === "DELETE") {
      this.rows[table] = rows.filter((row) => !matches(row));
      return new Response(null, { status: 204 });
    }
    return Response.json(rows.filter(matches));
  });
}

const directories: string[] = [];
function setup(service = new FakeService(), directory = mkdtempSync(join(tmpdir(), "resource-test-"))) {
  directories.push(directory);
  return { service, directory, run: new TestResources(config, { directory, fetcher: service.fetcher }) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function resources(run: TestResources, service: FakeService) {
  const userId = randomUUID();
  const email = `coach-${run.data.runId}@example.com`;
  await run.signup(email, "test-password", () => {
    service.users.set(userId, email);
    return Promise.resolve();
  });
  const teamId = randomUUID();
  await run.createTeam(userId, () => {
    service.rows.teams = [...(service.rows.teams ?? []), { id: teamId, created_by: userId }];
    service.rows.team_members = [
      ...(service.rows.team_members ?? []),
      { id: randomUUID(), team_id: teamId, user_id: userId },
    ];
    service.rows.team_join_codes = [...(service.rows.team_join_codes ?? []), { team_id: teamId, code: "TEST" }];
    return Promise.resolve();
  });
  const trainingId = randomUUID();
  await run.capture("trainings", { id: trainingId }, () => {
    service.rows.trainings = [...(service.rows.trainings ?? []), { id: trainingId, team_id: teamId }];
    return Promise.resolve();
  });
  const path = `${teamId}/${trainingId}/${userId}`;
  await run.upload(path, () => {
    service.objects.add(path);
    return Promise.resolve();
  });
  return { userId, teamId, trainingId, path };
}

describe("local test resource safety", () => {
  it.each(["http://localhost:4321", "https://127.0.0.1:54321", "http://[::1]:4321"])(
    "accepts literal local origin %s",
    (url) => {
      expect(localOrigin(url)).toBe(url);
    },
  );
  it.each([
    "https://example.com",
    "http://localhost.example.com",
    "http://localhost@evil.com",
    "http://user@localhost",
    "http://localhost/path",
    "http://localhost?host=local",
    "file:///localhost",
    "http://2130706433",
    "http://127.1",
    "http://0x7f000001",
  ])("refuses unsafe origin %s", (url) => {
    expect(() => localOrigin(url)).toThrow();
  });

  it("cleans only registered resources, retaining independent existing data", async () => {
    const { run, service } = setup();
    const existing = { id: randomUUID(), created_by: randomUUID() };
    service.rows.teams = [existing];
    await run.start();
    await resources(run, service);
    await run.cleanup();
    expect(service.rows.teams).toEqual([existing]);
    expect(service.users.size).toBe(0);
    expect(service.objects.size).toBe(0);
    expect(run.data.status).toBe("cleaned");
    expect(existsSync(`${run.file}.lock`)).toBe(false);
  });

  it("rejects an app connected to another environment before signup or resource mutations", async () => {
    const { run, service } = setup();
    service.badProof = true;
    const action = vi.fn();
    await expect(run.start().then(action)).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
    expect(service.users.size).toBe(0);
    expect(service.rows).toEqual({});
    expect(service.deletes).toEqual([]);
    await run.cleanup();
  });

  it.each(["capture", "upload"])("retains ambiguous %s outcomes and refuses deletion", async (operation) => {
    const { run, service } = setup();
    await run.start();
    const owned = await resources(run, service);
    const failure =
      operation === "capture" ? new TypeError("connection lost") : new DOMException("timed out", "TimeoutError");
    const attempt =
      operation === "capture"
        ? run.capture("trainings", { id: randomUUID() }, () => Promise.reject(failure))
        : run.upload(owned.path, () => Promise.reject(failure));
    await expect(attempt).rejects.toBe(failure);
    expect(run.data.pending).not.toBeNull();
    await expect(run.cleanup()).rejects.toThrow();
    expect(service.deletes).toEqual([]);
    expect(existsSync(run.file)).toBe(true);
    expect(service.users.has(owned.userId)).toBe(true);
  });

  it("refuses deletion when a registered training has been moved to an unknown parent", async () => {
    const { run, service } = setup();
    await run.start();
    const { trainingId } = await resources(run, service);
    service.rows.trainings = [{ id: trainingId, team_id: randomUUID() }];
    await expect(run.cleanup()).rejects.toThrow();
    expect(service.deletes).toEqual([]);
    expect(service.users.size).toBe(1);
  });

  it.each(["corrupt", "environment"])("refuses %s registry before network activity", async (kind) => {
    const { run, service, directory } = setup();
    await run.start();
    run.release();
    if (kind === "corrupt") writeFileSync(run.file, "{broken");
    else {
      run.data.url = "http://localhost:9999";
      run.save();
    }
    service.fetcher.mockClear();
    const resumed = new TestResources(config, { directory, fetcher: service.fetcher });
    await expect(resumed.resume(run.data.runId)).rejects.toThrow();
    expect(service.fetcher).not.toHaveBeenCalled();
  });

  it("rejects unproven ownership and leaves an unresolved creation for inspection", async () => {
    const { run, service } = setup();
    await run.start();
    const id = randomUUID();
    await expect(
      run.capture("teams", { id }, () => {
        service.rows.teams = [{ id, created_by: randomUUID() }];
        return Promise.resolve();
      }),
    ).rejects.toThrow();
    await expect(run.cleanup()).rejects.toThrow();
    expect(service.deletes).toEqual([]);
    expect(run.data.pending).not.toBeNull();
  });

  it("refuses all deletion when an unknown dependent would be cascaded", async () => {
    const { run, service } = setup();
    await run.start();
    const { teamId } = await resources(run, service);
    service.rows.team_members = [
      ...(service.rows.team_members ?? []),
      { id: randomUUID(), team_id: teamId, user_id: randomUUID() },
    ];
    await expect(run.cleanup()).rejects.toThrow();
    expect(service.deletes).toEqual([]);
    expect(service.users.size).toBe(1);
    expect(service.objects.size).toBe(1);
  });

  it.each(["/storage/v1/object/training-photos", "auth"])(
    "keeps the registry and retries after %s deletion failure",
    async (failure) => {
      const { run, service, directory } = setup();
      await run.start();
      const { userId } = await resources(run, service);
      service.failDelete = failure === "auth" ? `/auth/v1/admin/users/${userId}` : failure;
      await expect(run.cleanup()).rejects.toThrow();
      expect(existsSync(run.file)).toBe(true);
      expect(JSON.parse(readFileSync(run.file, "utf8"))).toMatchObject({ status: "failed" });
      expect(service.users.has(userId)).toBe(true);
      service.failDelete = "";
      const resumed = new TestResources(config, { directory, fetcher: service.fetcher });
      await resumed.resume(run.data.runId);
      await resumed.cleanup();
      expect(service.users.size).toBe(0);
      expect(resumed.data.status).toBe("cleaned");
    },
  );

  it("refuses concurrent cleanup but recovers a dead process lock", async () => {
    const { run, service, directory } = setup();
    await run.start();
    const resumed = new TestResources(config, { directory, fetcher: service.fetcher });
    await expect(resumed.resume(run.data.runId)).rejects.toThrow();
    run.release();
    writeFileSync(`${run.file}.lock`, "2147483647");
    await resumed.resume(run.data.runId);
    await resumed.cleanup();
    expect(resumed.data.status).toBe("cleaned");
  });

  it("keeps independent runs isolated", async () => {
    const { run, service, directory } = setup();
    await run.start();
    const first = await resources(run, service);
    const second = new TestResources(config, { directory, fetcher: service.fetcher });
    await second.start();
    const other = await resources(second, service);
    await run.cleanup();
    expect(service.users.has(first.userId)).toBe(false);
    expect(service.users.has(other.userId)).toBe(true);
    expect(service.objects.has(other.path)).toBe(true);
    await second.cleanup();
  });

  it("cleans owned resources even when the test action fails", async () => {
    const { service, directory } = setup();
    const failure = new Error("test action failed");
    await expect(
      withTestResources(
        config,
        async (run) => {
          await resources(run, service);
          throw failure;
        },
        { directory, fetcher: service.fetcher },
      ),
    ).rejects.toBe(failure);
    expect(service.users.size).toBe(0);
    expect(service.objects.size).toBe(0);
    expect(service.rows.teams).toEqual([]);
  });
});
