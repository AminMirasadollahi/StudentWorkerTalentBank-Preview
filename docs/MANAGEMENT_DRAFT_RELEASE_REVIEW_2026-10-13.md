# StudentWorkerTalentBank — draft-only management release candidate

## Authorization and current boundary

The owner authorized a **Draft Pull Request for the public Preview repository**, not merging or deploying it. Public `main` remains the actual deployed applicant intake. This candidate is based exactly on public commit `3ac65b54b6130ad1a98a0be341441d5c8678692c`.

**This branch is publicly readable but NOT live on GitHub Pages.** The public Pages workflow deploys only the `main` branch. Do not merge or manually dispatch Pages without a separate, explicit owner approval and a rollback check.

## Changes limited to normal manager/worker operations

- `src/OperationsWorkspace.jsx`: manager combined history filters, actual report date filtering and XLSX, genuine unreported tasks, assignment capacity/presence warnings, task status/approval summaries, visible missing-task safeguards, compact attention management and mobile-friendly progressive lists.
- **Safety substitution:** this source was adapted from the private feature branch with **all** `WorkerLifecycleControls` imports, mounting, feature-flag enabling and status-change paths stripped. It imports and renders the pre-existing public `WorkerLifecycleReadOnlyPreview` instead.
- `src/lib/workerHistory.js`: filtering only of previously authorized `ops_get_operations` results.
- New pure `src/lib/assignmentCapacity.mjs` and `src/lib/operationsTaskOverview.mjs`: in-memory presentation advice and queue/sorting logic; no RPC clients and no writes.
- `src/OpsApp.jsx`: only navigation/filter preferences (not Auth logic) added to the original public file.
- `src/operations-workspace.css`: public base CSS left byte-identical as prefix; only supplementary RTL responsive and compact card styles appended.
- `tests/*.test.mjs`: synthetic pure and mounted React tests plus hard-coded protected Git blob hash guard.
- `.github/workflows/operations-release-review.yml`: PR-only CI on the public Vite app, protected-baseline hashes and fake-data UI cases. **No deploy job.**

## Files rigorously protected by hash gate

These original public files are unchanged, and `tests/releaseBoundary.test.mjs` refuses the candidate if they change:

- `src/App.jsx` — active 18-step applicant form
- `src/report.css`
- `src/lib/operations.js` — operations Auth and server/RPC interface, including existing role gating and email flags
- `src/components/WorkerLifecycleReadOnlyPreview.jsx` — all account-control buttons disabled
- `vite.config.js` — critical `/StudentWorkerTalentBank-Preview/` base path
- `.github/workflows/pages.yml` — must remain main-only

Also unchanged: deployment `main`, Supabase schema/RLS/Auth, real worker states, service email/SMS settings, user application records and official registration routing.

**NEVER** replace the public read-only component with the private mutating lifecycle component via this PR. A separate future lifecycle release requires specific approval and independently verified restoration safety; not part of this project closure.

## QA gate and release decisions

The private code before public adaptation passed its full private suite and file:// Chromium checks (run `38396465891`). This *does not* establish public adapter safety. Public PR-specific CI must independently pass `node --test tests/*.test.mjs` and `npm run build` from the exact public code. No QA-only React test harness or proprietary Modam font is published as part of the candidate; existing public UI font behavior is preserved by not touching app CSS/assets.

After CI, manually review PR diff and list for accidental changes. Before any public merge, obtain fresh distinct user consent and prepare rollback to public base SHA; then do one grouped authenticated smoke-test of manager and worker pilot on synthetic accounts, along with applicant signup route, mobile/desktop font and role isolation. Beware that management is still a pilot while the live applicant form shares its Supabase project. Capacity warnings are **advisory only** and not enforcement of availability on the server.

**Intentionally deferred:** account state mutations/Lease/cron, extra Supabase project, invitation flag changes, optional native-sortable Excel date columns, cosmetic auth recheck blink (issue #5), nonessential new features.

## Go / no-go checkpoints

- **GO to draft review:** Only after verifying safe changed files, protected baseline and PR status `draft=true`, `merged=false`.
- **GO to approval request:** Only after public PR CI passes and a fresh review finds no protected asset changes.
- **NO-GO to merge now:** user has not authorized release to public `main`. Draft PR is not permission to go live.
