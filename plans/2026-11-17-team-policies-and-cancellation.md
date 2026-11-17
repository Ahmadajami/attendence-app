# Confirm team policies and cancellation pay before wider rollout

**Status:** in progress
**Date:** 2026-11-17
**Goal:** preserve the confirmed Operations shifts and roster; establish the hierarchy and attendance policies of other groups from evidence and HR confirmation, then implement approved rules incrementally.

Bilingual plan, scope, questions and acceptance criteria: [English / العربية](../docs/team-policies-plan.html).
Companion to `2026-11-13-follow-odoo-configurable.md`, not a wholesale replacement.
No real-data extraction, database writes or engine changes were performed to create this plan.

## Decisions

| ID  | Status                                              | Decision                                                                                                                               | Why / alternatives                                                                                                                                   |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| TP1 | approved (user context)                             | Operations shifts and roster are confirmed through meetings; other groups remain unconfirmed. Preserve Operations as baseline.         | Avoid extending unverified assumptions; not a new verification of every calculation.                                                                 |
| TP2 | approved (user-reported principle); details pending | Employees are paid for qualifying cancelled planned work because cancellation is outside their control.                                | Do not treat it as automatic absence. Scope, amount, rate, effective date and overtime treatment must be confirmed; do not assume full-shift credit. |
| TP3 | pending                                             | Reopen only SP10’s claim that teams differ solely by overtime eligibility. Retain its data-start boundary.                             | User now reports uncertainty about required hours and rules across groups. Do not invent replacement policy values.                                  |
| TP4 | proposed                                            | Read-only discovery → dated hierarchy/policy approval → bounded engine changes → synthetic pilot → approved rollout, reusing this app. | A blanket rewrite risks the confirmed Operations setup; blindly copying Odoo would perpetuate unknown rules.                                         |
| TP5 | pending                                             | Required-hours basis (including reported 55 hours/week), leave-balance conversions and cancellation calculation.                       | No safe numeric default is established by this conversation. Keep unresolved rules visible.                                                          |

## Tasks

- [x] P0 Document the direction. Create this bilingual plan and record confirmed facts and pending questions. **Done when:** This document and the decisions log exist.
- [ ] P1 Read-only evidence inventory. Inventory existing Odoo/app extraction tools and October sources; prepare minimal read-only extracts for hierarchy, schedules, roster, attendance, leave and calculation settings. Do not execute real-data writes. **Done when:** Source/field map, counts, matching method and unresolved data gaps reviewed locally.
- [ ] P2 Confirm hierarchy and policies. Review proposed dated memberships and one policy worksheet per group with HR and supervisors. **Done when:** Each group has an owner, approved rules and dates, or explicit unresolved items. Cancellation and leave questions answered before their calculations.
- [ ] P3 October comparison and gap design. Reconcile roster, punches and accepted HR totals on representative cases per group. Inspect existing engine support before proposing additions. **Done when:** Explained differences, synthetic expected results and a bounded implementation design approved. No blanket rewrite.
- [ ] P4 Implement and verify incrementally. Implement approved dated rules, hierarchy changes and cancellation records in small steps on synthetic data. **Done when:** Checks pass; normal/overnight, late, early, absence, leave, overtime off/on, full/partial cancellation, reassignment, overlap, reversal and effective-date cases pass. Operations baseline stays correct except explicitly approved changes.
- [ ] P5 Pilot and controlled release. Review synthetic English/Arabic screens, pilot one confirmed group, then roll out group by group after required approvals. **Done when:** HR signs off example days and period totals; production changes are audited, reversible and reconciled.

## P1 progress — 2026-11-17

- [x] Prepare and run the read-only Odoo/app inventory, using explicit read-only transactions and private outputs.
  > note: app staff 332; active 331; departments 23; teams 27. Odoo staff 347; departments 31.
  > note: matched 302 (active 301); unmatched app 30; Odoo without unique app match 45.
  > note: active app without department 53; without team 74; departments without Odoo link 23.
- [x] Document the source/field map, exact identity matching, output safety and evidence limitations in [the inventory guide](../docs/workforce-inventory.md).
- [ ] Review the private report locally with HR: source freshness, department correspondences, unmatched employees and missing assignments. P1 remains incomplete until this review.

