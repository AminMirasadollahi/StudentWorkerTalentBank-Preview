# Operations V2 — public-safe handoff, 2026-10-14 (NO DEPLOY)

## SWTB4 — worker profile change receipt hardening (2026-10-14)

- In `src/OperationsWorkspace.jsx`, a worker's `WorkerSelfProfile` correction request now accepts success only after `ops_request_profile_change` provides `ok:true` plus `request_id`, and immediately locks double-submits before the React disabled state updates.
- An acknowledged field-specific request receipt is kept **in memory**, worker-scoped, across navigation among worker tasks, schedule and self-profile. An older/stale queue cannot make the same correction request resubmittable; another supported field remains independently editable. Only an authoritative, newly read `approved` or `rejected` status for the **exact acknowledged request ID** releases that field lock.
- A successful server ACK followed by denied/stale profile-history read does not produce a false request-failure message. Self-profile PII remains hidden on independent read failure; retry restores only authorized identity/history.
- Four new fully synthetic React tests cover immediate double-click, stale queue and tab re-entry, post-commit read denial, server RPC rejection/retry and exact reviewed-receipt release. [CI 38536138698](https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/38536138698) on source/test SHA `39518ffde7a244ba4b828d9499e6ec24906c5e81` **84/84 PASS, 0 FAIL, Vite build PASS, no Pages deployment**.
- No new database tables, frontend public intake edits, real applications, authentication settings or operations lifecycle changes. Private deep technical evidence: `docs/OPERATIONS_V2_SWTB4_PROFILE_CORRECTION_ACK_LOCK_2026-10-14.md` on private Draft PR #6.
- This is NOT an end-to-end idempotency guarantee for a lost ACK, and live production JWT/grant/backup gates remain open. Both V2 PRs must stay Draft until owner separately approves SQL and later web release.


## SWTB4 — worker task reporting retry/ACK and profile-read safety (2026-10-14)

- Real worker task card now distinguishes **successful server ACK** from a later failed/stale read. An ACK permanently disables re-submitting the **same review cycle** from an old card; the first successful start action is also one-shot and does not block eventual reporting. A synchronous lock blocks rapid double submits.
- Retry after an unsuccessful transport/RPC retains the **same UUID** rather than creating a new report ID. An in-memory per-worker receipt ledger keeps this ACK and the pending submission UUID when switching between `کارها`, `زمان حضور` and `پروفایل من`. Nothing is persisted to browser storage by this feature.
- A truly new manager correction cycle (`review_state='changes_requested'` **or** `review_state='rejected'`) reopens reporting using a new UUID, without re-sending the previous acknowledged report.
- The independent worker self-profile and correction-history RPCs now fail closed together: a rejected or malformed read clears the previous personal data, displays only a focused warning and provides retry; late obsolete reads cannot repopulate private fields.
- The pre-existing SQL contract `ops_submit_time_v2` checks a unique `client_submission_id` and supports `replayed:true` for same worker+task UUID on retries. This is source inspection, NOT a live authenticated backend test; full-browser reload and ambiguous offline/network scenarios still warrant end-to-end verification.
- Latest **verified code/test SHA** `9e8bdb72231fc9718a3c953c7dcf994ca120d47f`: [review-only GitHub Actions 38534589693](https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/38534589693) **80/80 PASS, 0 FAIL, Vite build PASS, intake-lock PASS, NO Pages deploy**.
- Full technical provenance/runbook is in PRIVATE Draft branch `docs/OPERATIONS_V2_SWTB4_WORKER_REPORT_REPLAY_AND_PROFILE_READ_SAFETY_2026-10-14.md`. Neither real applicant intake nor auth/lifecycle/database has been modified; DDL and public-release authorizations remain separate mandatory HOLDs.


## SWTB4 manager decision reliability — latest review-only result (2026-10-14)

