# Odoo employee control-panel rules · قواعد لوحة حضور الموظف في أودو

Checked 2026-11-17 against database `syravia_dev` and its mounted add-on source. Read-only;
no employee records were changed or recomputed. Main reference requested by the user:
<http://127.0.0.1:8069/odoo/action-398>.

Arabic learning page with worked examples and an offline calculator: [الشرح المبسط بالعربية](odoo-attendance-explained-ar.html).

## English

### The reference screen

Action 398 is the client action `attendance_control_panel`, backed by `roster.control.panel`.
Its per-employee date-range view reads **approved** roster lines. Duplicate employee/date lines
are grouped into one displayed day, but the totals include all approved lines, including duplicates.
Loading the screen reads stored figures; it does not recompute them. Thus stored historical figures
can differ from a fresh evaluation of the current engine. This is the primary comparison target,
not an assumption that every other Odoo report uses identical presentation.

### Grace and late arrival

Effective grace is the first applicable value:

1. Employee personal grace, if greater than zero.
2. Employee department grace, if greater than zero.
3. Roster employee-line grace when the day has a roster line; zero here means zero grace.
4. For fixed-schedule fallback days, the working calendar's positive grace.
5. Otherwise 15 minutes.

The approved rows examined for 21 September–20 October resolve to 12 or 15 minutes; therefore
"Odoo grace is always 15" would be incorrect. This is a current-settings inspection, not proof
that historical grace settings have never changed. Company-calendar fallback also exists when
an employee lacks a calendar.

Raw lateness is the time after scheduled start. Displayed `late_minutes` is
`max(0, raw lateness − grace)`. If arrival is late but still within grace, the **whole arrival
gap** is forgiven and added to paid time, reducing shortage without creating overtime.
If raw lateness exceeds grace, this forgiveness is zero: grace does not remain a partial credit.
The early-out indicator is also reduced by grace, but this indicator alone is not a credit to
worked/paid time. Do not infer paid early departure from that indicator.

### Optional additional lateness penalty

Once raw lateness exceeds effective grace, the current active configuration uses:

| Raw arrival delay, before subtracting grace | Additional penalty minutes |
| ------------------------------------------- | -------------------------: |
| Up to 30 minutes                            |                         60 |
| More than 30, up to 60                      |                        120 |
| More than 60, up to 120                     |                        240 |
| More than 120                               |                        540 |

The bracket is calculated, but its penalty is deducted from Final Works **only when
`tardiness_applied` is enabled**. It defaults off; no approved rows examined in the above period
had it enabled. The control panel itself does not offer this checkbox in its editable fields;
other roster tools expose it. Ordinary missing-time shortage can still reduce pay while the
additional penalty is off. It is incorrect to say that an unchecked penalty means no deduction.

On a normal day with late arrival beyond grace, excess worked minutes are treated as flat
make-up time rather than overtime with a premium, even if the extra bracket penalty is not applied.
That behavior is separate from the new app requirement to calculate overtime for everyone.
The normal factor currently is 1.25; worked weekly-off time uses 1.5. A configured holiday/night
factor alone does not mean the control-panel engine uses it in every branch.

### Credits and the meaning of Balance

The control panel has numeric **Leave**, **Sick** and **Mission** credit-minute inputs. These
add paid credit to the attendance calculation; raw punches remain unchanged. Credits reduce
shortage and do not create overtime minutes. A full-day leave/mission/sick manual state pays the
required day in the normal payroll branch; partial credits are minute amounts.

The separate bulk **Close Delay** action selects genuinely late attendance days, credits the
**raw arrival delay**, and optionally caps the credit at HR's entered amount. Despite older
comments referring to net lateness or automatically disabling penalties, the executable path
uses raw lateness and does **not** clear `tardiness_applied`. The control-panel credit editor
likewise does not clear that checkbox. A pre-existing manual penalty therefore needs explicit
review; do not assume adding leave credit removes it.

The control-panel daily deduction/extra-pay value is `Final Works − Required` (with special
zero-value handling for ignored/unpaid-off days). Its summary is:

- Top **OT**: sum of positive daily deduction/extra-pay values, including weighting/credits.
- Top **Shortage**: magnitude of negative daily deduction/extra-pay values.
- **Balance**: top OT minus top Shortage, equal to the sum of signed daily adjustments.