The available historical Odoo database was `syravia_dev`; `syravia_night_shift` was absent.
All department comparisons remain unresolved because explicit department links are missing.
No database records, policies, Operations schedules or payroll calculations were changed.

## Approval gates and regression checks

- [ ] HR confirms per-group policy sheets, cancellation scope/formula and leave-balance rules with effective dates.
- [ ] Synthetic English and Arabic screens reviewed, including RTL, daily explanations and period totals.
- [ ] Operations baseline and overnight cases remain correct except explicitly approved changes.
- [ ] Overtime on/off, partial/full cancellation, reassignment, overlap, reversal and policy-boundary tests pass.
- [ ] Real-data rollout scope/counts and undo procedure reviewed; required production approvals obtained.

Existing manual checks in earlier plans remain pending there. This document completes none of them.
Keep exports and employee-level evidence in `~/secure/syravia/`; no personal data in this plan.

## Attendance-policy interview and targeted evidence — 2026-11-17

### Decisions / clarifications

- TP6 approved (user): discover calculation groups from where people attend, rather than waiting for formal employee-team hierarchy corrections. Existing imports and records remain unchanged; historical employee matching still requires IDs.
- TP7 approved (user): porters and cabin cleaners attend the airport but have different required hours from the reported 55-hour group. Their exact requirements remain pending.
- TP8 proposed evidence hypothesis: aircraft-cleaning attendance suggests a 9-hour daytime span; porters/drivers show a shift to 12-hour day/night spans first observed on 2026-10-25. Odoo still stores 540 required minutes. This is not approval of a 12-hour requirement or any overtime formula.

### Targeted task

- [x] Compare the secure October workbooks with Odoo requirements, preserving source kinds and unidentified rows. Script: `tools/odoo/infer_airport_hours.py`; synthetic checks: `tools/odoo/test_infer_airport_hours.py`.
  > note: 12 workbooks (9 daily, 2 correction, 1 range); targeted range rows 0. Odoo department 224; job IDs 157, 195, 159.
  > note: non-off Odoo rows at 540 minutes: 1183, 368, 318 respectively. No policy change detected in stored required minutes.
  > note: 2026-10-21 aircraft-cleaning complete rows 26/26 at 540 minutes; 2026-10-25 28/28 at 540 minutes. Many rows lack IDs.
  > note: 2026-10-25 porters/drivers complete rows 42; 27 at 720 minutes; 12 at 360 minutes. 2026-10-26 complete rows 32; 28 at 720 minutes.
- [ ] HR confirms whether the porters' new longer shifts replace the old requirement or earn overtime against it, the effective date, and whether driver exceptions apply.
- [ ] HR confirms aircraft-cleaning required paid minutes, breaks and weekly rest days; do not turn a 9-hour span into a weekly entitlement without these answers.

Bilingual evidence explanation: [airport-hours-evidence.md](../docs/airport-hours-evidence.md).
No data imports, employee moves or calculation changes were made. Operations remains unchanged.

### Source clarification TP9 — user-confirmed

Odoo recorded attendance covers 21 September–20 October. Reception administrators’ Excel files
are the attendance source for 21–31 October. Odoo requirement/calendar rows dated after 20 October
are planning/configuration evidence only. They do not independently establish actual attendance
or the required paid hours after the schedule change. TP8 remains a hypothesis, not a policy default.
September remains outside this app’s import scope; this clarification authorizes no import or calculation change.

### Night guards TP10 — user-confirmed classification

The user identifies Odoo employee record IDs 861 and 862 as night guards. Their current app team
is Admin, but discovery must treat their attendance policy separately from ordinary office staff.
Excel department cells are blank; Odoo current departments are unset. No stored assignments changed.

Observed overnight Excel rows: ID 861 on 2026-10-21, 2026-10-23 and 2026-10-24; ID 862 on
2026-10-22. The 2026-10-23 span needs review. The Odoo recorded-attendance search for
2026-09-21 through 2026-10-20 found no overnight records outside Operations. Guard night work in
21–24 October is Excel evidence, not confirmation of earlier Odoo night records.

- [ ] Confirm night guards’ required hours, schedule, breaks, rest days and overtime eligibility.

