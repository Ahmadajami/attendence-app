# Open questions for HR

Until HR answers, the new module keeps the **old behaviour** (the "Default"
column). Each answer goes into `DECISIONS.md` with the date and who answered.

| # | Question | Why it matters | Default until answered |
|---|---|---|---|
| Q1 | Should a worked holiday use the **holiday factor (2.0)** or keep **1.5**? | The 2.0 factor is configured but never used (P4) | 1.5 (old behaviour) |
| Q2 | Should unpaid leave ("UL") be **paid leave** or **unpaid off**? | Today UL maps to paid leave (P6). Only 1 Odoo leave exists in the data, so HR mostly sets states by hand | Paid leave |
| Q3 | Should the **night OT rate** and a **night premium** be used, and for which departments? | Both are new; the old night factor was "reserved" | Off |
| Q4 | Should company public holidays from the Odoo calendar **create holiday windows automatically**? | The old sync is broken (P1): creating a company-wide time-off errors | No automatic sync; holidays entered in the module |
| Q5 | Do **teams** already exist informally (shift crews, station teams)? Who are the **supervisors**? | Teams and supervisors are new; approvals and visibility depend on them | No teams; HR approves |
| Q6 | Should **swaps between two employees** also be limited to week or month scope? | The brief adds scope to self off-day changes only | No scope limit for employee swaps |
| Q7 | Should **banked OT** (from the "subtract negative balance from OT" flag, 19 employees) become a stored balance? | Today it is only printed in the Payroll notes and lost afterwards | Not stored |
| Q8 | For a department or employee with **OT switched off**, is extra time **unpaid** or **paid flat at 1.0×**? | New feature (brief §9.7) | Unpaid (shown, not paid) |
| Q9 | A worked **plain** (not overtime-eligible) holiday shows **OT 0** but pays **Final = worked × 1.5** (R9). Is that intended? | Inconsistent figures on one row | Keep (same numbers as today) |
| Q10 | Who are the **HR Approver(s)** and what may they approve (swaps, off-day changes, manual day changes, period close)? | New group between HR Officer and HR Manager (DECISIONS D5) | HR Approver approves swaps, off-day changes and pay-affecting day changes; cannot approve own submissions; no configuration |
| Q11 | May **small corrections** (e.g. a time correction under N minutes) skip approval? | Every pay-affecting change needs approval by default (D6) | No bypass |
| Q12 | Should employees get **Odoo logins** for self-service requests? | Today only 3 internal users exist. Logins require the security fixes P19/P20 first | No employee logins |
| Q13 | **Rotation groups are not used** (0 in the data). Are they planned, or can the rebuild give them low priority? | The brief rebuilds them as team rotations (§9.5) | Rebuild, but after the core |
| Q14 | Is the **Excel roster template** (export, fill, import) still used? | The Svelte builder replaces the OWL builder; the template import also rejects more than 2 off days (P9) | Not rebuilt unless HR uses it |
| Q15 | Which overview screens are needed: **Attendance Dashboard**, **Attendance Overview**, **Custom Period Report** (by sub-roster)? | Overlapping screens; rosters disappear, so "by roster" becomes "by team / department" | Overview kept; Dashboard merged into it; Custom Period Report by team/department |
| Q16 | Which figure does payroll really pay: **Σ daily Deduction/Extra Pay** (the money column of both reports) or the **gated "Payable OT"** in the Payroll notes (OT paid only when the period's required time is met)? | The two differ for anyone with OT and a net shortage (DIFF §4) | Σ daily Deduction/Extra Pay (what the money columns print today) |
| Q17 | The Period Balance shows Shortage **including leave and sick credit**, so its Balance differs from the Payroll for those employees (DIFF §4, D6/D7). Keep this difference? | Two "balances" for the same person | Keep (same numbers as today) |
| Q18 | 26 punches are **future-dated** (up to 2026-11-08), probably a day/month swap at import. Should they be corrected or deleted at the facility? | They already feed 26 future day rows | Leave as they are; the new import rejects future dates |
