---
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
---

## Why this stack

Team Manager is a small-scale web app with a 3-week after-hours MVP: coach/athlete login, photo uploads, screenshot OCR, and ranking published the next day. JavaScript/TypeScript plus the recommended Astro + Supabase + Cloudflare starter covers auth, Postgres, storage, and Cloudflare Pages deploy out of the box, which matches the short timeline. OCR and scheduled ranking are not in the starter; they will be added on top (an OCR/LLM API plus a worker or cron), accepting the edge-runtime limit on heavy jobs. GitHub Actions auto-deploys on merge to main.