حُدّد الموظفان بمعرفي سجل أودو 861 و862 كحارسين ليليين بتأكيد المستخدم. نراجع سياسة حضورهما
بشكل منفصل عن موظفي المكتب، دون تعديل الفريق المحفوظ. دليل عملهما الليلي في 21–24 تشرين الأول
مصدره إكسل؛ ولم يُظهر بحث أودو للفترة 21 أيلول–20 تشرين الأول سجلات عابرة لمنتصف الليل خارج العمليات.

### Dated rosters and Damascus drivers — TP11 / TP12

TP11 approved (user): flight teams' dated Odoo rosters are the evidence source for required hours;
employee fixed-schedule defaults alone are insufficient. The user confirms 9 required hours per
working day for Damascus porters and cleaners before 2026-10-25. Breaks, rest days and later changes
remain unresolved. Five named Damascus drivers were supplied privately for separate analysis;
names and identifiers stay in the secure evidence folder, not this plan.

TP12 proposed (evidence, not policy approval): the examined driver roster assignments and daily
requirements support 540 required minutes per working day and one weekly rest day. Four identities
are linked by identifiers; one remains a unique name-lookup candidate because its Excel ID is blank.
Do not use template start/end times for lateness without validation against actual duty schedules.

- [x] Read the target drivers' dated Odoo roster assignments and 2026-09-21–2026-10-20 daily requirements; compare their Excel attendance before 2026-10-25.
  > note: ID-linked Odoo employees 942, 1993, 1701, 941; candidate 2029. Rosters 385 and 402.
  > note: all examined non-off day requirements 540; counts 26, 26, 25, 25, 17 respectively.
  > note: complete Monday–Sunday windows usually 6 work days / 3240 minutes; 2 month-boundary windows have 5 work days / 2700 minutes.
- [ ] Confirm candidate employee 2029 against a reliable identifier before importing or assigning policy.
- [ ] Confirm driver duty start/end times, breaks, overtime eligibility and changes from 2026-10-25.

Source details and bilingual explanation: [drivers-roster-evidence.md](../docs/drivers-roster-evidence.md).
No imports, employee reassignment or calculation changes were made.

### Damascus flight groups — TP13 / TP14

TP13 approved (user): before 2026-10-25 the required weekly hours are 55 for Air Arabia,
Turkish Airlines, regular FlyDubai, Qatar Airways and Etihad Airways. FlyDubai Security and
Lost & Found require separate investigation. This confirms entitlement, not overtime eligibility,
fixed duty times or a formula for converting weekly hours into a daily payroll requirement.

TP14 proposed (Odoo evidence): Lost & Found uses pattern 50, 660 minutes/workday and two weekly
rest days; all 12 complete examined employee-weeks contain 5 workdays / 3300 minutes. FlyDubai
Security uses pattern 23, 600 minutes/workday, generally one weekly rest day (a September assignment
has two); 6 ordinary workdays imply 3600 minutes. Preserve dated individual off days and daily
exceptions instead of imposing a fixed weekly total. Employee 903 has daily pattern 9 / 660 minutes
from 2026-10-03; do not count those days as Security simply because of an earlier assignment.

- [x] Investigate Security and Lost & Found in dated rosters and daily requirements through 2026-10-20, plus identifier-linked Excel records for 2026-10-21–24.
  > note: pattern 23 daily rows 317 at 600 minutes, 53 off rows; pattern 50 daily rows 65 at 660 minutes, 25 off rows. Rosters 384/396 and 392/407.
  > note: ID 903 has 14 later workdays at pattern 9 / 660 minutes; these are excluded from Security rule evidence.
  > note: Excel matched rows per date: Security 12; Lost & Found 3. Actual clock spans vary.
- [ ] HR confirms TP14 candidate requirements and any exceptions; overtime, breaks and post-25 October policies remain pending.

Current bilingual policy register: [airport-policy-register.md](../docs/airport-policy-register.md).
No employee assignments or calculations were changed.

### FlyDubai rules TP15 — user-confirmed

