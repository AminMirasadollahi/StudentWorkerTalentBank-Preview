# Student Worker Talent Bank — operational frontend

This repository is the **live React/Vite frontend** of the Student Worker Talent Bank for Shahid Rajaee Faculty of Humanities, Babol, Farhangian University. The repository suffix `-Preview` is historical: this is **not a mock-only site** and form submission is not generally disabled.

**Live GitHub Pages:** https://aminmirasadollahi.github.io/StudentWorkerTalentBank-Preview/

## Runtime responsibilities
- Persian RTL applicant intake and protected reporting; authenticated worker and manager workspaces.
- Authorized candidate review, worker lifecycle, term and scheduling views, work assignment, worker time reports and manager review.
- Manager-publication and worker-selection interfaces for date-scoped general work opportunities and timed library-desk opportunities. Actual eligibility, capacity and claim decisions are **server-side**; displaying an offer does not authorize a claim.
- Frontend flags, component tests, GitHub Actions CI and production Pages deployment. Merging to public `main` triggers Pages build/deploy.

The private repository [StudentWorkerTalentBank](https://github.com/AminMirasadollahi/StudentWorkerTalentBank) owns product rules, backend SQL/Edge source and decisions. The **deployed Supabase database and Edge configuration** remain authoritative for live data and permissions; private historical `src/` and old documents may not match this frontend.

## Current engineering and acceptance boundary (24 November 2026)
- The last feature release before this README correction was **PR95**, public `main@a9ebc0b2027e6e5619c640af22269f401284bb40`, with [Pages deployment 45210168778](https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/actions/runs/45210168778) SUCCESS. It visually selects today's Tehran date in the worker month view without opening a write dialog.
- The 10,000-character description and paused/unclaimed manager correction were deployed in the coordinated PR58/PR94 backend+frontend release on 23 November. The actual previously truncated description requires owner-supplied full text and an authorized pause/edit/republish; it **was not reconstructed** automatically.
- **Do not confuse deploy verification with human acceptance.** Engineering and human testing follow **independent, linked tracks**. The owner can review in a later desktop session without halting unrelated safe development. [Dual-track policy](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/blob/main/docs/SWTB20_DUAL_TRACK_DEVELOPMENT_AND_HUMAN_ACCEPTANCE_2026-11-24_FA.md) · [human acceptance queue](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/blob/main/qa/manual/SWTB20_HUMAN_ACCEPTANCE_QUEUE_2026-11-24_FA.md) (private repo, access required).
- Secure partial-onboarding recovery **PR55 (private Edge)** and **PR89 (public UI)** are still **Draft/not deployed**. The live onboarding Edge remained v3 at the last verification, and the authorized deploy was blocked by the available tool. **Do not merge PR89 before a verified Edge-first release.**
- Work selection requires explicit active-term eligibility and other server permissions. Historical counts such as "zero eligible workers" or "zero offers" are time-specific observations, **not permanent system rules**.
- Planned presence, task estimates, submitted time and manager-approved time are different facts. Approved aggregates can include historical QA activity and must not be treated as payroll totals without reconciliation.

## Security and deployment
This repository must **never** contain private student records or contact lists, invitation URLs, passwords, JWTs, Supabase service-role/secret keys or SMTP credentials. The frontend uses only intended public configuration and authorized RPC/Edge contracts. Never grant privileges via client UI changes.

A successful commit/CI or PR merge is not proof the public Pages site deployed: check the **exact SHA and both build/deploy jobs**. For sensitive backend work, check the real migration/Edge source and role permissions separately. Real-worker acceptance remains another independent state.

## Local development

```bash
npm install --no-audit --no-fund
npm run dev
npm run build
```

At this snapshot, a committed dependency lockfile was not found; `npm install` is not a byte-for-byte reproducible dependency installation. Adding a lockfile and adopting `npm ci` should be handled in a separately tested engineering PR.

## Documentation
- [Private development roadmap and dual-track policy](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/blob/main/docs/SWTB20_DUAL_TRACK_DEVELOPMENT_AND_HUMAN_ACCEPTANCE_2026-11-24_FA.md)
- [Live release ledger](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/blob/main/docs/SWTB_RELEASE_LEDGER_CURRENT.md)
- [Repository and PR triage](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/blob/main/docs/SWTB20_PR_AND_REPOSITORY_TRIAGE_2026-11-24_FA.md)

**Documentation-only change:** this file updates the description of an *already-operational* site; it does not change Auth, worker permissions, SQL, form behavior, claims or approved minutes.