- Time review (`ApprovalCard`) and worker profile correction review (`ProfileChangeReview`) now **separate an acknowledged server mutation from later read/refresh errors**. Synchronous decision locks stop rapid double clicks and keep the same mounted card locked even if the backend projection is stale; badges update to «تصمیم ثبت‌شده». A genuine RPC rejection remains a retryable error. A failed read still invokes the previous fail-closed manager panel gate.
- Real React UI tests with fully mocked no-network RPCs added four cases: repeated time approval, repeated correction approval, acknowledged review then denied refresh, and retryable server-side rejection. A temporary CI failure was traced to a test-only fixture resetting an explicit denied state; corrected and rerun.
- Latest tested code HEAD **`4d23dfc1da04d00a980ec5566a891a4943b8ee88`**. [GitHub Actions run 38532439379](https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/38532439379): **71/71 React and utility tests PASS, 0 fail, Vite build PASS, NO PUBLIC PAGES DEPLOY**.
- Cross-repo private detailed report: `docs/OPERATIONS_V2_SWTB4_MANAGER_DECISION_IDEMPOTENCY_2026-10-14.md` (private Draft PR #6 branch). No real applicant data, private SQL, tokens or proprietary font in this public handoff.
- **Still HOLD:** Both PRs Draft/unmerged, live main/applicant form remains untouched. Live V2 SQL unapplied. No backup/recovery attestation, live role/JWT verification or independent release authorization.


## SWTB4 latest safety continuation — 2026-10-14

- A read/auth refresh denial in real manager or worker React now **clears previous operational data**, hides sensitive panels and presents retry rather than continuing to show old tasks/reviews/profiles.
- Late successful responses from an older request are ignored if a newer read has already superseded them. No changes to the existing focus-resume Auth protection or persisted section selection.
- New synthetic React regression tests include manager/worker denied read, recovery after retry and out-of-order successful/denied fetches; current Draft CI [38530212202](https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/38530212202) **67/67 PASS, 0 fail, Vite build PASS, NO DEPLOY** on code SHA `a51c89565d2942b14b766fa106cf806ccfcb2ed7`.
- Private Draft SQL profile tests now cover approval of full name, rejection and subsequent approval of major while retaining immutable original application data; isolated PostgreSQL 16+17 CI [38529603618](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/actions/runs/38529603618) passed. Full worklog: PRIVATE `docs/OPERATIONS_V2_SWTB4_CONTINUED_SECURITY_UI_2026-10-14.md`.
- **No production changes:** V2 database migrations unapplied, public main untouched, worker lifecycle unchanged, both PRs remain Draft. Live Supabase grants/JWT/race/recovery checks and separate owner authorizations are still required.


## SWTB 4 follow-through — verified 2026-10-14 (newer than the original handoff)

- Public V2 UI protection patched on Draft-only branch: `TaskAssignmentEditor.jsx` now distinguishes a **committed** successful task/group RPC from a later failed list refresh, and disables duplicate submit. New synthetic React regression verifies exactly one RPC despite subsequent attempted resubmission.
- PUBLIC review-only CI **SUCCESS** on app/test SHA `931723dbccd2d3119a3ece49e6e81dcb9511380b`: https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/38524864584 . This is **not** a Pages deploy or real authenticated DB test.
- Related PRIVATE SQL Draft PR #6 received security/correctness hardening (group-member uniqueness; active units; ready/active worker guards; pending-first identity correction queues) and independent ephemeral **PostgreSQL 16** compile/negative-role/atomicity/legacy-data tests **SUCCESS** at https://github.com/AminMirasadollahi/StudentWorkerTalentBank/actions/runs/38525285993 . The PostgreSQL job uses synthetic records ONLY, no live Supabase connection.
- Read-only Supabase migration inventory confirmed **NEITHER V2 migration applied**; public LIVE main remains at `3d1cbfcdc03529ffab42f2f4ae2139db4169b8ca` at this checkpoint. Browser-facing new RPC calls must not ship ahead of server verification.
- The full detailed SWTB4 engineering worklog lives in the PRIVATE V2 branch under `docs/OPERATIONS_V2_SWTB4_SECURITY_AND_TEST_PROGRESS_2026-10-14.md`. No real student data or credentials are copied here.
- **No new owner authorization for production DDL, account changes, PR merge or public deployment.** Remaining gates: exact live function/grant/RLS review, recovery/backup evidence, deployment rehearsal/safe authenticated checks, then separate DB and Pages approvals.

---


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
