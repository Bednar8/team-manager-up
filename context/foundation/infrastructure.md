---
project: Team Manager
researched_at: 2026-09-21
recommended_platform: Cloudflare Workers
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 (server output, React 19 islands)
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare 14
---

## Recommendation

**Deploy on Cloudflare Workers.**

Team Manager is already an Astro 7.3 server app (`output: "server"`) with `@astrojs/cloudflare` ^14.3.1 and Wrangler ^4.131.1. That adapter deploys a Worker with static assets; Cloudflare Pages support was removed from the adapter. The app is request/response only (no WebSockets), one region is enough, and Postgres, auth, storage, and OCR stay on Supabase and OpenRouter. Workers scores a pass on every platform criterion, the monthly floor for real SSR is about $5, and the developer asked to learn Cloudflare. Render ties the criteria score and is the familiar alternative, but it means replacing the adapter and paying for an always-on Node service or accepting a free-tier cold start.

## Platform Comparison

Checked 2026-09-21. Pass / Partial / Fail against CLI-first maintenance, managed or serverless hosting, agent-readable docs, a stable deploy API, and an MCP or first-class agent integration.

| Platform | CLI-first | Managed / serverless | Agent-readable docs | Stable deploy API | MCP / integration |
|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass |
| Render | Pass | Pass | Pass | Pass | Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial |
| Netlify | Pass | Pass | Pass | Partial | Pass |
| Fly.io | Pass | Pass | Pass | Partial | Partial |
| Railway | Partial | Pass | Pass | Partial | Pass |

**Cloudflare Workers.** Wrangler deploys, rolls back, and tails logs without a dashboard. The platform runs the bundle; there is no VM to patch. Docs publish `llms.txt` and markdown, including a public GitHub docs repo. `wrangler deploy` is deterministic. Docs and observability MCP endpoints are available; MCP server portals were still an open beta on 2026-09-21. D1 read replication is a public beta and is irrelevant here because the database is Supabase.

**Render.** Official CLI (GA, v2.28.0 as of 2026-09-10), REST rollback, `llms.txt`, and a hosted MCP server at `https://mcp.render.com/mcp`. Astro SSR is a Web Service on `@astrojs/node`, not a static site. Free instances spin down after 15 minutes of idle and cold-start in about a minute. Starter is $7/month and stays up. That cold start fights the requirement that an athlete is not left waiting after a photo upload.

**Vercel.** `vercel deploy`, `vercel rollback`, and `vercel logs` are GA. Astro 7 SSR uses `@astrojs/vercel` on Fluid compute (GA). Docs expose `llms.txt` and per-page markdown. The official MCP server was still a public beta on 2026-09-21 (launched 2025-08, no GA notice found). Hobby remains non-commercial. Cron on Hobby is once a day with timing of about ±59 minutes inside the hour, which is loose but usable for “ranking tomorrow.” Pro is about $20 per user per month.

**Netlify.** `netlify deploy` and `netlify logs` are in place. Rollback is `netlify api restoreSiteDeploy`, not a dedicated rollback command. `@astrojs/netlify` 8.x supports Astro 7 server output as Functions. Sync functions stop at 60 seconds, so an OpenRouter OCR call inside the request can time out; Background Functions allow 15 minutes. Credit plans (since 2025-09-04) give new free accounts 300 credits per month and pause the site at zero. The official MCP server is listed as GA. Docs expose `llms.txt` and `.md` URLs.

**Fly.io.** `fly deploy` and `fly logs` are GA. Rollback is redeploying a kept image, and pruning images can remove the rollback target. No first-party Astro adapter: `@astrojs/node` standalone plus a container. New organizations are pay-as-you-go; the old free allowances are gone. A shared-cpu-1x machine is about $2 per month always on. `fly mcp server` is documented as experimental. Managed Postgres starts near $38 per month and is the wrong database for this app.

**Railway.** `railway up` and `railway logs` work. Rollback to an older deploy is dashboard-only, so an agent cannot finish recovery in the terminal. Official Astro guide is `@astrojs/node` standalone. Hobby is $5 per month including $5 of usage; a small always-on Node process is often about $5–15. Docs expose `llms.txt`. The remote MCP server had no beta label on 2026-09-21. Idle compute bills unless Serverless sleep is on, and sleep brings cold starts.

No platform was dropped. The app does not need a process that stays alive between requests, and every candidate can run TypeScript. Single-region users did not reward edge networking. External Supabase and OpenRouter meant co-located databases did not score extra. Render familiarity was the tie-break toward Render; the existing Cloudflare adapter and the request to learn Cloudflare put Workers first.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The repo already builds for this runtime. `wrangler.jsonc` points `main` at `@astrojs/cloudflare/entrypoints/server`, with `nodejs_compat` and observability enabled. `astro dev` and `astro preview` run on workerd, so local and production are the same runtime. A daily cron trigger exists on Workers (GA). At one team’s traffic, request volume fits the free allowance (100,000 requests per day). Server-rendered pages that do real work should use Workers Paid ($5 per month) because the free plan allows 10 ms of CPU per invocation.

