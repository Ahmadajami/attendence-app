# User policy answers · إجابات المستخدم عن السياسات

Received 2026-11-17 from the user's schema-version-1 decision JSON, exported at
`2026-11-17T15:13:27.286Z`. The document is a **draft** and explicitly applies no system changes.
Requirements are recorded in TP25–TP28; empty numeric answers remain unknown.

## العربية

| السؤال                                    | جوابك                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| متى نبدأ؟                                 | 1 تشرين الثاني 2026، دون موعد توقف محدد. لا نعيد تطبيق هذه القواعد الجديدة على تشرين الأول.                      |
| متى ننقص رصيد الإجازة؟                    | عندما تنفذ الموارد البشرية إجراء خصم منفصلاً. حفظ دقائق تغطية الحضور وحده لا يخصم الإجازة.                       |
| كم نخصم؟                                  | نفس دقائق التغطية المعتمدة، دون تقريب إضافي. 21 دقيقة تبقى 21 دقيقة.                                             |
| كم ساعة تساوي يوم إجازة؟                  | حسب ساعات الموظف المطلوبة في جدول ذلك اليوم. للمفقودات، إذا كان اليوم المطلوب 11 ساعة، يكون يوم الإجازة 11 ساعة. |
| هل يمكن أن يصبح الرصيد سالباً؟            | نعم. لذلك سؤال منع الخصم عند عدم كفاية الرصيد غير منطبق، وليس قراراً ناقصاً.                                     |
| من يدخل الرصيد عند البداية؟               | الموارد البشرية، يدوياً.                                                                                         |
| من يوافق على الخصم؟                       | موظف الموارد البشرية المخول.                                                                                     |
| ماذا لو ألغي الخصم؟                       | نعيد الخصم المرتبط المنفذ تلقائياً، ونحفظ سجل العملية الأصلية وسجل الإرجاع.                                      |
| كم ندفع عند إلغاء عمل؟                    | تحدد الموارد البشرية عدد الساعات لكل واقعة.                                                                      |
| هل ساعات الإلغاء تدخل في استحقاق الإضافي؟ | نعم؛ تبقى منفصلة عن ساعات الحضور الفعلي. يلزم توضيح طريقة دخولها في حساب الحدود والعلاوة.                        |
| ما أنواع الإضافي المطلوبة؟                | عادي، وعمل في يوم الراحة، وإضافي وردية ليلية. لكل نوع معامل يمكن تعديله بتاريخ سريان.                            |
| ما قيم المعاملات؟                         | لم تحدد بعد. القيم المرجعية في الملف ليست اختياراتك.                                                             |

**مثال:** دفعنا لموظف أجر 21 دقيقة لم يحضرها. لا تخصم إجازته بمجرد حفظ ذلك الدفع. عندما
تنفذ الموارد البشرية زر الخصم المنفصل، تخصم 21 دقيقة بالضبط من إجازته. تبقى بصماته كما هي.
إذا ألغي الخصم المنفذ، تعاد الدقائق المرتبطة إليه ويسجل الإرجاع.

ما زلنا بحاجة إلى تحديد:

- القيم الأولى لمعاملات الإضافي الثلاثة.
- هل الإضافي الليلي مرتبط بنوع الوردية أم بساعات محددة من الليل؟ وكيف يتعامل مع يوم الراحة أو العطلة؟
- كيف نحول وقت الإجازة إذا كان اليوم المطلوب صفراً أو لا يوجد له جدول؟ لا نفترض مقسوماً عليه من أنفسنا.
- كيف تدخل ساعات الإلغاء المؤهلة في حدود الإضافي وعلاوته، مع عدم تسميتها عملاً فعلياً؟

هذه وثيقة قرارات. لم تتغير إعدادات التطبيق أو بيانات الموظفين أو الحسابات التاريخية.

## English

The new submitted rules start on **2026-11-01**, with no end date. October retains its earlier
baseline. Annual-leave debit is a separate authorized HR action for exactly the approved attendance
credit minutes. Convert using the employee's required scheduled minutes for that date, with no extra
rounding. Negative balances are allowed; opening balances are entered manually by HR; HR approves
debits. Cancelling an already-posted linked debit automatically posts its reversal while retaining
the source and audit history. Cancelling credit before any leave debit was posted must not invent
a leave refund.

HR chooses cancellation hours per event. Those hours are eligible for overtime treatment but remain
distinct from actual worked time; the precise threshold/premium interaction is still open.

The user requires three independently configurable, dated overtime factors: normal, weekly-off and
night-shift. **Initial rates are not selected.** Normal and off-day JSON factors are null, and the
note adds a night category without a numeric value. The `reference_only` values of 1.25/1.5 do not
fill these blanks. Night classification, overlap precedence and zero/unknown-day conversion need
clarification before implementation.

Conditionally null `fixed_day_hours`, `fixed_day_minutes` and `insufficient_balance_action` are
inapplicable under the selected rules. They are not missing approvals or invitations to add defaults.

This document records explicit policy answers only. No app code, schema, settings, employee records
or production calculations were changed. See [the plan](../plans/2026-11-17-team-policies-and-cancellation.md)
and [decision log](decisions.html) for TP25–TP28.

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
