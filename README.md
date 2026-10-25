# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v24.22.1 (the version in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm test` - Run Vitest unit and local HTTP integration tests
- `npm run smoke` - Smoke test the auth flow against the running local server (`BASE_URL`, defaults to `http://localhost:4321`)
- `npm run test:cleanup -- <run-id>` - Retry cleanup of one registered local test run (UUID)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Local setup also needs the tables from `supabase/migrations/`, alongside Auth's built-in `auth.users` table. A fresh `npx supabase start` applies them. Apply pending migrations with `npx supabase migration up` to retain existing values. Do not reset the database, truncate tables, remove Docker volumes or reload seeds to prepare tests. Keep `supabase/seed.sql` empty of domain data; insert only a missing row required by a task. Historical plans containing reset instructions are not current local procedures.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) (`team-manager` in `wrangler.jsonc`), not Cloudflare Pages. A green GitHub Actions run on `main` or `master` lints and builds only; it does not publish the Worker.

Production URL: `https://team-manager.p-bednarski9907.workers.dev`.

1. Build, then deploy. Do not pass `--env`; this repo has no named Wrangler environments.

```bash
npm run build && npx wrangler deploy
```

2. After the Worker exists, set the hosted Supabase values (not `127.0.0.1`, and the publishable key, not the service role):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

`wrangler secret put` publishes a new version of the current script, so a second build is not required for the secret to take effect. Local copies stay in gitignored `.env` and `.dev.vars`. GitHub Actions secrets of the same names are only for the CI build.

Turn on Workers Paid before athletes upload real photos. The free plan allows 10 ms of CPU per invocation. Ranking cron is not part of this deploy; the default Astro entry only serves HTTP.

In the hosted Supabase project, set Authentication → URL Configuration so confirmation mail returns to the Worker: Site URL and Redirect URLs = `https://team-manager.p-bednarski9907.workers.dev`. `supabase/config.toml` only affects the local stack.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP. Run it against the local dev server or local production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs local Supabase with email confirmation disabled and the test configuration below. Mutating smoke and integration tests refuse remote environments.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## Local tests and data preservation

Keep `npm run dev` and `npx supabase start` running. Integration tests use `BASE_URL` (default `http://localhost:4321`), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE`. The latter two are read from the process, then `.env`, then `.dev.vars`; existing process values win. Keep the service role in these gitignored local files or the test process only, never in frontend code or output. The app keeps reading its own secrets through `astro:env/server`. Photo tests also need a nonempty `OPENROUTER_API_KEY` in the dev server; they fake the readout and do not call the model.

Both URLs must use literal loopback hosts (`localhost`, `127.0.0.1`, `::1`), without URL credentials. Before signup, a read-only `/api/test-environment` challenge proves that the running app uses the same local URL and service key; neither value is returned. Tests also verify the new account against that instance before domain writes. A remote address, redirect outside the environment or mismatched instance is an error.

```bash
npm test
BASE_URL=http://localhost:4321 npm run smoke
```

Every mutating run creates its own accounts, team and resources. Existing developer accounts, sessions, rows and photos remain intact. Agents must follow the same rule for manual checks and must not use the developer’s account/session. Resource ownership and relations are written to gitignored `.test-runs/<run-id>.json`, without passwords, keys, cookies or signed URLs. Cleanup runs after success and after a test/setup error, removing only registered Storage objects, domain rows and Auth accounts. The developer checks the UI with their own account, since successful fixture accounts are removed.

After a terminal/process crash, find the run UUID in the test output or the filenames under `.test-runs/`, then retry that single run:

```bash
npm run test:cleanup -- <run-id>
```

The command accepts one UUID, not a path or wildcard. Use the same local configuration as the original run and wait until its process has ended. Repeating completed cleanup is safe. A lock prevents the test and cleanup command from owning one run simultaneously. Cleanup errors leave the registry for retry and produce a nonzero exit status. Dead process locks are reclaimed only after checking that the owner has exited; a live owner blocks cleanup. A network timeout can leave server work in progress: such operations remain unresolved and must be inspected before any cleanup retry can remove data. Missing/invalid ownership, an ambiguous creation result or an unknown dependent resource stops deletion; do not bypass this with manual SQL or wider filters. SIGKILL can leave an unresolved operation, so complete cleanup cannot be guaranteed after every crash. Preserve existing data first. Old fixtures without a registry are deliberately left alone; a familiar name or email prefix is not proof of ownership.

## CI

GitHub Actions runs two jobs on every push and PR to `main` or `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. The job supplies the ephemeral local service role to the test process. Its final stack teardown applies only to the disposable CI runner; do not copy volume removal into local development.

## License

MIT
