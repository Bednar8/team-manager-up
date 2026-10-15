// Shared by Node smoke and Vitest. Never import this privileged module into the app.
import { randomUUID, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL, URLSearchParams } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = {
  teams: ["id", "created_by"],
  team_members: ["id", "team_id", "user_id"],
  team_join_codes: ["team_id", "code"],
  trainings: ["id", "team_id"],
  training_submissions: ["id", "training_id", "user_id", "storage_path"],
};
const keyOf = (table, row) => (table === "team_join_codes" ? row.team_id : row.id);
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function localOrigin(value) {
  const literal =
    typeof value === "string" && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(value);
  requireThat(literal, "Tests require a literal local origin");
  const url = new URL(value);
  requireThat(
    /^https?:$/.test(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
    "Tests require a literal local origin (localhost, 127.0.0.1 or ::1)",
  );
  return url.origin;
}

export function testConfig(appUrl = "http://localhost:4321") {
  const env = { ...process.env };
  for (const file of [".env", ".dev.vars"]) {
    let text;
    try {
      text = readFileSync(resolve(ROOT, file), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?(SUPABASE_URL|SUPABASE_SERVICE_ROLE)\s*=\s*(.*?)\s*$/);
      if (match && !env[match[1]]?.trim()) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  requireThat(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return { appUrl: localOrigin(appUrl), url: localOrigin(env.SUPABASE_URL), serviceRole: env.SUPABASE_SERVICE_ROLE };
}

export class TestResources {
  constructor(config, { directory = resolve(ROOT, ".test-runs"), fetcher = fetch } = {}) {
    this.config = { ...config, appUrl: localOrigin(config.appUrl), url: localOrigin(config.url) };
    this.directory = directory;
    this.fetcher = fetcher;
    this.locked = false;
  }

  save() {
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporary, this.file);
  }

  lock(recover = false) {
    const file = `${this.file}.lock`;
    if (recover) {
      try {
        const pid = Number(readFileSync(file, "utf8"));
        requireThat(Number.isSafeInteger(pid) && pid > 0, "Invalid cleanup lock");
        let alive = true;
        try {
          process.kill(pid, 0);
        } catch (error) {
          if (error.code === "ESRCH") alive = false;
          else throw error;
        }
        requireThat(!alive, "Run is still active; refusing concurrent cleanup");
        unlinkSync(file);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const fd = openSync(file, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    this.locked = true;
  }

  release() {
    if (this.locked) {
      unlinkSync(`${this.file}.lock`);
      this.locked = false;
    }
  }

  async start() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const runId = randomUUID();
    this.file = resolve(this.directory, `${runId}.json`);
    this.data = {
      version: 1,
      runId,
      appUrl: this.config.appUrl,
      url: this.config.url,
      status: "active",
      users: [],
      rows: {},
      objects: [],
      pending: null,
    };
    this.lock();
    this.save();
    await this.api("/rest/v1/teams?select=id&limit=1");
    const challenge = randomUUID();
    const proofResponse = await this.fetcher(this.config.appUrl + "/api/test-environment", {
      method: "POST",
      redirect: "manual",
      signal: globalThis.AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge }),
    });
    requireThat(proofResponse.ok, "Local application environment proof unavailable");
    const expected = createHmac("sha256", this.config.serviceRole)
      .update(`local-test-environment:${this.config.url}:${challenge}`)
      .digest("hex");
    const payload = await proofResponse.json();
    requireThat(payload.proof === expected, "App/Auth instance mismatch before signup");
    return this;
  }

  async resume(runId) {
    requireThat(UUID.test(runId), "Expected one run UUID, not a path or glob");
    this.file = resolve(this.directory, `${runId}.json`);
    this.data = JSON.parse(readFileSync(this.file, "utf8"));
    this.validate(runId);
    // Serialize stale-lock takeover: a second recovery must never unlink a fresh lock.
    const recovery = `${this.file}.recovery`;
    const fd = openSync(recovery, "wx", 0o600);
    try {
      this.lock(true);
    } finally {
      closeSync(fd);
      unlinkSync(recovery);
    }
    return this;
  }

  validate(runId = this.data.runId) {
    const d = this.data;
    requireThat(d && d.version === 1 && UUID.test(d.runId) && d.runId === runId, "Invalid run registry");
    requireThat(d.appUrl === this.config.appUrl && d.url === this.config.url, "Run environment mismatch");
    requireThat(
      ["active", "failed", "cleaned"].includes(d.status) &&
        Array.isArray(d.users) &&
        Array.isArray(d.objects) &&
        d.rows &&
        typeof d.rows === "object",
      "Invalid registry structure",
    );
    for (const user of d.users)
      requireThat(
        UUID.test(user.id) && typeof user.email === "string" && user.email.includes(d.runId),
        "Invalid user ownership",
      );
    for (const [table, rows] of Object.entries(d.rows)) {
      requireThat(Object.hasOwn(COLUMNS, table) && Array.isArray(rows), "Invalid registry table");
      for (const row of rows) {
        requireThat(
          COLUMNS[table].every((column) => typeof row[column] === "string"),
          "Invalid registry row",
        );
        requireThat(UUID.test(keyOf(table, row)), "Invalid row ID");
        this.assertOwned(table, row);
      }
    }
    for (const object of d.objects) requireThat(this.ownsPath(object), "Invalid Storage ownership");
  }

  async api(path, { method = "GET", body, missing = false } = {}) {
    const response = await this.fetcher(this.config.url + path, {
      method,
      redirect: "manual",
      signal: globalThis.AbortSignal.timeout(15000),
      headers: {
        apikey: this.config.serviceRole,
        Authorization: `Bearer ${this.config.serviceRole}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (missing && response.status === 404) return null;
    requireThat(response.ok, `Local test API ${method} ${path.split("?")[0]} failed (${response.status})`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  has(table, id) {
    return (this.data.rows[table] ?? []).some((row) => keyOf(table, row) === id);
  }
  ownsUser(id) {
    return this.data.users.some((user) => user.id === id);
  }
  assertOwned(table, row) {
    const owned =
      table === "teams"
        ? this.ownsUser(row.created_by)
        : table === "training_submissions"
          ? this.has("trainings", row.training_id) && this.ownsUser(row.user_id)
          : this.has("teams", row.team_id) && (table !== "team_members" || this.ownsUser(row.user_id));
    requireThat(owned, `Unproven ownership of ${table}`);
    if (table === "training_submissions") requireThat(this.ownsPath(row.storage_path), "Unproven photo path");
  }
  ownsPath(path) {
    if (typeof path !== "string") return false;
    const [team, training, user, extra] = path.split("/");
    return (
      !extra &&
      this.has("teams", team) &&
      this.has("trainings", training) &&
      this.ownsUser(user) &&
      this.data.rows.trainings.some((row) => row.id === training && row.team_id === team)
    );
  }

  async rows(table, where) {
    requireThat(Object.hasOwn(COLUMNS, table) && Object.keys(where).length > 0, "Unscoped resource query");
    const query = new URLSearchParams({ select: COLUMNS[table].join(",") });
    for (const [column, value] of Object.entries(where)) query.set(column, `eq.${value}`);
    const rows = await this.api(`/rest/v1/${table}?${query}`);
    requireThat(Array.isArray(rows) && rows.length < 1000, "Incomplete resource query");
    return rows;
  }

  // The selector describes one intended new row; preexisting unregistered rows are never adopted.
  async capture(table, where, action) {
    requireThat(this.locked && !this.data.pending, "Run is not ready for a mutation");
    const before = await this.rows(table, where);
    requireThat(
      before.every((row) => this.has(table, keyOf(table, row))),
      "Refusing to mutate preexisting resources",
    );
    this.data.pending = { table, where };
    this.save();
    let result;
    let failure;
    try {
      result = await action();
    } catch (error) {
      failure = error;
      if (networkAmbiguous(error)) {
        this.data.pending.uncertain = true;
        this.save();
        throw error;
      }
    }
    try {
      await this.resolvePending();
    } catch (error) {
      if (failure) throw new AggregateError([failure, error], "Mutation and registration failed", { cause: error });
      throw error;
    }
    if (failure) throw failure;
    return result;
  }

  async resolvePending() {
    const pending = this.data.pending;
    if (!pending) return;
    requireThat(!pending.uncertain, "Operation completion is uncertain; keep registry for inspection before cleanup");
    requireThat(
      pending.table && Object.hasOwn(COLUMNS, pending.table) && pending.where && Object.keys(pending.where).length,
      "Unresolved signup; refusing cleanup without its Auth ID",
    );
    const after = await this.rows(pending.table, pending.where);
    requireThat(after.length <= 1, "Ambiguous resource creation");
    for (const row of after) {
      this.assertOwned(pending.table, row);
      this.data.rows[pending.table] ??= [];
      if (!this.has(pending.table, keyOf(pending.table, row))) this.data.rows[pending.table].push(row);
    }
    // create_coach_team makes these children in the same transaction as the owned team.
    if (pending.table === "teams") {
      for (const team of after) await this.registerTeamChildren(team);
    }
    this.data.pending = null;
    this.save();
  }

  async registerTeamChildren(team) {
    for (const [table, where] of [
      ["team_members", { user_id: team.created_by }],
      ["team_join_codes", { team_id: team.id }],
    ]) {
      const rows = await this.rows(table, where);
      requireThat(rows.length === 1, "Missing team creation resource");
      for (const row of rows) {
        this.assertOwned(table, row);
        this.data.rows[table] ??= [];
        if (!this.has(table, keyOf(table, row))) this.data.rows[table].push(row);
      }
      this.save();
    }
  }

  async signup(email, password, action) {
    requireThat(email.includes(this.data.runId) && !this.data.pending, "Signup requires a unique run email");
    this.data.pending = { signup: email };
    this.save();
    let result;
    let failure;
    try {
      result = await action();
    } catch (error) {
      failure = error;
    }
    try {
      // A token from this Auth service proves which instance owns the exact new account.
      const token = await this.api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
      requireThat(token.user?.email === email && UUID.test(token.user.id), "App/Auth instance mismatch");
      this.data.users.push({ id: token.user.id, email });
      this.data.pending = null;
      this.save();
      if (failure) throw failure;
      return { result, userId: token.user.id };
    } catch (error) {
      if (failure && error !== failure)
        throw new AggregateError([failure, error], "Signup and registration failed", { cause: error });
      throw error;
    }
  }

  async createTeam(userId, action) {
    return this.capture("teams", { created_by: userId }, action);
  }

  async upload(path, action) {
    requireThat(this.ownsPath(path), "Unproven upload ownership");
    if (!this.data.objects.includes(path)) {
      this.data.objects.push(path);
      this.save();
    }
    this.data.pending = { upload: path, uncertain: true };
    this.save();
    try {
      const result = await action();
      this.data.pending = null;
      this.save();
      return result;
    } catch (error) {
      if (!networkAmbiguous(error)) {
        this.data.pending = null;
        this.save();
      }
      throw error;
    }
  }

  async verifyCascade() {
    // Fetch every dependent through both parent and user relationships before performing any deletion.
    for (const [table, rows] of Object.entries(this.data.rows)) {
      for (const row of rows) {
        const column = table === "team_join_codes" ? "team_id" : "id";
        await this.checkRows(table, { [column]: keyOf(table, row) });
      }
    }
    for (const user of this.data.users) {
      const auth = await this.api(`/auth/v1/admin/users/${user.id}`, { missing: true });
      if (auth) requireThat((auth.user ?? auth).email === user.email, "Auth ownership changed");
      for (const [table, where] of [
        ["teams", { created_by: user.id }],
        ["team_members", { user_id: user.id }],
        ["training_submissions", { user_id: user.id }],
      ])
        await this.checkRows(table, where);
    }
    for (const team of this.data.rows.teams ?? []) {
      await this.checkRows("teams", { id: team.id });
      for (const table of ["team_members", "team_join_codes", "trainings"])
        await this.checkRows(table, { team_id: team.id });
    }
    for (const training of this.data.rows.trainings ?? [])
      await this.checkRows("training_submissions", { training_id: training.id });
  }

  async checkRows(table, where) {
    for (const row of await this.rows(table, where)) {
      const registered = (this.data.rows[table] ?? []).find((known) => keyOf(table, known) === keyOf(table, row));
      requireThat(
        registered && COLUMNS[table].every((column) => registered[column] === row[column]),
        `Unknown or changed ${table} in deletion cascade`,
      );
    }
  }

  async cleanup() {
    try {
      requireThat(this.locked, "Cleanup requires exclusive ownership");
      this.validate();
      await this.resolvePending();
      await this.verifyCascade();
      for (const path of this.data.objects) {
        await this.api("/storage/v1/object/training-photos", { method: "DELETE", body: { prefixes: [path] } });
      }
      for (const table of ["training_submissions", "trainings", "team_members", "team_join_codes", "teams"]) {
        for (const row of this.data.rows[table] ?? []) {
          const column = table === "team_join_codes" ? "team_id" : "id";
          await this.api(`/rest/v1/${table}?${column}=eq.${keyOf(table, row)}`, { method: "DELETE" });
        }
      }
      for (const user of this.data.users)
        await this.api(`/auth/v1/admin/users/${user.id}`, { method: "DELETE", missing: true });
      this.data.status = "cleaned";
      this.save();
    } catch (error) {
      this.data.status = "failed";
      this.save();
      throw error;
    } finally {
      this.release();
    }
  }
}

function networkAmbiguous(error) {
  return (
    error instanceof TypeError ||
    ["AbortError", "TimeoutError"].includes(error?.name) ||
    (error?.cause && error.cause !== error && networkAmbiguous(error.cause))
  );
}

export async function withTestResources(config, action, options) {
  const run = new TestResources(config, options);
  let failure;
  let result;
  try {
    await run.start();
    result = await action(run);
  } catch (error) {
    failure = error;
  }
  if (run.locked) {
    try {
      await run.cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        failure ? [failure, cleanupError] : [cleanupError],
        `Cleanup failed. Run: ${run.data.runId}`,
        { cause: cleanupError },
      );
    }
  }
  if (failure) throw failure;
  return result;
}
