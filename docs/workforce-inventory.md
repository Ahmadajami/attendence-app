# Read-only workforce evidence inventory · حصر أدلة الهيكل للقراءة فقط

Supports P1 of [the team-policy plan](../plans/2026-11-17-team-policies-and-cancellation.md).
The report is evidence for HR review; it does not approve policies or correct either system.

## Run locally

```bash
python3 -I tools/odoo/workforce_inventory.py --month 2026-10
```

Defaults: Docker `odoo-db`, Odoo database `syravia_dev`; Docker `attendance-app-db`, app database
`attendance_app`. `syravia_dev` was the available historical source on 2026-11-17;
`syravia_night_shift` was absent. Confirm source freshness with the data owner before trusting
the inventory as current. Override with `--odoo-db <database>` / `--app-db <database>` if needed.
No `.env`, API keys or passwords are read by the script.

Each source is read inside its own repeatable-read, read-only transaction, ending in rollback.
The two snapshots are sequential, not a distributed snapshot. No imports, roster changes,
employee moves or payroll recomputation occur. Invalid/incompatible schemas fail the extraction.

New output directory: `~/secure/syravia/inventory/<UTC timestamp>/` (700; files 600).
Only counts and the report path print to the console. No existing report is overwritten.

| Output                | Purpose                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `report.html`         | Offline bilingual overview: sources, counts, departments, teams, locations, configured-hour groups, October roster groups and coverage |
| `employee-review.csv` | Private employee mapping worksheet with blank HR decisions and approval fields                                                         |
| `evidence.json`       | Minimal source records and settings used for review; no contact, identity-document, salary or credential fields                        |
| `summary.json`        | Counts, extraction time, source database names and limitations                                                                         |

Never attach these private files to a commit, paste employee rows into chat, or send them to a
delegated provider. Open the report locally; discuss counts and record IDs only.

## Source and field map

| Evidence                           | Odoo source                                                                                                                                     | App source                                                      | Limitation / review                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Department hierarchy               | `hr_department.id,parent_id,name,manager_id`                                                                                                    | `department.id,parent_id,name_en,name_ar,odoo_id`               | No name-based automatic matching; external department IDs are missing in the current app inventory               |
| Current employee placement         | `hr_employee.current_version_id` → `hr_version.department_id,work_location_id,resource_calendar_id`; `hr_employee.parent_id`                    | `staff.department_id,team_id`; `team.department_id`             | Current placements do not establish October history; no historical department/location assignments reconstructed |
| Dated team and pattern evidence    | October `roster_shift`, `roster_employee_line`                                                                                                  | `staff_team_membership`, `pattern_assignment`, `staff_schedule` | Odoo roster groups and app teams are different concepts; review before mapping                                   |
| Hours and planned shifts           | Employee `weekly_hours,fixed_required_minutes,use_fixed_schedule`; `resource_calendar`; `roster_shift_pattern`; daily required/start/end groups | `pattern`, `shift`, assignment dates                            | Configured values may be placeholders; no weekly entitlement inferred from attendance or pattern length          |
| Overtime and lateness              | Employee flags; `roster_overtime_config`; daily `suppress_ot,tardiness_applied` counts                                                          | `pattern_pay_rule`, `attendance_rule`                           | This extracts settings, not every calculation path; inherited effective policy is not resolved by this script    |
| Attendance/leave evidence coverage | Per-department `roster_line` date range, punched/off/leave-state counts                                                                         | No employee-day export in this first inventory                  | Not raw punch verification or leave-balance reconciliation; reserve those for representative P3 cases            |
| Cancellation pay                   | No inferred mapping                                                                                                                             | No changes                                                      | Scope, formula, approvals and effective date remain pending HR confirmation                                      |

## Identity matching and unresolved cases

Match Odoo `hr_employee.barcode` exactly against app `staff.legacy_badge_no`.
Only when the legacy badge is empty, use `employee_no` as the fallback. Never match by employee name.
Duplicate Odoo badges, two app records claiming the same Odoo employee, or a conflicting nonempty
`staff.odoo_id` stay unresolved. Active and inactive records are retained and marked separately.
Odoo records without a unique app match are retained in the evidence; no one is excluded silently.

Department comparison requires the app's explicit `department.odoo_id` link. All 23 app departments
lacked this link in the initial snapshot, so department comparison is unresolved for every employee.
The zero confirmed differences therefore does **not** mean that all departments agree.

Initial counts (2026-11-17): app 332 staff / 331 active, 23 departments, 27 teams;
Odoo 347 staff, 31 departments. 302 app staff matched (301 active); 30 unmatched.
45 Odoo staff lacked a unique app match. 53 active app staff had no department;
74 had no team. Missing teams can be intentional under personal/department patterns.
Counts include records outside October; they do not establish October payroll eligibility.

## HR review · مراجعة الموارد البشرية

1. Confirm the historical Odoo database's freshness. Confirm each proposed department correspondence
   using parent chains and employee membership, not labels alone.
2. Review unmatched records and missing departments. Do not automatically activate, import or move anyone.
3. Review team membership against department/personal schedules; an empty team is not automatically an error.
4. Fill the worksheet's HR group, required hours, overtime, cancellation, leave-adjustment,
   effective-date and approver fields. Preserve the confirmed Operations shifts and roster.
5. Keep unresolved rules explicit; discuss counts/IDs here and retain personal details locally.

6. نؤكد حداثة قاعدة أودو التاريخية، ثم نراجع تطابق الأقسام بسلسلة الآباء وعضويات الموظفين، وليس الأسماء وحدها.
7. نراجع السجلات غير المربوطة والأقسام الناقصة دون استيراد أو تفعيل أو نقل تلقائي لأي موظف.
8. نراجع عضويات الفرق مع الأنماط الشخصية وأنماط الأقسام؛ غياب الفريق لا يعني وجود خطأ بالضرورة.
9. نملأ المجموعة والساعات والإضافي والإلغاء وتسوية الإجازة وتاريخ السريان وصاحب الاعتماد في الجدول، مع الحفاظ على ورديات العمليات وجدولها المؤكدين.
10. تبقى القواعد غير المحسومة واضحة. نتداول الأعداد والمعرفات هنا وتبقى التفاصيل الشخصية محلياً.

## Verification

```bash
python3 -I -m unittest discover -s tools/odoo -p test_workforce_inventory.py
```

Synthetic tests cover exact/fallback matching, duplicate badges, shared claims, external-ID conflicts,
missing keys, formula-safe CSV output, output-location refusal and read-only snapshot parsing.
No Svelte files or database schema changes are involved.