Thus top OT is not necessarily the sum of raw overtime minutes shown on the day rows.
The displayed Balance is an **attendance/pay time balance**, not an annual-leave entitlement.
In the inspected control-panel/roster/credit path, no automatic annual-leave request or allocation
deduction was found. Wording in old comments about "charging leave balance" is not proof of an
implemented annual-leave ledger. Validating an actual Odoo Time Off request can mark roster days
as leave through the separate `hr.leave` sync; entering a panel credit is a different operation.

### Synthetic example

Planned 10:00–21:00, required 660 minutes, grace 15, actual 10:21–21:00, no breaks/other credits:

| Result                                                       | Minutes |
| ------------------------------------------------------------ | ------: |
| Raw lateness                                                 |      21 |
| Displayed late minutes                                       |       6 |
| Worked/Final with extra penalty off                          |     639 |
| Daily balance with extra penalty off                         |     −21 |
| Optional bracket penalty if HR enables it                    |      60 |
| Daily balance if penalty enabled                             |     −81 |
| Daily balance after adding 21 Leave credit, with penalty off |       0 |

No annual-leave entitlement is automatically reduced by that credit in the inspected path.

### Source map

Source root: `/home/xxskullxx/Documents/Syravia-projects/Roster/custom_addons/roster_attendance/`.

| Behavior                                         | Source                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Action, data scope, editable credits and summary | `models/attendance_control_panel.py`, `panel_get_data`, `_build_row`, `panel_save`, `_SAVE_FIELDS`                               |
| Grace, raw/net lateness and optional penalty     | `models/roster_line.py`, `_grace_minutes`, `_compute_late`, `_raw_late_minutes`, `_grace_forgiven_minutes`, `_compute_tardiness` |
| Paid minutes, credits, surplus-on-late-day rule  | `models/roster_line.py`, `_compute_diff`, `_compute_payroll_fields`, `_compute_day_flags`                                        |
| Exact top summary                                | `models/roster_line.py`, `period_summary`                                                                                        |
| Close Delay actual write                         | `wizard/bulk_day_action_wizard.py`, `action_apply` close-delay branch                                                            |
| Time Off → roster direction                      | `models/hr_leave_extend.py`, `_sync_roster_lines`                                                                                |

## العربية

المرجع الذي حدده المستخدم، الإجراء 398، هو **لوحة التحكم بالحضور**. تقرأ اللوحة أيام الجدول
المعتمدة للموظف والفترة المحددة. تجمع الأيام المكررة في صف عرض واحد لكن الإجمالي يشمل جميع
السطور المعتمدة. فتح الصفحة لا يعيد الحساب؛ فقد تختلف القيم التاريخية المحفوظة عن إعادة حسابها
بالمحرك الحالي. هذه اللوحة هي مرجع المقارنة الأساسي.

**السماح:** تؤخذ أول قيمة مناسبة: سماح الموظف الموجب، ثم القسم الموجب، ثم سماح سطر الموظف
في الجدول إن وجد (الصفر فيه يعني صفر سماح)، ثم تقويم الدوام للحالات الثابتة، ثم 15 دقيقة
افتراضياً. في الأيام المعتمدة المفحوصة للفترة 21 أيلول–20 تشرين الأول ظهرت قيم 12 و15 دقيقة؛
فليست 15 قاعدة عامة للجميع. هذا فحص للإعدادات الحالية وليس إثباتاً لعدم تغيرها تاريخياً.

**التأخر:** التأخر الخام هو الفرق بعد بداية الدوام. التأخر المعروض يساوي الخام ناقص السماح،
وبحد أدنى صفر. إذا بقي الوصول ضمن السماح، تسامح فترة التأخر كلها وتضاف للوقت المدفوع دون
أن تنشئ إضافياً. إذا تجاوز التأخر السماح فلا يبقى رصيد جزئي للسماح. ينقص مؤشر الخروج المبكر
السماح أيضاً، لكن المؤشر وحده لا يضيف رصيداً مدفوعاً.

**الجزاء الإضافي الاختياري:** بعد تجاوز السماح، تقرأ الشرائح التأخر الخام قبل طرح السماح:

| التأخر الخام        | الجزاء الإضافي بالدقائق |
| ------------------- | ----------------------: |
| حتى 30 دقيقة        |                      60 |
| أكثر من 30 وحتى 60  |                     120 |
| أكثر من 60 وحتى 120 |                     240 |
| أكثر من 120         |                     540 |

