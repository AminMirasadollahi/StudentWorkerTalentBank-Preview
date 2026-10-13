# StudentWorkerTalentBank — unified worker focus & four-window weekly UX
**Implementation date:** 2026-10-13  
**Release state:** feature branch only, not yet merged/published.  
**Live Pages baseline:** `main` @ `afecdcd3fa4dc2ba9dc148f48297360f32fee0b2`.  
**Working branch:** `feat/worker-focus-weekly-4slots-2026-10-13` based on the exact live baseline.

## Owner-approved scope

Owner asked for ONE coherent development and ONE grouped release rather than recurring manual mock/file screenshot cycles. Private development here means isolated **non-deployed code branch** in the existing public-source Preview repository (source code on GitHub is publicly viewable, but the running GitHub Pages site is not changed). No additional Supabase environment, staging website, SQL migrations, simulated HTML pages or personal applicant data.

## Implemented actual production React changes

1. `src/OpsApp.jsx`:
   - `initialWorkerNavigation` contains only `section` and `taskRange`; state lives in OpsApp rather than in an unmounting worker child.
   - Passed to `WorkerView` / `WorkerOperations`. Survives browser tab focus/visibility revalidation **without** suppressing fail-closed authorized rechecks, reloading sensitive information or persisting it to storage.
   - Reset on sign-out, failed identity verification, account/role change, new login or completed recovery; mounts keyed by authenticated identity to prevent fleeting prior-worker data display.
   - After first-time required password onboarding, voluntary password change is a closed-by-default `details` panel instead of an always-visible password form.

2. `src/OperationsWorkspace.jsx`:
   - Worker primary tabs: `کارها`, `زمان حضور`, `سابقه من`; `کارها` has segmented `امروز / این هفته / همه`. The Persian `این هفته` means precisely the Saturday–Friday week.
   - Worker task cards: less repeated content, report/submit form accessible through `details`; report mutations and all original guards retained. Worker history shows details on demand.
   - Both worker AND manager use revised `ScheduleEditor`: actual seven-day compact schedule matrix, four summary cells per weekday, a single expanded-day editor with up to four intervals; separate saving **per weekday**.
   - Native client validation for 00:00..24:00, mandatory start < end, no overlapping intervals, maximum four slots, chronological sort; per-day capacity sums actual intervals. This matches installed `ops_set_weekly_day` backend.
   - Empty day: `حذف برنامه ثابت این روز` with human confirmation; **not** labeled confirmed absence (the backend removes the weekly record and preserves unknown availability). Only dated unavailable exceptions prove one-day absence.
   - Existing temporary date exception form intentionally remains independent with its prior single replacement time window; separately extendable later if needed. Backend supports four but owner considered exception distinct and current acceptable.
   - No change to RPC contracts, RLS, Supabase records or real lifecycle status writes.

3. `src/operations-workspace.css`:
   - Responsive compact KPI chips/tiles, two-column desktop worker task cards and selected manager list cards, smaller metadata and accessible disclosure summaries.
   - Seven weekday summary rows × four window cells, native keyboard focus, mobile two-by-two slot cells and single-column work cards.
   - Maintains existing real Modam font environment; no added font assets.

4. `src/lib/weeklyScheduleGrid.mjs`: pure validated HH:MM↔minutes, overlap detection, limit four, select effective authorized worker-day intervals and Iran-local Saturday–Friday bounds.

## Technical and security invariants

- `src/App.jsx` remains byte-identical to prior deployed 18-step applicant signup.
- `src/lib/operations.js` unchanged; all writes remain server-authorized RPC calls with the same roles, guards and signatures.
- `WorkerLifecycleReadOnlyPreview` remains the only public lifecycle UI; no mutating lifecycle component or feature flag is imported.
- `src/report.css`, normal app routing, Vite Pages base and `.github/workflows/pages.yml` unchanged.
- Existing `tests/releaseBoundary.test.mjs` hard-locks protected Git blobs.
- No emails/notifications sent, no actual worker status or availability mutations performed during implementation.
- Daily save is one RPC per weekday and not a transaction across seven weekdays. UI never promises seven-day atomic save; each day has local save success/failure feedback.
- An empty weekly schedule is **unknown capacity**, not zero hours / confirmed absence; dated exceptions remain the source of explicit unavailability.
- UI writes are **not** automated in production browser QA; tests use in-memory intercepted fake RPCs.

## Tests and acceptance gate

Non-deploy GitHub workflow `.github/workflows/operations-release-review.yml` triggers specifically on this feature branch and Pull Requests to main. It installs build dependencies + ephemeral JSDOM and runs `node --test tests/*.test.mjs` then `npm run build` against the real Vite app without Pages deployment.

- Original manager/intake/Auth guards, task workflow/approval/time/capacity tests preserved.
- `tests/weeklyScheduleGrid.test.mjs`: four non-contiguous sessions total correctly; reject five windows, overlap, invalid/end-before-start/cross-midnight; allow adjacent and end at 24:00; effective-period and worker scope; exact Saturday-Friday bounds.
- `tests/workerNavigationScheduleUi.test.mjs`: actual isolated React worker workflow mounted with JSDOM, confirms three primary tabs, default hidden report form, navigation survives secure unmount/remount simulation, seven-day × four-slot grid and per-day RPC payload recorded **in local mock only**; source asserts auth fail-closed and lifecycle disabled-only.
- `tests/assignmentCapacityUi.test.mjs`: manager real React schedule conflict warning with new expanded weekday UI; invalid inputs disable submit.
- Previous task filters, approval constraints, history, access, responsive CSS and release-boundary checks remain.

**Never use branch CI alone as proof of actual database mutations or authenticated live usage.** Before publication, check green CI at the final HEAD, reviewer-safe diff, unchanged protected SHA files and rollback to `afecdcd3...`. A subsequent public main publication is a **separate user consent gate**. Once live, owner can verify actual Modam rendering, mobile, worker tab resume and table save view in one grouped pass. Avoid testing actual saved schedules without explicit isolated QA-worker scope and owner authorization.

## Deferred (nonblocking)

- Extend temporary date exception editor from one to four intervals; not necessary for approved core weekly feature.
- Native-sortable Gregorian workbook column while retaining Jalali display.
- Cosmetic short auth resume-check flash: issue #5 in private repo; must keep fail-closed security.
- Dedicated backend recurring-unavailable marker; only needed if the product later wants zero weekly hours to mean explicit recurring absence.

## One-batch review outcome

When the tests pass, prepare the scoped public Draft PR from `feat/worker-focus-weekly-4slots-2026-10-13` into `main`. Do not merge during implementation. No separate visual-preview iteration; request only the explicit release consent after code/test review.
