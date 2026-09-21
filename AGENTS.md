# Repository Guidelines

This repo is an Astro 7 server-rendered app (React 19 islands, Tailwind CSS 4, Supabase auth, shadcn/ui) on Cloudflare Workers.

## Hard rules

- Run `npm run dev`, `npm run lint`, and `npm run build` (@package.json) before pushing.
- Leave `output: "server"` in @astro.config.mjs.
- Use Astro for static UI. Add React only for client interactivity; match `src/components/auth/SignInForm.tsx`.
- Merge classes with `cn()` from `@/lib/utils`. Put shadcn/ui in `src/components/ui/` and add with `npx shadcn@latest add <name>` (`new-york` in @components.json).
- Do not add `"use client"`. Match @src/pages/api/auth/signin.ts.
- Add each authenticated path to `PROTECTED_ROUTES` in @src/middleware.ts.
- Read `SUPABASE_URL` and `SUPABASE_KEY` only via `astro:env/server`. Keep local copies in gitignored `.env` and `.dev.vars`.
- Name migrations `YYYYMMDDHHmmss_short_description.sql` under `supabase/migrations/`, with RLS and per-operation, per-role policies.

## Build, test, and development

Node.js (@.nvmrc). Scripts, local Supabase, deploy, and lint-staged: @package.json and @README.md.

## Project structure

`src/pages/` holds `auth/`, `dashboard.astro`, and `api/auth/`. `src/components/` holds Astro chrome plus `auth/` and `ui/`. Shared files: `src/lib/supabase.ts`, `src/lib/utils.ts`, `src/layouts/Layout.astro`, `src/styles/global.css`. `@/*` → `./src/*` (@tsconfig.json). Also `scripts/smoke.mjs`, `supabase/config.toml`, `context/foundation/`.

## Coding style

@.prettierrc.json and @eslint.config.js.

## Testing

No unit or e2e runner is configured. @scripts/smoke.mjs and @README.md.

## Commit and pull request

History is `init` and `bootstrap` (no prefix convention). Target `master`. @.github/workflows/ci.yml.

## Configuration

@.env.example and @README.md.