#### 2. Render

Same criterion score, and the developer has used it. The gap is mechanical: swap `@astrojs/cloudflare` for `@astrojs/node`, bind `0.0.0.0` and `PORT`, and either pay $7 per month for Starter or accept free-tier spin-down. That swap spends after-hours time the 4 Nov 2026 deadline does not have, and a one-minute cold start shows up the moment an athlete opens the app after idle.

#### 3. Vercel

Strong Astro SSR support and a one-command rollback. The gap is the same adapter swap, Hobby’s non-commercial rule, and an MCP integration still in public beta. Fine as a later host if Workers CPU or cron handling becomes the blocker. Not the first host for a stack that is already on the Cloudflare adapter.

## Anti-Bias Cross-Check: Cloudflare Workers

The developer chose to proceed with Workers and keep these risks in the register.

### Devil's Advocate — Weaknesses

1. The free plan allows 10 ms of CPU per invocation. Time spent waiting on Supabase or OpenRouter does not count, but session work and image handling can. Over the limit, the Worker fails. The practical price for this MVP is $5 per month, not $0.
2. The generated entry only serves HTTP. Next-day ranking needs a custom Worker entry that exports the Astro handler and a `scheduled` function, plus a cron trigger in `wrangler.jsonc`. The starter does not include that. A trigger added only in the dashboard fires into a Worker that ignores it.
3. Memory is 128 MB on free and paid. Holding a phone photo in the Worker while calling OpenRouter can kill the request. The upload has to land in Supabase Storage first; the Worker should pass a URL.
4. The free plan allows 50 subrequests and 6 simultaneous outgoing connections per request. A page that talks to Supabase Auth, Storage, and OpenRouter together can hit that. Paid raises the subrequest cap to 10,000. The connection cap stays at 6.
5. `context/foundation/tech-stack.md` still says `cloudflare-pages`. This decision supersedes that hint. A Pages tutorial does not match Astro 7 or this `wrangler.jsonc`.

### Pre-Mortem — How This Could Fail

The first training night, three athletes upload photos at once on the free plan. Two requests exceed 10 ms of CPU or 128 MB while the image is still in memory, and the third sits on a failed OpenRouter call with no progress on screen. The next morning the ranking is empty: a cron was added in the dashboard, but the Astro entry never implemented `scheduled`, so the trigger fired into a Worker that ignored it. The remaining after-hours time goes into moving uploads to Supabase and writing a custom scheduled handler. The 4 Nov 2026 deadline slips with an app that works in `astro dev` and fails on a real workout.

### Unknown Unknowns

- `npm run dev` already runs on workerd through the Cloudflare Vite plugin (Astro 6 and later, this repo is Astro 7 with adapter 14). A separate `wrangler pages dev` loop is the old path and can disagree with the adapter.
- `wrangler rollback` restores the Worker script and static assets. It does not undo a Supabase migration or delete uploaded photos.
- Preview URLs are reachable unless Cloudflare Access is in front of them. Adapter support for preview-deployment bindings was marked private beta in `@astrojs/cloudflare` 13.2.0; no GA announcement was confirmed on 2026-09-21. Team photos stay private only if Supabase row-level security holds on any URL that can call the API.
- `compatibility_date` is pinned to `2026-05-08` with `nodejs_compat` set by hand. Node compatibility became the default for compatibility dates on or after 4 Aug 2026. Bumping that date changes runtime behavior and needs a test pass.
- Subrequests to Supabase and OpenRouter are not billed as extra Workers requests. They still count toward the per-request subrequest limit.
- Workers run globally. There is no Warsaw-only pin. That is acceptable for one team; the database region is a Supabase choice, not a Workers choice.
- `@astrojs/cloudflare` 14’s CDN cache provider (`cacheCloudflare()`) requires Workers Cache, which the adapter changelog still marks as private beta and opt-in. Do not enable it for this MVP.
- GitHub Actions on `master` lints and builds. It does not deploy. `tech-stack.md` describes auto-deploy on merge; that workflow is not in `.github/workflows/ci.yml` yet.
- Since Astro 6, a Cloudflare environment is chosen at build time. `CLOUDFLARE_ENV=some-env npm run build && npx wrangler deploy` is the pattern. `wrangler deploy --env` alone, without a rebuild, is the old behavior.

## Operational Story