Before 2026-10-25, the 12 October FlyDubai Security roster members require 10 hours per workday
and one weekly day off (normally 6 workdays / 60 hours). Regular FlyDubai requires 11 hours per
workday and two weekly days off (normally 5 workdays / 55 hours). This approves the FlyDubai
Security portion of TP14 and adds the confirmed daily/rest-day detail to regular FlyDubai in TP13.
Lost & Found remains a proposed 55-hour rule pending confirmation. Overtime eligibility, breaks,
weekly boundaries, partial-week treatment and post-25 October changes remain unresolved.
No app settings, memberships or historical calculations changed.

قبل 25 تشرين الأول، يتطلب أمن فلاي دبي للموظفين الاثني عشر 10 ساعات ليوم العمل ويوم راحة
أسبوعياً؛ ويتطلب فلاي دبي العادي 11 ساعة ليوم العمل ويومي راحة. تبقى المفقودات مقترحاً للتأكيد،
وتبقى تفاصيل الإضافي والاستراحة والفترات الجزئية والتغييرات اللاحقة معلقة.

### Lost & Found October roster TP16 — user-supplied confirmation

The user supplied the three October Lost & Found roster rows: each has 660 required minutes per
working day and two weekly off days. Odoo record 870: Saturday/Sunday; 872: Tuesday/Wednesday;
871: Thursday/Friday. Normal complete weeks are 5 workdays × 11 hours = 55 hours. This confirms
the Lost & Found roster baseline proposed in TP14. Names remain outside versioned documents.
The other numeric columns in the pasted rows have no supplied headers; they do not establish
additional policy. Post-25 October attendance changes, overtime and breaks remain unresolved;
no assignments, settings or calculations were changed.

أكدت صفوف جدول المفقودات التي قدمها المستخدم متطلب 660 دقيقة ليوم العمل ويومي راحة أسبوعياً.
السجل 870: السبت والأحد؛ 872: الثلاثاء والأربعاء؛ 871: الخميس والجمعة. يساوي الأسبوع الاعتيادي
الكامل 55 ساعة. تبقى تغييرات الحضور من 25 تشرين الأول والإضافي والاستراحة للتأكيد.

### Lost & Found duty times TP17 — user-approved

Use 10:00–21:00 as the planned Lost & Found workday in Asia/Damascus for the October baseline
being established. Required minutes remain 660, with the individual two weekly off days in TP16.
These are the approved comparison times for lateness and early departure; grace, deductions,
break treatment and overtime rules still need separate confirmation. This supersedes the pending
Lost & Found clock-time validation, not the unresolved clock times of other groups. Reconcile
post-25 October exceptions separately. No database settings or calculations were changed.

اعتمد المستخدم 10:00–21:00 بتوقيت آسيا/دمشق كدوام مخطط للمفقودات لأساس تشرين الأول الجاري
تحديده. يبقى المتطلب 660 دقيقة ويومان راحة حسب TP16. تستخدم هذه الأوقات للمقارنة عند حساب
التأخر والخروج المبكر؛ وتبقى السماحات والخصومات والاستراحات والإضافي بحاجة لتأكيد مستقل.

### Overtime TP18 — user-approved calculation and visibility

Calculate overtime for all employees. HR can later disable/hide its display without removing
or suppressing the underlying overtime calculation. Group eligibility decisions do not block
policy preparation now. This is a discovery requirement; the existing overtime switch has not
been changed and must be inspected before implementation to distinguish calculation/pay-rule
behavior from display visibility. Payroll/export treatment of hidden overtime is not specified
by this clarification. No code, settings or stored calculations changed.

يحسب الإضافي لجميع الموظفين. تستطيع الموارد البشرية لاحقاً إخفاء عرضه أو إظهاره مع الاحتفاظ
بالحساب الأساسي. لا تعطل قرارات الاستحقاق حسب المجموعة تجهيز السياسات الآن. لم يتغير المفتاح
الحالي أو الحسابات؛ وتبقى معالجة الإضافي المخفي في الرواتب والتصدير غير محددة بهذا التوضيح.

### Exits and returns TP19 — user-approved presentation; hours formula pending

Preserve and show recorded check-ins/check-outs, including exits and returns. Do not automatically
classify gaps as breaks or apply a break-specific rule; HR decides their meaning later. The user
has not yet specified whether pending gaps count in total worked hours (first-in to last-out) or
whether only individual recorded in/out segments count. Resolve that separately before changing
hour totals; no current calculation, event or setting changed.

