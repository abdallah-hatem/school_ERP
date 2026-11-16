# School ERP — project overview

Status: **pre-discovery.** Nothing here replaces what we learn in the stakeholder meeting; it
records the decisions we have made so far. Last updated 2026-11-14.

## What we are building

An ERP for one school (our first client), built so we can later sell it to other schools with
small per-school adjustments.

- **Client job first, product later.** The first school pays for v1. Later schools get the same
  system, configured for them.
- **Sold as a licence, not as code.** Each school pays once for the system and then a monthly fee
  for servers, tools, support and maintenance.
- **English and Arabic from day one.**

## Team

| Person | Role | Owns |
|---|---|---|
| Abdallah | Lead developer | Architecture, infrastructure, shared code (`core/`, `common/`, `shared/`, `packages/`, schema, deploy), final review on shared code, technical scope calls |
| Tamer | Developer | Business modules, end to end (backend + frontend + tests) |
| Waleed | Developer | Business modules, end to end (backend + frontend + tests) |
| Hafez | Operations | Implementation, project management, QA, client training (exact split with Arousi to agree) |
| Arousi | Operations | Implementation, project management, QA, client training (exact split with Hafez to agree) |

- **One person from operations is the single point of contact with the school** and owns the
  backlog. The other owns QA on staging and onboarding (data migration, staff training).
- Module assignments are set after v1 scope is known. The lead takes a lighter module load because
  infrastructure and reviews take time.

## Rhythm

- Weekly sync of all five: what shipped, what's next, blockers.
- Weekly or biweekly check-in with the school, run by the operations contact; the lead joins when
  scope is discussed.
- Releases to the school on a fixed rhythm (e.g. every two weeks).

## Order of work

1. Stakeholder meeting → notes on pains, users, rules.
2. Scope v1 → which modules, which users (staff only, or a parent portal too).
3. Business logic doc (`docs/BUSINESS_LOGIC.md` + `docs/business/`) → the school's rules.
4. System design (lead) → modules, core schema, roles and permissions, settings list, deployment.
5. UI design → design system and key screens (three directions, we pick one).
6. Foundation (lead) → repo, auth, roles, settings, feature flags, i18n, one example module, CI,
   staging.
7. Modules in parallel.

Design the foundation in full; design each module just before it is built.

## Open items — settle before signing with the school

- [ ] **IP in the client contract:** the school receives a licence to use the system; we keep
      ownership of the code and the right to sell it to others. Possibly a no-compete promise for
      their area in exchange.
- [ ] **Ownership between us:** the code belongs to a shared entity (company or written
      partnership), not to whoever wrote each part.
- [ ] **Money split:** one-time fee and monthly fees; what happens if someone leaves.
- [ ] **Decision-making:** who has the final call (overall, or one per area: tech vs. client/business).
- [ ] **Hosting per school:** on our server (we control updates) or the school's.

## Questions for the stakeholder meeting

- What hurts most today? (fees chasing, report cards, parent complaints, attendance…)
- What do they use now — Excel, paper, an old system? Is there data to migrate?
- Who will use it day to day: admin, accountants, teachers, parents? Is there a parent portal/app?
- Curriculum(s), number of students, number of branches (now: one).
- Fees: items, instalments, discounts, late rules, payment methods (cash, transfer, card, Fawry, InstaPay).
- Grading: scale, exam types and weights, report card format.
- Who signs off on the project?

Bring one operations person and one developer: the developer can tell on the spot when a request is
a setting and when it is a new module.