- **Preview deploys**: Production is `npm run build && npx wrangler deploy` from the root `wrangler.jsonc`. A non-production version can be uploaded with `npx wrangler versions upload` without promoting it. Git-connected Workers Builds can attach branch previews when that product is enabled on the account. Treat preview-binding support as private beta until Cloudflare marks it GA. Put Cloudflare Access in front of any preview that can read team photos, and do not inject production Supabase secrets into fork PRs. Today’s CI does not deploy previews.
- **Secrets**: Production values live as Workers secrets, set with `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. After they are set, the dashboard does not show the values again. Local copies stay in gitignored `.dev.vars` (Workers) and `.env` (Astro). The app reads them through `astro:env/server`. GitHub Actions secrets of the same names are only for the CI build, not a substitute for Workers secrets. Rotation is another `wrangler secret put` of the same name. OpenRouter keys, when added, follow the same path.
- **Rollback**: `npx wrangler rollback` or `npx wrangler rollback <VERSION_ID>`. Revert is typically seconds. Supabase SQL and Storage objects stay as they are; ship migrations that can move forward, and do not expect the Worker rollback to repair ranking rows.
- **Approval**: A person publishes to the production route (`wrangler deploy` against production), rotates `SUPABASE_KEY` or the OpenRouter key, and applies any Supabase migration that drops or rewrites data. An agent may run `npm run dev`, `npm run build`, `npx astro check`, and `npx wrangler tail` unattended. Uploading a non-production version is fine once a preview workflow exists. Production deploy stays a human step until that is explicitly changed.
- **Logs**: `npx wrangler tail` streams runtime logs. Observability is already `enabled` in `wrangler.jsonc`. The observability MCP endpoint is `https://observability.mcp.cloudflare.com/mcp`. Pipeline logs for lint and build are the GitHub Actions runs on `master`. There is no deploy log in CI until a deploy job exists.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan 10 ms CPU kills SSR on a real upload | Devil's advocate | H | H | Use Workers Paid ($5/month) before the first training night. Confirm a signed-in page and a photo upload under `wrangler tail`. |
| Cron never runs because the Astro entry has no `scheduled` handler | Devil's advocate / Pre-mortem | H | H | Add a custom entry that re-exports the Astro handler and implements `scheduled`, plus `triggers.crons` in `wrangler.jsonc`. Invoke it once in dev before relying on “ranking tomorrow.” |
| Phone photo buffered in the Worker exceeds 128 MB | Devil's advocate / Pre-mortem | M | H | Upload the file to Supabase Storage first. Send OpenRouter a URL or a downscaled payload, not the raw bytes held in the isolate. |
| Free-plan subrequest or connection cap during auth + storage + OCR | Devil's advocate | M | M | Paid plan for the 50-subrequest cap. Keep outgoing calls sequential where possible; the 6-connection cap remains on paid. |
| Pages tutorial or `tech-stack.md` hint sends the deploy to the wrong product | Devil's advocate | M | H | Follow this file and the repo README. Deploy target is Workers. Ignore `deployment_target: cloudflare-pages` in `tech-stack.md`. |
| `wrangler rollback` leaves bad ranking data in place | Unknown unknowns | M | M | Make ranking writes idempotent. Treat Supabase migrations as forward-only. |
| Preview URL exposes team photos | Unknown unknowns | M | H | Rely on Supabase RLS for every request. Put Cloudflare Access on previews. Do not give fork PRs production secrets. |
| Bumping `compatibility_date` past 2026-08-04 changes Node compat behavior | Unknown unknowns | L | M | Keep `2026-05-08` and explicit `nodejs_compat` until a deliberate bump is tested with `npm run dev` and the smoke script. |
| `cacheCloudflare()` enabled while Workers Cache is still private beta | Research finding | L | M | Leave the cache provider off for the MVP. |
| Assuming merge-to-master deploys production | Unknown unknowns | H | M | CI only builds. Add a deploy job later, or deploy with Wrangler by hand. Do not treat a green Actions run as a release. |

## Getting Started

Pinned versions: `astro` ^7.3.2, `@astrojs/cloudflare` ^14.3.1, `wrangler` ^4.131.1, Node 22 in CI. These commands match that adapter. `astro dev` already uses workerd; do not add `wrangler pages dev`.

1. From the repo root, log in once: `npx wrangler login`.
2. Rename `name` in `wrangler.jsonc` from `10x-astro-starter` to `team-manager` before the first deploy, so the workers.dev hostname is this product.
3. Set production secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. Put the same keys in gitignored `.dev.vars` for local work.
4. Deploy with the existing config: `npm run build && npx wrangler deploy`. The root `wrangler.jsonc` already sets `main` to `@astrojs/cloudflare/entrypoints/server`. If you introduce a named Wrangler environment, rebuild with `CLOUDFLARE_ENV=<env> npm run build` and then `npx wrangler deploy`. Do not deploy with `--env` against a build that was not made for that environment.
5. Turn on Workers Paid before athletes upload real photos. Then add the ranking cron as a custom `scheduled` entry; the default Astro server entry will not run it.

Local check stays `npm run dev`. `npm run build && npm run preview` runs the production bundle on workerd. `BASE_URL=http://localhost:4321 npm run smoke` covers the auth path when Supabase is reachable.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (GitHub Actions does not deploy yet; wiring that is a later change)
- Production-scale architecture (multi-region, HA, DR)