تحفظ أوقات الدخول والخروج بما فيها الخروج والعودة وتعرض كما سجلت. لا تصنف الفترات تلقائياً
كاستراحات ولا تطبق عليها قاعدة استراحة؛ تقرر الموارد البشرية معناها لاحقاً. لم يحدد بعد احتساب
الفترات المعلقة ضمن إجمالي الساعات من أول دخول لآخر خروج أو جمع فترات الدخول والخروج فقط.
يحسم ذلك قبل تعديل الإجماليات، ولم تتغير الحسابات أو الوقائع أو الإعدادات الحالية.

### Attendance segment totals TP20 — user-approved

Sum recorded in/out attendance segments for initial worked hours. Example: 08:00–12:00 plus
13:00–17:00 = 8 worked hours. The gap remains visible and unclassified, not automatically paid
or treated as a break. HR can later enter the appropriate classification/adjustment. Preserve
raw times and distinguish recorded worked time from any later credit. This resolves TP19's pending
hours formula; adjustment kinds and approval details still need specification. No implementation
or database changes were performed.

يجمع إجمالي العمل الأولي فترات الدخول والخروج المسجلة: 08:00–12:00 مع 13:00–17:00 تساوي
8 ساعات. تبقى الفترة الوسيطة ظاهرة وغير مصنفة، ولا تدفع تلقائياً ولا تسمى استراحة تلقائياً.
تدخل الموارد البشرية التصنيف أو التسوية المناسبة لاحقاً، مع حفظ الأوقات وفصل العمل المسجل
عن الرصيد المضاف. يحسم ذلك معادلة الساعات المعلقة في TP19؛ وتبقى أنواع التسويات واعتمادها للتحديد.

### Dated lateness rules TP21 — user-approved

Keep Odoo's existing grace, lateness and deduction rules as the baseline. HR must be able to
change them from a chosen effective date, using dated rule versions rather than overwriting
historical rules. Earlier periods keep their applicable versions; future dates use the new
version. Exact baseline values and scope must be verified from Odoo's effective rules before
implementation. This confirms the dated-settings direction of SP2 for lateness; it does not
authorize production changes or historical recomputation. No code or database settings changed.

تبقى قواعد أودو الحالية للسماح والتأخر والخصومات أساساً. تستطيع الموارد البشرية تعديلها من
تاريخ سريان محدد بإصدارات مؤرخة بدلاً من استبدال القواعد التاريخية. تحتفظ الفترات السابقة
بإصداراتها وتستخدم التواريخ اللاحقة الإصدار الجديد. تتحقق القيم المرجعية ونطاقها من قواعد أودو
الفعلية قبل التنفيذ. لم تعدل الشيفرة أو إعدادات القاعدة ولم يؤذن بإعادة حساب تاريخي.

### Primary Odoo reference TP22 — user-selected screen and verified rules

The user identifies `http://127.0.0.1:8069/odoo/action-398` as the main per-employee reference.
Verified action type/tag: Attendance Control Panel / `attendance_control_panel`. Its approved-line
period summary uses `roster.line.period_summary`, with Balance = sum of daily Final − Required,
not an annual-leave entitlement balance. Preserve explicit new-app differences TP18–TP20.

- [x] Trace action 398, grace resolution, raw/net lateness, penalty application, Leave credits and the actual period-summary path; verify current configuration read-only.
  > note: active config ID 1; penalty brackets 30→60, 60→120, 120→240, above→540 minutes.
  > note: approved rows in 2026-09-21–2026-10-20 resolve to grace 12 or 15; applied-penalty rows 0; positive Leave-credit rows 149.
- [x] User requests the annual-leave credit link in TP23. Exact conversion, timing, rounding, approval and insufficient-balance handling remain unanswered in the section 8 decision form; the feature is not implemented in the app.

Detailed bilingual evidence and synthetic example: [odoo-control-panel-rules.md](../docs/odoo-control-panel-rules.md).
Executable code reads penalty brackets from raw arrival delay after testing grace, and Close Delay
credits raw delay. Earlier comments saying net delay or automatic penalty cancellation are not the
executable behavior. Loading action 398 does not recompute stored days. No mutations performed.

