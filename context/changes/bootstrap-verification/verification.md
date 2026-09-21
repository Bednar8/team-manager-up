---
bootstrapped_at: 2026-09-21T10:42:41Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: team-manager
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: team-manager
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
```

## Why this stack

Team Manager is a small-scale web app with a 3-week after-hours MVP: coach/athlete login, photo uploads, screenshot OCR, and ranking published the next day. JavaScript/TypeScript plus the recommended Astro + Supabase + Cloudflare starter covers auth, Postgres, storage, and Cloudflare Pages deploy out of the box, which matches the short timeline. OCR and scheduled ranking are not in the starter; they will be added on top (an OCR/LLM API plus a worker or cron), accepting the edge-runtime limit on heavy jobs. GitHub Actions auto-deploys on merge to main.

## Pre-scaffold verification

| Signal             | Value                                                    | Severity | Notes                                              |
| ------------------ | -------------------------------------------------------- | -------- | -------------------------------------------------- |
| npm package        | not run                                                  | —        | `cmd_template` starts with `git clone`; npm skipped |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-09-12 | fresh    | from card.docs_url                                 |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 30785 (51 project files + 30734 under `node_modules/`)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted
**Cloned `.git/`**: deleted before move-up (cwd `.git/` preserved)

Project files moved:

- `.env.example`
- `.gitignore`
- `.nvmrc`
- `.prettierrc.json`
- `AGENTS.md`
- `astro.config.mjs`
- `CLAUDE.md`
- `components.json`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `README.md`
- `tsconfig.json`
- `wrangler.jsonc`
- `.github/workflows/ci.yml`
- `.husky/pre-commit`
- `.vscode/extensions.json`
- `.vscode/launch.json`
- `.vscode/settings.json`
- `public/.assetsignore`
- `public/favicon.png`
- `public/template.png`
- `scripts/smoke.mjs`
- `src/env.d.ts`
- `src/middleware.ts`
- `src/components/Banner.astro`
- `src/components/Topbar.astro`
- `src/components/Welcome.astro`
- `src/components/auth/FormField.tsx`
- `src/components/auth/PasswordToggle.tsx`
- `src/components/auth/ServerError.tsx`
- `src/components/auth/SignInForm.tsx`
- `src/components/auth/SignUpForm.tsx`
- `src/components/auth/SubmitButton.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/LibBadge.astro`
- `src/layouts/Layout.astro`
- `src/lib/config-status.ts`
- `src/lib/supabase.ts`
- `src/lib/utils.ts`
- `src/pages/dashboard.astro`
- `src/pages/index.astro`
- `src/pages/api/auth/signin.ts`
- `src/pages/api/auth/signout.ts`
- `src/pages/api/auth/signup.ts`
- `src/pages/auth/confirm-email.astro`
- `src/pages/auth/signin.astro`
- `src/pages/auth/signup.astro`
- `src/styles/global.css`
- `supabase/.gitignore`
- `supabase/config.toml`

`npm install` notes (non-fatal): peer override for `eslint-plugin-react` vs `eslint@10`; `EBADENGINE` warnings for `astro-eslint-parser@3.1.0` and `eslint-plugin-astro@3.1.0` (required Node `^22.22.3 || ^24.16.0 || >=26.3.0`; current `v24.11.1`).

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0
**Audit exit code**: 0
**Dependency tree**: 802 packages (`metadata.dependencies.total`)

#### CRITICAL findings

none

#### HIGH findings

none

#### MODERATE findings

none

#### LOW / INFO findings

none

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | true                               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
