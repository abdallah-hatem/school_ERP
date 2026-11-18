# 2026-11-18 — Sign-in limits

Sign-in limits (§2, §7, §9, owner): **5 wrong passwords within 15 minutes lock that
account's sign-in for 15 minutes** — per account, not per computer; an unknown email the same.
While locked, every attempt (the right password too) gets "Too many attempts. Try again in N
minutes." A correct sign-in clears the count. The forced new-password screen and My account's
password change have the same limit. A System admin can unlock an account early from Users
(⋯ → Unlock sign-in, or the user's page). Lockouts and unlocks are in the audit log. The numbers
are settings (5 / 15 / 15). Old counts are cleaned up nightly at 03:00.