لا يخصم الجزاء إلا عند تفعيل `tardiness_applied`؛ وهو غير مفعل افتراضياً، ولم يظهر مفعلاً
في الأيام المعتمدة المفحوصة للفترة السابقة. لا تعرض اللوحة نفسها مفتاحه ضمن حقول التعديل، بل
يتاح في أدوات أخرى. ومع إيقاف الجزاء قد يبقى خصم نقص الوقت الحقيقي. الزيادة في يوم تأخر
متجاوز للسماح تعامل كتعويض وقت بسعر عادي دون علاوة إضافي، حتى لو لم يفعل الجزاء.

**رصيد الإجازة في اللوحة:** حقول Leave وSick وMission تضيف دقائق مدفوعة لتغطية النقص دون
تغيير البصمات أو إنشاء دقائق إضافي. ويضيف إجراء Close Delay المنفصل مقدار التأخر **الخام**
بعد اختيار الأيام المتأخرة، مع إمكانية تحديد سقف يدوي. لا يعطل الكود الفعلي مفتاح الجزاء
تلقائياً رغم صياغة بعض التعليقات القديمة، لذلك يراجع الجزاء المفعّل بشكل مستقل.

**Balance هو رصيد حضور/أجر، وليس رصيد الإجازة السنوية.** يحسب فرق اليوم من Final Works
ناقص Required، ثم يجمع الجزء الموجب في مكعب OT والجزء السالب في Shortage؛ والفرق بينهما
هو Balance. لذلك لا يساوي مكعب OT دائماً مجموع دقائق الإضافي الخام في صفوف الأيام.
لم نجد في مسار اللوحة/رصيد الدقائق المفحوص إنشاء طلب إجازة سنوية أو خصماً تلقائياً من تخصيصها.
إدخال Leave credit مختلف عن اعتماد طلب إجازة فعلي في نظام Time Off الذي يزامن الأيام مع الجدول.

مثال افتراضي: الدوام 10:00–21:00، المتطلب 660، السماح 15، والحضور 10:21–21:00. التأخر
الخام 21 والمعروض 6، والعمل 639. دون الجزاء يكون فرق اليوم −21 دقيقة؛ ومع جزاء 60 يصبح −81.
إضافة 21 دقيقة Leave credit مع إيقاف الجزاء تجعل فرق اليوم صفراً، لكنها لا تخصم تلقائياً من
رصيد الإجازة السنوية في المسار المفحوص.

لم تتغير أي سجلات أو حسابات. القواعد الجديدة ستبقى مؤرخة وفق TP21، وأي ربط فعلي برصيد
الإجازة السنوية يحتاج قراراً مستقلاً عن مجرد مطابقة لوحة أودو.

## Intentional differences already requested for this app

TP18 retains calculated overtime when HR hides its display. Odoo's `suppress_ot` instead zeroes
calculated overtime fields and changes Final Works; do not copy that behavior over the user's
hide-only requirement. TP19/TP20 preserve visible in/out segments and leave gap classification to
HR while summing recorded attendance segments. These user choices remain in force even while
using the Odoo control panel as the baseline reference.

تبقى اختيارات المستخدم نافذة: يخفي TP18 عرض الإضافي مع حفظ الحساب، بينما يصفر مفتاح أودو
`suppress_ot` حقول الإضافي ويغير Final Works. لا ينسخ هذا السلوك فوق اختيار الإخفاء فقط.
ويحفظ TP19 وTP20 فترات الدخول والخروج ويجمعها مع ترك تصنيف الفترات الوسيطة للموارد البشرية.

### New requirements TP23 / TP24 · متطلبات جديدة

The user requests a real annual-leave entitlement link for attendance credits with an auditable
adjustment ledger. The feature requirement is confirmed; debit/conversion/approval and other
parameters remain pending. The user also requires both actual and weighted overtime to be shown,
with factor and premium separate (20 × 1.25 = 25; premium 5). Use the Arabic explanation's
[section 8 decision form](odoo-attendance-explained-ar.html#choices) to export the outstanding
choices as `attendance-policy-decisions.json`. Empty answers are null, not approvals. No app
implementation or employee-data change was performed in this documentation update.

طلب المستخدم ربطاً فعلياً بين رصيد التغطية واستحقاق الإجازة السنوية مع سجل تسويات، وعرض
الإضافي الفعلي والمحتسب بالمعامل معاً. الطلب معتمد، لكن تفاصيل الخصم والتحويل والاعتماد وغيرها
تنتظر إجابات القسم 8. تصدر الإجابات الفارغة بقيمة null ولا تعد موافقة. لم تتغير بيانات التطبيق.
