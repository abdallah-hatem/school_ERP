# 2026-11-19 — Monthly money cap

Money cap (§3, §6, owner): a salary, an insured salary and each payroll adjustment are at most
**EGP 1,000,000.00 a month**. Saving more is refused with "At most EGP 1,000,000.00 a month." (the
form and the API both check). It catches typos such as extra zeros and keeps every payroll line and
its taxes inside what the system can store (the worst-case pass of 2026-11-19 found a failed save
and missing taxes for amounts in the tens of millions).
