# Student Worker Talent Bank — Operational Frontend (GitHub Pages)

**Status:** This is the real deployed React/Vite frontend for the Student Worker Talent Bank of Shahid Rajaee Faculty of Humanities, Babol (Farhangian University). Despite the legacy repository suffix `-Preview`, it is **not** a disabled mock-only intake form.

**Production site:** https://aminmirasadollahi.github.io/StudentWorkerTalentBank-Preview/

## What is operational here?

- Persian RTL applicant intake and protected application reporting.
- Authenticated worker and manager interfaces built with React/Vite.
- Candidate review, worker lifecycle and term management, schedules, direct/group work assignment, worker reports and manager approval flows.
- UI for **public general work opportunities** and **timed library-desk opportunities**. Manager creates a reusable task template, a date-scoped draft opportunity, then explicitly publishes it. Workers can claim only when the server authorizes them.
- UI release evidence: public `main@fb82a50b89cb02ba6872fc82ea9cf98a994b0964` after PR88, CI and Pages success on 2026-11-18.

## Important current operating constraints (2026-11-22)

- Database, privileged RPCs, Edge Functions, Auth secrets, migrations and release authority belong to the **private** repository and the connected Supabase project; they are not shipped to the public frontend.
- General opportunities are **date-specific**. They require an active term, a job template, capacity, and an eligible worker. In the 2026-11-22 read-only snapshot, **no worker had an explicit `eligible` term membership**, and there were 0 templates/opportunities/claims. Publishing a general opportunity alone does **not** make it claimable. Workers cannot obtain term eligibility merely from the global OBSERVE mode.
- Timed desk shifts have a global capacity limit of **two concurrent seats**, including manager-assigned shifts. Desk and general opportunities are not interchangeable.
- Claimed or scheduled work is not approved/billable time. Approved minutes require an actual submitted report and a manager decision; current totals include synthetic QA and must not be treated as payroll evidence.
- [Private PR55](https://github.com/AminMirasadollahi/StudentWorkerTalentBank/pull/55) and [public PR89](https://github.com/AminMirasadollahi/StudentWorkerTalentBank-Preview/pull/89) for partial onboarding recovery are **drafts, not deployed**. The Edge-first/Pages-second gate must be respected.

## Repository responsibilities

- **This public repository:** the running frontend, public CI/Pages workflow, feature flags, UX components and client-side tests. A push to `main` **triggers a GitHub Pages deployment**.
- **Private `AminMirasadollahi/StudentWorkerTalentBank`:** canonical product roadmap, release ledger, backend security contracts, migration sources, operating runbooks and decision history. Historic `src/` files there must not be assumed to match today's deployed UI.
- Never commit student contact lists, application exports, invitation tokens, service-role credentials or unapproved worker details to either repository.

For the current Persian roadmap and the full manager work-opportunity operating guide, follow the private repository's `README.md` → `docs/DOCUMENTATION_INDEX.md` (requires repository access).

## Local development

```bash
npm install
npm run dev
npm run build
```

A dependency lockfile and `npm ci` migration are a separate future engineering change; do not assume the present build is dependency-byte-reproducible.

**Documentation-only correction:** This README replaces obsolete claims that submissions were disabled. It does not grant permissions, enable a new production feature, deploy backend code or assert completed real-student acceptance.