اختار المستخدم لوحة أودو ذات الإجراء 398 مرجعاً أساسياً. رصيدها فرق حضور/أجر وليس استحقاق
إجازة سنوية؛ وتبقى الحاجة إلى خصم فعلي من الاستحقاق السنوي للتأكيد. القواعد الموثقة تستند إلى
الكود التنفيذي لا إلى التعليقات القديمة، ولم نعدل أو نعد حساب السجلات.

### Arabic explanation of action 398

- [x] Create a standalone Arabic HTML explanation with synthetic examples and a local-only interactive calculator for grace, raw/net lateness, optional penalties, Leave credits and attendance/pay balance versus annual-leave entitlement.

Artifact: [odoo-attendance-explained-ar.html](../docs/odoo-attendance-explained-ar.html).
The calculator illustrates ordinary same-day work under the inspected Odoo rules only, not full
payroll, night shifts, rest days or the new app's rounding. No new business policy is approved
by creating the explanation. No employee records or app calculations changed.

### Annual-leave link and dual overtime values TP23 / TP24 — user-requested features

TP23 approved requirement: add a real link between HR-approved attendance credit and annual-leave
entitlement, with a traceable adjustment ledger. The earlier question of whether this feature is
wanted is resolved. Debit timing/amount, day conversion, rounding, negative-balance policy, opening
balance source, approval and reversal behavior remain pending explicit answers; no implementation
or production write is authorized by a blank form field.

TP24 approved requirement: display actual overtime and weighted overtime together, with the
multiplier and premium distinguished. Example: 20 actual minutes × 1.25 = 25 weighted minutes;
the premium alone is 5 minutes. Attendance/pay balance remains a separate figure and must not be
relabeled as raw overtime.

- [x] Update the Arabic explanation, worked-example table and calculator to show both actual and weighted overtime explicitly.
- [x] Replace section 8 with Arabic decision inputs and structured JSON copy/download; unanswered fields export as null, conditional questions remain visible when applicable, and local drafts can be restored.
- [x] Verify blank/default answers, conditional day conversion, date/numeric validation, actual/weighted values, downloaded JSON, clipboard fallback, draft restore, unavailable storage, RTL/mobile and offline behavior.
- [x] Receive the user's JSON answers and review unresolved choices; accepted details are TP25–TP28 below. Implementation and outstanding rule questions remain separate tasks.

Artifact: `docs/odoo-attendance-explained-ar.html#choices`; output filename
`attendance-policy-decisions.json`, schema version 1. JSON includes confirmed requirements,
dated applicability, annual-leave choices, overtime factors, cancellation choices, notes and
unanswered questions. Completing/exporting the form changes no system records. The Odoo calculator
remains an explanatory baseline; decision-form choices do not silently change its formulas.

اعتمد المستخدم طلب ربط رصيد التغطية باستحقاق الإجازة السنوية مع سجل تسوية قابل للتتبع، وطلب
عرض الإضافي الفعلي والمحتسب بالمعامل معاً. تبقى تفاصيل الخصم والتحويل والاعتماد وغيرها لإجابات
القسم 8؛ وتصدر الأسئلة غير المحسومة بقيمة null. لم تنفذ الميزة في التطبيق ولم تتغير الحسابات.

### Simplify the Arabic decision questions — user feedback

- [x] Rewrite section 8 as one practical Arabic question at a time, with a short scenario and consequences beside every choice; use ordinary time examples instead of unexplained policy terminology.
- [x] Keep previous/next navigation, an explicit unknown option, saved answers, conditional questions and the existing JSON schema/choice meanings. Show a plain-Arabic answer review and put the technical JSON preview behind an optional disclosure.
- [x] Verify navigation, conditional skip/back behavior, restored drafts, exact JSON meanings/download, example overtime buttons, validation, real/weighted OT and Arabic mobile/offline behavior.

No policy defaults, selected answers, calculation rules or employee records were changed by this
presentation revision. The factor example buttons only fill a value when the user clicks one.
The existing `attendance-policy-decisions-ar-v1` storage key and exported schema version 1 remain.

