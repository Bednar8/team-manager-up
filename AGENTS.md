# Repository Guidelines

This repo is an Astro 7 server-rendered app (React 19 islands, Tailwind CSS 4, Supabase auth, shadcn/ui) on Cloudflare Workers.

## Hard rules

- Run `npm run dev`, `npm run lint`, and `npm run build` (@package.json) before pushing.
- Leave `output: "server"` in @astro.config.mjs.
- Use Astro for static UI. Add React only for client interactivity; match `src/components/auth/SignInForm.tsx`.
- Merge classes with `cn()` from `@/lib/utils`. Put shadcn/ui in `src/components/ui/` and add with `npx shadcn@latest add <name>` (`new-york` in @components.json).
- Do not add `"use client"`. Match @src/pages/api/auth/signin.ts.
- Add each authenticated path to `PROTECTED_ROUTES` in @src/middleware.ts.
- Application code reads `SUPABASE_URL` and `SUPABASE_KEY` only via `astro:env/server`. Node test tools read local URL/service-role configuration as documented in @README.md. Keep local copies in gitignored `.env` and `.dev.vars`.
- Name migrations `YYYYMMDDHHmmss_short_description.sql` under `supabase/migrations/`, with RLS and per-operation, per-role policies.
- Preserve existing local Auth accounts, sessions, domain rows and Storage files. Never reset the database, truncate tables, remove Docker volumes, reload seeds or broadly delete data. Apply pending migrations with `npx supabase migration up`; insert only a missing value required by the task. Leave @supabase/seed.sql empty of domain data. Historical reset instructions are superseded by this rule.
- Tests and manual agent checks use their own accounts and resources, never the developer’s account/session. Record ownership in `.test-runs/<run-id>.json` before creating resources, then clean only that run’s registered resources after success or failure. Never delete old fixtures by name/email prefix or remove a parent whose cascade includes unknown resources.
- Mutating tests and cleanup require both the app and Supabase on literal loopback hosts (`localhost`, `127.0.0.1`, `::1`) and a matching environment. After interruption use `npm run test:cleanup -- <run-id>`; keep unresolved registries for retry. See @README.md.

## Build, test, and development

Node.js (@.nvmrc). Scripts, local Supabase, deploy, and lint-staged: @package.json and @README.md.

## Project structure

`src/pages/` holds `auth/`, `dashboard.astro`, and `api/auth/`. `src/components/` holds Astro chrome plus `auth/` and `ui/`. Shared files: `src/lib/supabase.ts`, `src/lib/utils.ts`, `src/layouts/Layout.astro`, `src/styles/global.css`. `@/*` → `./src/*` (@tsconfig.json). Also `scripts/smoke.mjs`, `supabase/config.toml`, `context/foundation/`.

## Coding style

@.prettierrc.json and @eslint.config.js.

## Testing

Vitest in Node (`npm test`) uses HTTP against the running local app; @tests/support.ts provides shared fixtures. Smoke: `npm run smoke`. No e2e runner is configured. Follow the ownership/cleanup cookbook in @context/foundation/test-plan.md and @README.md.

## Commit and pull request

History is `init` and `bootstrap` (no prefix convention). Target `master`. @.github/workflows/ci.yml.

## Configuration

@.env.example and @README.md.
