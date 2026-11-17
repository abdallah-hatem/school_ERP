# Mockup brief — school ERP, HR / payroll demo

Three clearly different, bold visual directions for a school ERP used in Egypt. The owner picks one;
the other two are shown to the client too, so each must look finished and convincing on its own.

## Product context

- An ERP for a private school in Egypt. First module: **HR with payroll**. Users: school admin,
  accountant, principal (staff, on desktop). Not a marketing site — a working back-office tool.
- **Bilingual EN / AR.** Arabic must look native, not translated: proper Arabic font, full RTL
  mirroring (sidebar on the right, chevrons flipped, numbers aligned correctly).
- The selling point of the demo: **"everything is dynamic and configurable in Settings"** — salary
  components, penalty rules, working days, branding.

## The file

One self-contained HTML file (inline CSS/JS). Allowed external resources only:
Google Fonts, and Phosphor icons pinned `https://unpkg.com/@phosphor-icons/web@2.1.1` (pick ONE
weight family, e.g. duotone or bold; never Lucide/Feather outline icons).

Structure, top to bottom:
1. A slim **mockup bar** (clearly separate from the app): direction name + one-line feel, and two
   toggles: **Light / Dark** and **EN / ع** (switches `dir` and all text). Both must fully work.
2. The **app screen** (below), at a desktop size (~1280–1440 px wide), looking like a real product.
3. A **design-system strip**: palette swatches with role names (background, surface, text, muted,
   primary, accent, success, warning, danger) for the current theme, and the type scale
   (display, h1, h2, body, small, numbers) shown in both the Latin and the Arabic font.

Rules: colours as CSS custom properties on `:root`, redefined for dark; logical CSS properties only
(`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`) so RTL works;
tabular numerals for money; Western digits in both languages; currency "EGP" / "ج.م".

## The screen: Payroll — November 2026

- **Sidebar:** school logo mark + "Green Valley School" / "مدرسة الوادي الأخضر". Nav: Dashboard /
  لوحة التحكم, Employees / الموظفون, Departments / الأقسام, **Payroll / الرواتب (active)**,
  Penalties / الجزاءات, Leave / الإجازات, Settings / الإعدادات. User chip at the bottom:
  "Rania Saeed — Accountant" / "رانيا سعيد — محاسبة".
- **Header:** title "Payroll · November 2026" / "الرواتب · نوفمبر 2026", status pill **Draft / مسودة**,
  actions: Recalculate / إعادة الحساب, Export bank sheet / تصدير ملف البنك, primary **Approve payroll /
  اعتماد الرواتب**.
- **4 stat tiles:** Employees / الموظفون 42 · Gross / الإجمالي EGP 612,400 · Deductions & penalties /
  الاستقطاعات والجزاءات EGP 38,950 · Net to pay / الصافي EGP 573,450.
- **Table** ("Showing 8 of 42" / "عرض 8 من 42"), search box and a department filter above it.
  Columns: Employee (name + department) · Basic · Allowances · Deductions · Penalties · Net · Status.

| Employee | Arabic | Department (EN / AR) | Basic | Allowances | Deductions | Penalties | Net | Status |
|---|---|---|---|---|---|---|---|---|
| Ahmed Samir | أحمد سمير | Mathematics / الرياضيات | 14,000 | 2,000 | 1,540 | 0 | 14,460 | Ready |
| Mona Khalil | منى خليل | English / اللغة الإنجليزية | 13,500 | 1,950 | 1,485 | 450 | 13,515 | Ready |
| Omar Fathy | عمر فتحي | Science / العلوم | 12,800 | 1,880 | 1,408 | 0 | 13,272 | Ready |
| Salma Adel | سلمى عادل | Arabic / اللغة العربية | 12,000 | 1,800 | 1,320 | 800 | 11,680 | Needs review |
| Karim Hassan | كريم حسن | Administration / الإدارة | 9,500 | 1,550 | 1,045 | 0 | 10,005 | Ready |
| Nour El-Din | نور الدين | Accounting / الحسابات | 11,000 | 1,700 | 1,210 | 0 | 11,490 | Ready |
| Hala Mostafa | هالة مصطفى | Kindergarten / رياض الأطفال | 10,200 | 1,620 | 1,122 | 340 | 10,358 | Ready |
| Youssef Tarek | يوسف طارق | Transport / النقل | 6,500 | 1,250 | 715 | 217 | 6,818 | Needs review |

Statuses: Ready / جاهز, Needs review / بحاجة لمراجعة (penalties awaiting approval).

- **Side panel "Rules applied this month" / "القواعد المطبقة هذا الشهر"** — shows the settings driving
  the numbers, with an "Edit in Settings / تعديل في الإعدادات" link:
  - Transport allowance / بدل انتقال — EGP 600 fixed
  - Housing allowance / بدل سكن — 10% of basic
  - Social insurance (employee) / التأمينات الاجتماعية (حصة الموظف) — 11% of basic
  - Late penalty / جزاء التأخير — 3 late arrivals = 1 day deducted
  - Absence / الغياب — 1 day = basic ÷ 30
  - Working days / أيام العمل — Sun–Thu / الأحد–الخميس

## Quality bar

Distinctive, intentional, premium — not a generic admin template. Clear hierarchy, generous but
dense-enough tables (accountants scan numbers), good contrast in both themes, readable Arabic at
table sizes. Fictional school and people only.
