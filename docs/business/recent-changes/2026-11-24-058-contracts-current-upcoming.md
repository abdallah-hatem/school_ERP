# 2026-11-24 — Contracts: "Current" is the contract in force; no decisions before it starts

Bug found by the owner in testing: an employee's 2026/27 contract (1 Jun 2026 – 31 May 2027) was
renewed in November; the Contracts tab then marked 2027/28 "Current" and offered Renew and Decide
on it, and the employee's contract dates jumped to 2027/28.

- **Current vs Upcoming (§3 → Contracts):** "Current" is the contract in force today. A contract
  that starts later (a renewal's next one, a new contract with a future start) shows "Upcoming ·
  starts <date>".
- **Decisions only once started (§3):** renew, not renew, the employee's notice and an early
  termination request are refused on an upcoming contract; bulk renew lists it as refused. Ending
  the contract in force still cancels the upcoming one.
- **The employee's contract dates (§3):** they name the contract in force and move to the next
  contract on its first day (the daily run), not when it is created.
- **Contract ends soon (§11):** follows the contract in force — none for a renewed contract's end.
- **Own record (§2):** nobody deactivates themselves from "To deactivate".
- **Contracts tab:** a contract is named by the year it starts in (1 Sep 2026 – 31 Aug 2027 reads
  2026/27), its dates beside it.
