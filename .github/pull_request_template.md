## What and why

<!-- What this PR changes and why. Link the ticket. -->

Business rule: <!-- § in docs/BUSINESS_LOGIC.md, or "none" -->

## Tests

Command: `...`
Result: <!-- pass / counts -->

Edge cases covered:
- 

## Screenshots

<!-- UI changes. New or visually changed screens: light/dark × EN/AR. -->

## Checklist

- [ ] One task, under ~400 changed lines (or explained why not)
- [ ] `lint`, `typecheck` and tests pass
- [ ] Every new string in both `en` and `ar`
- [ ] Migration included for schema changes; no applied migration edited
- [ ] No school name, school-specific rule or hardcoded setting in code
- [ ] Nothing duplicated that already exists in `common/`, `shared/` or another module
- [ ] Permissions enforced on the backend
- [ ] Events emitted only after commit; listeners idempotent
- [ ] `docs/BUSINESS_LOGIC.md` updated if a business rule changed