### JSON answers received — TP25–TP28 (2026-11-17)

Source: schema version 1 `attendance_policy_decisions`, exported at
`2026-11-17T15:13:27.286Z`, submitted by the user in chat. `completion: draft` and
`applies_changes_to_system: false` are preserved: explicit answers are recorded, blank answers
are not filled from `reference_only`. This records policy preparation, not implementation.

| ID   | User decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TP25 | Start the submitted new rules on 2026-11-01, with no specified end. Preserve October's existing baseline; do not retrospectively apply these new choices to October.                                                                                                                                                                                                                                                                                                          |
| TP26 | Annual-leave deduction is a separate HR action, for exactly the attendance-credit minutes approved; convert using that employee's scheduled required minutes for the relevant day, without additional rounding. Negative leave balance allowed. HR enters opening balances and authorized HR approves deductions. Reverse an actually posted linked debit automatically when its source is cancelled. Saving/approving attendance credit alone does not post the leave debit. |
| TP27 | HR chooses paid cancellation hours per event; those hours are eligible to participate in overtime calculation. Preserve actual attendance separately. Exact threshold/premium interaction and overlapping categories still require specification.                                                                                                                                                                                                                             |
| TP28 | Support separately changeable overtime factors for normal workdays, weekly off days and night shifts, with dated versions. Normal/off-day numeric answers are null; the note adds a night category but supplies no initial numeric rate. Reference 1.25/1.5 values are not selected answers.                                                                                                                                                                                  |

- [x] Read the submitted JSON and retain explicit decisions, unknown factors, and conditional null fields correctly. Insufficient-balance handling is not applicable while negative balance is allowed; fixed-day hours are not applicable with scheduled-day conversion.
- [x] Confirm initial normal, weekly-off and night overtime factors: Odoo defaults selected in TP29 (1.25 / 1.50 / 1.50).
- [x] Define night overtime by the night shift and anchor rate selection to the shift-start day, TP30/TP31; do not split at midnight or stack rates.
- [ ] Preserve/verify existing holiday handling when implementing the new category selector; no new holiday rule was selected by these answers.
- [x] Define off-day leave conversion: use the employee's normal required workday duration, with an optional dated company override for all employees' off-day conversions, TP32.
- [ ] Verify how to resolve an unavailable normal workday schedule or holiday-specific case; do not invent a numeric divisor.
- [ ] Define how eligible cancellation credit contributes to overtime thresholds and weighted amounts while staying separate from actual worked time.
- [ ] Implement the approved rules only through a separately scoped coding task, including ledger idempotency/audit/reversal and synthetic verification before approved production rollout.

Readable record: [policy-answers-2026-11-17.md](../docs/policy-answers-2026-11-17.md).
No code, settings, employee records, existing calculations or database schema changed.

### Overtime settings TP29 — user selects Odoo defaults

The user resolves the pending initial overtime rates by choosing Odoo's current configuration
as defaults, editable in Settings for all three requested types. Read-only verification of active
Odoo config ID 1: normal 1.25, weekly-off 1.50, night 1.50. These are now selected defaults, not
values inferred from the earlier unanswered JSON fields. Preserve the original JSON's nulls as
historical evidence; this later instruction supersedes their pending status.

Settings changes use dated versions under TP21/TP25/TP28. Submitted new rules start 2026-11-01;
earlier periods retain their applicable rules. User-selected settings defaults do not by themselves
resolve the night-time definition or category overlap/precedence. Odoo exposes a night factor but
the inspected control-panel calculation did not universally use it; adding the requested night
category remains a separate implementation task, not proof of historical night premium payments.

- [x] Confirm the three initial rates from Odoo and record the user's Settings/default requirement.
- [ ] Implement editable dated Settings for normal, weekly-off and night overtime factors after the settings/service design is scoped; show actual and weighted minutes separately.

اعتمد المستخدم قيم أودو الحالية كقيم أولية قابلة للتعديل من الإعدادات: العادي 1.25، ويوم الراحة
1.50، والليلي 1.50. لكل تعديل تاريخ سريان وتحفظ قواعد الفترات السابقة. يحسم هذا السؤال السابق
عن القيم الأولى؛ وتبقى كيفية تحديد الليل وتداخل الأنواع للتوضيح. هذا تحديث للخطة فقط، ولم تتغير
واجهة الإعدادات أو قاعدة البيانات أو حسابات الموظفين.

