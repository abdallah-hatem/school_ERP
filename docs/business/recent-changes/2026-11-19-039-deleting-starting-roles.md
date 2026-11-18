# 2026-11-19 — Deleting a starting role

A school can now delete **any role it no longer uses, except the System admin** (§2, owner
2026-11-19). Until now only custom roles could be deleted; the starting roles (HR manager, HR
officer, Accountant, Principal, Stage head, Direct manager) could only be edited.

- A role someone still holds can't be deleted. Its Delete says who still holds it ("3 users still
  hold it") and asks to take the role away from them on their user pages first.
- On the Roles screen the starting roles are marked **"Starting role"**. Deleting one asks for
  confirmation and adds a warning: future updates add new permissions to starting roles
  automatically, and a role made to replace it won't get them.
- The System admin can't be deleted and its permissions can't be changed: it always holds every
  permission. Its row has no Delete.
- A deleted starting role stays deleted: updates don't bring it back. The deletion is in the
  activity log (§9).
