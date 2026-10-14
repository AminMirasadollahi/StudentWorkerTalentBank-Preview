# Operations V2 — public-safe handoff, 2026-10-14 (NO DEPLOY)

> This documentation is committed to the V2 DEVELOPMENT branch only. It is not on the public live main branch. The public repository's ROOT enrollment form is LIVE, despite the word Preview in the repository name.

## Actual release/PR state at checkpoint

- Latest LIVE main version before V2: 3d1cbfcdc03529ffab42f2f4ae2139db4169b8ca from owner-authorized merged PR #3.
- Current V2 branch: feat/integrated-operations-v2-2026-10-14.
- PUBLIC Draft PR #4: https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/pull/4 — OPEN, DRAFT, UNMERGED. Original code HEAD 86a918ad1bb54e2f0324710039233b2f9c1c55b0 before documentation-only commits.
- CI review: https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/38519080254 — SUCCESS on original code SHA, 63 tests PASS, 0 FAIL, Vite build PASS, **no Pages deploy**.
- Private related Draft PR #6: https://github.com/AminMirasadollahi/StudentWorkerTalentBank/pull/6 — proposed SQL migrations, **NOT APPLIED**.
- **Do not merge or deploy public PR #4 before the corresponding reviewed, tested, separately authorized server RPCs exist**. V2 versioned manager and worker reads would fail if the draft SQL functions were missing.

## UI scope already coded on public V2 branch
- In-cell seven-day x four-slot weekly presence editor: no extra full-width editor beneath the entire weekly table.
- Month calendar with short task-title preview, effective presence/exception indicators and selected date drill-down; focused day assignment popup for manager.
- Manager choose single/multiple active workers via shared TaskAssignmentEditor, with capacity advisories; multiple users call versioned atomic group RPC once. Each worker's approved time remains independently reviewed.
- All-worker recurring weekly attendance timeline with variable intervals (not forced into four labels).
- Manager right-side searchable people directory and profile panel, review inbox for pending worker time reports and corrections.
- Worker Today/Week/Month task browsing retaining unfinished overdue tasks; report CTA; personal identity and correction request; same-task collaborators displayed only if authorized server returns names.
- CSS compact/RTL, minimal default guidance and responsive behavior.

## Changed code files vs last deployed main
1. .github/workflows/operations-release-review.yml (nondedeploy CI branch inclusion)
2. src/OperationsWorkspace.jsx
3. src/components/TaskAssignmentEditor.jsx (new)
4. src/lib/operationsV2.js (new)
5. src/operations-workspace.css
6. tests/assignmentCapacityUi.test.mjs
7. tests/operationsTaskOverviewUi.test.mjs
8. tests/workerHistoryFiltersUi.test.mjs
9. tests/workerNavigationScheduleUi.test.mjs

Documentation added during the handoff is extra and may advance branch/PR HEAD. Compare actual git tree after this commit.

## Protected release boundaries
Existing public applicant intake, src/App.jsx, src/report.css, src/lib/operations.js, src/components/WorkerLifecycleReadOnlyPreview.jsx, vite.config.js, index.html and existing Pages deployment workflow should stay unchanged. Worker lifecycle status actions in public remain permanently disabled until a distinct high-risk release decision.

This public file intentionally contains NO real applicant row, worker ID, email, phone, password, token, private SQL dump, proprietary font binary or private internal data.

## Next validation sequence
1. Refresh both Draft PRs and CI; inspect actual frontend and private SQL source.
2. Review draft SQL two migrations for compile, actual columns, transactionality, unique group worker, RLS/grants, worker self isolation, manager review and audit. Run read-only schema introspection and rollback-only isolated SQL validation where safe; do not apply.
3. Amend controlled Draft branches until all P0 checks pass; keep public code behind Draft PR with no Pages deploy.
4. Obtain new precise user authorization for applying named schema migrations to existing Supabase, then independently validate.
5. Obtain separately explicit permission for public V2 merge and Pages deploy. Verify exact workflow SHA and original form.
6. One batched authenticated browser acceptance by owner (manager+worker), actual Modam/RTL/mobile, not many separate manual tests.

## Deep handoff
Full cross-conversation history, technical inventory, SQL risk analysis, product decisions, acceptance matrix and copy/paste successor prompt are documented PRIVATELY on the existing V2 contracts branch:
- Repo: AminMirasadollahi/StudentWorkerTalentBank
- Ref: feat/integrated-operations-v2-contracts-2026-10-14
- Entry: docs/CURRENT_HANDOFF.md
- The owner will attach full SWTB 3 exported HTML to the next chat.

**Review only. No production DB mutation, no PR merge, no public Pages deployment.**