### Night shift and off-day conversion TP30–TP32 — user confirmations

TP30 approved: night overtime follows the night shift, not an independently chosen night-clock
window. This records the user's earlier answer to question 1.

TP31 approved: select the shift's overtime rule using the day on which it starts, in the app's
configured timezone. Keep the shift on that start day through midnight; do not choose a highest
factor or multiply night/off-day factors together. Interpretation for the example discussed:
20:00 Friday–08:00 Saturday starting on the employee's weekly off day uses that start day's off-day
factor; an ordinary working-day night shift uses the night-shift factor. The end day does not
change the rate midway. Existing holiday cases remain for verification against the selected baseline.

TP32 approved: when converting leave deductions for a weekly off day with zero scheduled required
minutes, use the employee's normal required workday hours. Add a dated Settings override that can
instead use one common off-day conversion duration for all employees. The override is optional;
without it use each employee's own hours. No shared numeric override was supplied. Example only:
if HR later chooses 8 hours globally, 1 deducted hour is 1/8 leave day for all off-day cases; with
no override it is 1/11 for an 11-hour worker and 1/10 for a 10-hour worker. This is a leave-conversion
setting, not a change to required work minutes, attendance, overtime thresholds or the off-day status.
Store the applied divisor with each posted leave adjustment so later setting changes do not rewrite
old debits or their reversals. Missing schedule/divisor data requires review rather than division by zero.

- [x] Record night-shift scope, shift-start-day attribution and employee-specific off-day leave conversion with an optional company override.
- [ ] Implement the approved factor selector and dated conversion override with synthetic overnight/off-day tests; no production writes authorized by this documentation step.

الإضافي الليلي يتبع الوردية. يختار المعامل حسب يوم بداية الوردية بتوقيت التطبيق، ولا يتغير عند
منتصف الليل ولا تجمع المعاملات. لتحويل خصم الإجازة في يوم الراحة، تستخدم ساعات يوم العمل
المعتاد للموظف، مع إعداد اختياري مؤرخ يحدد ساعات موحدة للجميع لهذه الحالات. لم يحدد رقم موحد
الآن. هذا الإعداد لتحويل الإجازة ولا يغير يوم الراحة أو الساعات المطلوبة للعمل.

### Fresh-session OpenCode handoff

- [x] Prepare a compact approved-policy snapshot and a bounded synthetic-only first implementation brief for OpenCode Go, with exact allowed files, checks and a local review prompt.

Start a fresh session from [build-handoff](2026-11-17-build-handoff.md); execute only
[brief B1](briefs/2026-11-17-b1-leave-debit.md). B1 builds/tests a pure leave-debit conversion helper;
no database or UI integration. No OpenCode process has been launched and no code committed.
The existing Go model/configuration and permissions are retained. This is a task handoff, not a
provider/privacy-policy endorsement or permission to access real data.

### Night-factor activation TP33 — user clarification

TP33 approved (2026-11-17): only the new night-overtime factor starts on **2026-10-25**,
replacing TP25's 2026-11-01 boundary for this factor alone. Guards and Operations already
have night schedules; do not create, move or redate those schedules. Use the existing
night-shift classification, with the agreed initial factor 1.50 and TP31 start-day
weekly-off precedence. This does not multiply all night attendance hours as overtime.
Other newly submitted policies retain their 2026-11-01 start. Before 2026-10-25,
preserve existing factor behavior. This records policy only; no recomputation or imports.

اعتمد المستخدم بدء معامل الإضافي الليلي فقط في 25 تشرين الأول 2026. جداول الحراس
والعمليات الليلية موجودة مسبقاً ولا يتغير تاريخها. المعامل الأولي 1.50 مع أولوية
معامل يوم الراحة حسب يوم بداية الوردية. لا يعني ذلك اعتبار كل ساعات الوردية إضافياً.
تبقى بداية السياسات الجديدة الأخرى في 1 تشرين الثاني. لم تتغير بيانات أو حسابات.
