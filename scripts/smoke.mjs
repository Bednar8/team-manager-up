// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const displayName = "Smoke Coach";
const teamName = "Smoke Squad";
const athleteEmail = `smoke-athlete-${Date.now()}@example.com`;
const athleteName = "Smoke Athlete";
const jar = new Map();
const athleteJar = new Map();
let teamCode = "";

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(cookies, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) cookies.delete(name.trim());
    else cookies.set(name.trim(), rest.join("="));
  }
}

async function request(cookies, path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookies),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(cookies, response);
  const body = await response.text();
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

const steps = [
  ["home renders", () => request(jar, "/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request(jar, "/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request(jar, "/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request(jar, "/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request(jar, "/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  [
    "dashboard redirects signed-in user without team",
    () => request(jar, "/dashboard"),
    { status: 302, location: "/team/new" },
  ],
  ["create-team page renders", () => request(jar, "/team/new"), { status: 200 }],
  [
    "create team",
    () =>
      request(jar, "/api/team", {
        method: "POST",
        form: { team_name: teamName, display_name: displayName },
      }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "dashboard shows team",
    () => request(jar, "/dashboard"),
    { status: 200, bodyIncludes: [displayName, "Trener", teamName] },
  ],
  [
    "calendar redirects anonymous user",
    () => request(new Map(), "/calendar"),
    { status: 302, location: "/auth/signin" },
  ],
  ["ranking redirects anonymous user", () => request(new Map(), "/ranking"), { status: 302, location: "/auth/signin" }],
  ["calendar shows heading", () => request(jar, "/calendar"), { status: 200, bodyIncludes: ["Kalendarz"] }],
  ["ranking shows heading", () => request(jar, "/ranking"), { status: 200, bodyIncludes: ["Ranking"] }],
  [
    "second create team redirects to dashboard",
    () =>
      request(jar, "/api/team", {
        method: "POST",
        form: { team_name: "Another Squad", display_name: "Another Coach" },
      }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "signout clears session",
    () => request(jar, "/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],
  ["dashboard redirects after signout", () => request(jar, "/dashboard"), { status: 302, location: "/auth/signin" }],
];

function athleteSteps() {
  return [
    [
      "athlete signup creates account",
      () => request(athleteJar, "/api/auth/signup", { method: "POST", form: { email: athleteEmail, password } }),
      { status: 302, location: "/auth/confirm-email" },
    ],
    [
      "athlete signin accepts correct password",
      () => request(athleteJar, "/api/auth/signin", { method: "POST", form: { email: athleteEmail, password } }),
      { status: 302, location: "/" },
    ],
    [
      "wrong join code redirects to the choice",
      () =>
        request(athleteJar, "/api/team/join", {
          method: "POST",
          form: { join_code: "AAAAAAAA", display_name: athleteName },
        }),
      { status: 302, location: "/team/new?error=That code does not match a team" },
    ],
    [
      "dashboard still redirects after a wrong code",
      () => request(athleteJar, "/dashboard"),
      { status: 302, location: "/team/new" },
    ],
    [
      "athlete joins with the team code",
      () =>
        request(athleteJar, "/api/team/join", {
          method: "POST",
          form: { join_code: teamCode, display_name: athleteName },
        }),
      { status: 302, location: "/dashboard" },
    ],
    [
      "athlete dashboard lists the squad without the code",
      () => request(athleteJar, "/dashboard"),
      {
        status: 200,
        bodyIncludes: ["Zawodnik", teamName, displayName, athleteName],
        bodyExcludes: ["data-team-code"],
      },
    ],
    [
      "coach signs in again",
      () => request(jar, "/api/auth/signin", { method: "POST", form: { email, password } }),
      { status: 302, location: "/" },
    ],
    [
      "coach dashboard lists both names and the code",
      () => request(jar, "/dashboard"),
      { status: 200, bodyIncludes: [displayName, athleteName, "data-team-code"] },
    ],
  ];
}

let failed = 0;

function locationMatches(actual, expected) {
  if (expected === undefined) return true;
  return decodeURIComponent(actual).startsWith(expected);
}

async function runStep(name, run, expected) {
  const actual = await run();
  const locationOk = locationMatches(actual.location, expected.location);
  const bodyOk = expected.bodyIncludes === undefined || expected.bodyIncludes.every((s) => actual.body.includes(s));
  const bodyExcluded =
    expected.bodyExcludes === undefined || expected.bodyExcludes.every((s) => !actual.body.includes(s));
  let ok = actual.status === expected.status && locationOk && bodyOk && bodyExcluded;
  if (name === "dashboard shows team") {
    const match = actual.body.match(/data-team-code="([^"]+)"/);
    teamCode = match?.[1] ?? "";
    if (!teamCode) {
      ok = false;
    }
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
    if (expected.bodyIncludes && !bodyOk) {
      console.log(`      expected body to include ${JSON.stringify(expected.bodyIncludes)}`);
    }
    if (expected.bodyExcludes && !bodyExcluded) {
      console.log(`      expected body to exclude ${JSON.stringify(expected.bodyExcludes)}`);
    }
    if (name === "dashboard shows team" && !teamCode) {
      console.log("      expected data-team-code");
    }
  }
}

for (const [name, run, expected] of steps) {
  await runStep(name, run, expected);
}

for (const [name, run, expected] of athleteSteps()) {
  await runStep(name, run, expected);
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
