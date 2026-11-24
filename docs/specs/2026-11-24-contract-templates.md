# Contract templates — spec (draft for the owner, 2026-11-24)

Owner's request (2026-11-24): "a contract template where I can change and edit data and then print
it". Layout: **option A, "Word-style editor + preview dialog"** (owner's pick, 2026-11-24; mockup
`design/mockups/contract-templates.html`, screenshots `design/mockups/screenshots/contract-templates/a-*.png`).
Builds on the contracts module (spec `docs/specs/2026-11-24-contracts.md`, §3 Contracts). Status of
each rule: DECIDED (owner), GUESS (my default, change it if wrong), OPEN (needs the owner; my default
is given and is what gets built if he doesn't answer).

## What exists today

Each employee has a list of contracts (one per contract year, kept forever) on the **Contracts** tab
of their page, and the renewal season on **HR → Contracts**. Nothing prints a contract: HR types the
contract in Word, by hand, from the employee's file, and nothing records which text was signed or
with which salary. The signed scan upload is queued separately ("contracts round 3: signed copy").

## What it adds

1. **Contract templates** in **Settings → HR → Contract templates**: several templates (e.g.
   full-time, part-time, renewal annex), each with an English and an Arabic name, its text in Arabic
   and, optionally, in English, and optionally the default for one work system. Never deleted, only
   hidden.
2. **A Word-style editor** (option A): one document you type in, with a toolbar (bold, italic,
   underline, alignment, numbered list, table, page break, optional phrase) and a **Fields** panel —
   19 fields in four groups, each with a sample value; a click drops a **field chip** where the
   cursor is.
3. **Optional phrases** — text inside `[ ]` that prints only when its field(s) have a value.
4. **Salary in words** — Arabic words ("تسعة آلاف وخمسمائة جنيه مصري لا غير"), and English words in
   an English copy.
5. **"Print contract"** on a contract (employee's Contracts tab; the ⋯ menu on HR → Contracts): pick
   a template (the work system's default preselected) and the copy's language, see the filled A4
   pages in a preview dialog, **Edit text** for this copy only, then **Print** or **Download PDF**.
   On a phone the PDF goes to the phone's share / print sheet.
6. **Printed copies kept on the contract** — the template and its version, the filled document as
   printed and its PDF, who printed it and when — listed on the contract with **Open**, reprinted
   exactly as they were.
7. **New school settings** the fields need: the school's address, and its signatory (name and title),
   in English and Arabic.

## Rules — the exact edit to §3 (employees), new subsection under "Contracts": "Contract templates and printed copies"

### Templates

- **GUESS** — A school has **several templates** (the seed brings one generic sample, "Full-time
  contract"). Each has a name in English and in Arabic (both required, up to 100 characters, unique
  among templates in each language), its **Arabic text** (required) and an **English text**
  (optional). A copy can be printed in English only from a template that has English text.
- **GUESS** — A template may be the **default for one work system** (full-time, part-time 4, 3 or 2
  days). Each work system has at most one default; making a template the default for full-time takes
  it from the template that had it (the screen says so: "Full-time contract is the default now;
  Renewal annex no longer is"). A template can be the default for one work system only.
- **DECIDED** (owner's brief) — A template is **never deleted, only hidden**. A hidden template is left
  out of the print picker, keeps its printed copies (they open as before), and loses its "default"
  mark (showing it again doesn't bring the mark back). Shown again, it can be picked again.
- **DECIDED** (owner's brief) — **Editing a template never changes copies already printed.** Each save
  that changes the text (either language) makes a **new version** (v1, v2, …), kept forever; a copy
  keeps the version it was printed from. Renaming, hiding and the default mark are not versions.
- **GUESS** — Two people editing the same template: the second save is refused ("Someone saved this
  template while you were editing — reload to see their text"), never a silent overwrite.
- **GUESS** — A template's text is up to 200 KB (about 60 A4 pages); an empty Arabic text can't be
  saved.

### Fields

**GUESS** — The 18 fields of the mockup plus one, filled when printing, in the copy's language:

| Group | Field | Filled from | Empty when |
|---|---|---|---|
| From the employee file | Employee name (Arabic) | Full name, Arabic | never |
| | Employee name (English) | Full name, English | never |
| | Employee code | `EMP-0006` | never |
| | National ID | National ID (14 digits) | not given |
| | Home address | The employee's address, as typed (one language) | not given |
| | Job title | Job title, in the copy's language | never |
| | Department | Department, in the copy's language | never |
| | Stage | **Main stage**, in the copy's language | the main stage is the "no stage" entry (§3) |
| | Hire date | Hire date | never |
| From the contract | Contract start | **This contract's** start (not the employee's current one) | never |
| | Contract end | **This contract's** end as signed (not an early end) | never |
| | Basic salary | The employee's basic salary **today**, "9,500 جنيه" / "EGP 9,500" (piastres shown only when not zero: "9,500.50") | never — but see salary access below |
| | Basic salary in words | In the copy's language: "تسعة آلاف وخمسمائة جنيه مصري لا غير" / "Nine thousand five hundred Egyptian pounds only"; piastres as "و50 قرشًا" / "and 50 piastres" | as above |
| | Basic salary in Arabic words *(new, for bilingual English copies)* | Always Arabic words | as above |
| | Work system | Full-time / part-time N days, in the copy's language | never |
| From school settings | School name | Settings → School, in the copy's language | never |
| | School address | Settings → School (new), in the copy's language | not set |
| | School representative | Settings → School (new): "<name>, <title>" — "أ. هشام كامل، مدير المدرسة" | not set |
| Other | Today's date | The day the copy is printed (Cairo) | never |

- **GUESS** — Dates print as day, month name, year in the copy's language with Western digits
  ("1 يونيو 2026", "1 June 2026"), like the rest of the app. Amounts with Western digits and
  thousands separators. Gregorian calendar only.
- **GUESS** — A contract keeps no salary of its own (renewing keeps the record's salary, §3), so a
  copy prints the **salary on the employee's record on the day it is printed**. The copy then keeps
  it for good (see "Printed copies").
- **GUESS** — An **empty field outside an optional phrase** prints as a dotted line ("…………") to be
  filled by hand, and the print dialog warns ("1 field is empty: National ID") with **Open file**.
  Printing isn't blocked: a school may well want to write it by hand.
- **DECIDED** (owner's brief) — **Optional phrases.** Text marked as optional (shown as `[ … ]` in
  the editor, the toolbar's "Optional phrase" button around the selection) prints only when **every**
  field inside it has a value; otherwise the whole phrase is left out, and the print dialog says so
  ("Stage is empty — its phrase is left out"). GUESS: an optional phrase must hold at least one field
  ("An optional phrase needs a field") and can't hold another optional phrase.
- **GUESS** — Fields are never typed as text (`{{…}}`); they are chips from the Fields panel, so a
  template can't name a field that doesn't exist. A field that is later retired (none planned) would
  print empty with the warning.

### Printing

- **GUESS** — **Who prints:** whoever may **manage contracts** (`hr.contracts.manage`, with
  `hr.contracts.view` covering the employee) — not "view contracts". Printing makes a record (a kept copy, an audit entry) and lets the
  printer change the contract's wording for this copy: it is acting on the contract, like renewing.
  Those who may only view contracts (HR officer, principal, a stage head) see the printed copies
  and open them; they don't make new ones. An admin can give `hr.contracts.manage` to another role.
- **DECIDED** (existing rule, §2) — **Not your own contract.** Printing your own contract is refused
  (`OWN_CONTRACT`), a System admin's too, like every other act on a contract; "Print contract" isn't
  shown on your own. Opening a copy of your own contract follows "view contracts" as before.
- **GUESS** — **Salary.** A template whose text (or the copy's edited text) uses a salary field fills
  it only for someone who may see **that employee's salary** (`hr.employees.view_salary` covering
  them). For anyone else, printing such a template is **refused**, not printed blank: a blank or
  dotted salary on a contract to be signed invites a hand-written amount the system never saw, and
  the kept copy would not match what is signed. The picker shows those templates greyed out with
  "Needs access to salaries"; a template without salary fields still prints. (With the starting
  roles this never happens: the HR manager manages contracts and sees every salary.)
- **GUESS** — **Which contracts can be printed:** the current one, an **upcoming** one (a renewal's
  next contract is printed and signed in May, before it starts — printing isn't a decision, so
  `CONTRACT_NOT_STARTED` doesn't apply), and an ended or not-renewed one (a reprint for the file; the
  dialog says "This contract ended on 31 May 2026 — the values are today's"). A **cancelled**
  contract can't be printed (`CONTRACT_CANCELLED`). An inactive employee's contract can be printed.
- **GUESS** — The template picker preselects **the default for the employee's work system**; with
  none, nothing is preselected and the dialog asks to pick one. The language preselects Arabic;
  English is offered only when the template has English text.
- **DECIDED** (owner's brief) — **Edit text** changes the wording of **this copy only**; the template
  stays as it is. GUESS: the copy's text is edited in the same editor (reflowed to the phone's width
  on a phone); **field values stay locked chips** — you change the words around them, not the values.
  A wrong value is fixed at its source (the employee's file, Settings → School) and the preview
  refreshes. This keeps every printed value true to the records and keeps the salary rule above
  airtight. Fields may be removed or added in the copy's text (added ones are filled the same way).
  A copy whose text was edited is marked **"Text edited"** in the list.
- **GUESS** — **What you saw is what's kept.** The server fills the values itself when the copy is
  made; if anything changed since the preview (the template was saved again, a value changed in
  another tab), printing is refused with "The contract's details changed — check the preview again",
  and the preview reloads. Edits to the copy's text are kept when only values changed; when the
  template's text changed they would be lost, so the dialog asks first ("Start from the new text"
  or "Close").
- **GUESS** — **A copy is kept when its PDF is made** — Print or Download PDF on a computer, "Print or
  PDF" on a phone — with the printer's name and the time. The system can't know whether paper came
  out; cancelling the browser's print dialog still leaves the copy. Each press makes a new copy
  (each one is what that person printed).

### Printed copies

- **DECIDED** (owner's brief) — Every printed copy is **kept on its contract**: the template and its
  version, the copy's language, the **filled document as printed** (values included, the copy's own
  text edits included) and its **PDF**, who printed it, when, and whether its text was edited. It
  never changes afterwards: editing the template, a raise, a corrected name or a new school address
  leaves it as printed.
- **GUESS** — **Open** shows the kept PDF — the same file, byte for byte — so a reprint is identical
  to the first print. Opening a copy is not a new copy.
- **GUESS** — A copy **opens for whoever may view that employee's contracts**; a copy that holds a
  salary also needs **that employee's salary** (`hr.employees.view_salary`). Without it the copy is
  listed ("Printed copy · 2 Jun 2025 · contains salary") without **Open**, and its file answers
  "We couldn't find that page" — the rule of every salary-type value (§2). Copies are sensitive
  contract documents (`docs/ARCHITECTURE.md` → Files follow their record): each opening is recorded.
- **GUESS** — Copies are never deleted, also when the contract ends or is cancelled.
- **GUESS** — **The signed copy** (contracts round 3, queued) is the scan of the paper both sides
  signed. Uploading it asks **"Which printed copy was signed?"** — the copies of that contract, newest
  first preselected, or "Not printed here" — and the copy then shows **"Signed · scan"** beside
  **Open**. The printed copy is what the school prepared; the scan is what was signed; the link says
  they are the same text. This spec only reserves the link (`signed_copy_id` below); the upload is
  round 3's.

### Settings additions — the exact edit to §7

| Setting | Default | Source |
|---|---|---|
| School address (English, Arabic) | Empty (the "School address" field prints empty until set) | GUESS — Settings → School, `core.settings.edit`; up to 300 characters each |
| School signatory: name and title (English, Arabic) — who signs contracts for the school | Empty (the "School representative" field prints empty until set) | GUESS — Settings → School, `core.settings.edit`; up to 100 characters each. See OPEN 1 |
| Contract templates | One generic sample, "Full-time contract", default for full-time | GUESS — Settings → HR → Contract templates, `hr.contract_templates.manage` |

Setting keys: `school.addressEn`, `school.addressAr`, `school.signatoryNameEn`,
`school.signatoryNameAr`, `school.signatoryTitleEn`, `school.signatoryTitleAr` (core,
`SchoolSettingKey`), recorded in the change history like the school's name. The print dialog's
warning links to Settings → School when one of them is empty ("School address isn't set — Open
settings", shown to whoever may change school settings; others see "Ask an administrator").

- **DECIDED** (CLAUDE.md) — **Client material** — the school's real contract text, its signatory, its
  address — is entered at setup (in the screens, or the git-ignored `seed-data.local/`, new optional
  file `contract-templates.json`), **never in code or docs**. The committed seed has only the generic
  sample template (written for this project, like the mockup's text) and leaves the address and
  signatory empty.

## Who can do it — the exact edit to §2

- **Manage contract templates** (`hr.contract_templates.manage`, new, whole school) — create, edit,
  hide and show templates, set a work system's default. **HR manager** (and the System admin). GUESS
- **Print a contract** — `hr.contracts.manage` (existing key: HR manager, whole school) and
  `hr.contracts.view` covering the employee, as every contract write checks both, plus `hr.employees.view_salary` covering them for a template with a salary field.
  Never one's own contract. GUESS
- **Open a printed copy** — `hr.contracts.view` covering the employee (HR manager, HR officer,
  principal: whole school; stage head: their stage), plus their salary for a copy that holds one.
  GUESS
- **School address and signatory** — part of school settings (`core.settings.edit`). GUESS
- One key, not a view / manage pair: the template's text holds no one's data, and whoever prints
  sees the templates in the picker anyway; a read-only Settings view would have no user. The section
  shows in Settings for holders of `hr.contract_templates.manage` only. Like `hr.contracts.manage`,
  `hr.contract_templates.manage` is **not** row-scoped (whole school only). Roles stay
  editable by the admin, so these are only the starting defaults; as a new HR key it reaches the
  HR manager starting role automatically (`HR_KEYS`).

## Audit — the exact edit to §9

Add to the recorded actions: "**contract templates** (create, edit — a new version, rename, default
mark —, hide, show); **contract copies** (printed, opened)". Entries:

| Action | Record | What it keeps |
|---|---|---|
| `hr.contract_template.create` | the template (new entity type `contract_template`, label: its name) | names, languages, default mark, version 1 |
| `hr.contract_template.update` | the template | the fields that changed; a text change reads "Text changed: version 3 → 4" (the versions table keeps the texts; the entry doesn't copy 200 KB) |
| `hr.contract_template.hide` / `.show` | the template | hidden ↔ shown; a lost default mark |
| `hr.contract.copy_print` | the contract (`employee_contract`) | template and version, language, text edited yes/no, PDF or print; **no amounts** |
| `hr.contract.copy_open` | the contract | which copy (like `hr.contract.document_open`, an access entry in its own transaction; a failed record refuses the opening) |

Setting the address and signatory is the existing `core.settings.update`. Every endpoint below is
`@Audited`; none is `@NotAudited`.

## Screens

- **Settings → HR → Contract templates** (new section `contractTemplates`, key
  `hr.contract_templates.manage`): a list of templates — name, languages ("Arabic + English"),
  default mark, version, last changed by / on, hidden ones behind "Show hidden" — with **New
  template**, and a ⋯ per row (Edit, Make default for …, Hide / Show). Paged and searched by the API
  like every list.
- **Template editor** (mockup A, `a-*-editor.png`): back link, name, the default and language pills,
  "Last changed … by …"; **Preview with an employee** and **Save template**. The A4 canvas with the
  toolbar (document language switch Arabic / English, undo, paragraph style, bold, italic,
  underline, alignment, numbered list, table, page break, optional phrase, **Insert field**) and the
  **Fields** panel (19 fields in the four groups, each with its other-language name and a sample
  value, a search box, the `[ ]` hint). The Arabic text is edited right-to-left, the English text
  left-to-right. Leaving with unsaved changes asks first.
  - **Phone** (`a-*-phone-editor.png`): allowed, not optimised — the page reflows to the phone's
    width, a short toolbar, a **Field** button opening the fields as a bottom sheet, and a sticky
    "Unsaved changes · Save" bar.
  - **Preview with an employee**: pick an employee (search by name or code) and see the template
    filled with their current contract, in a read-only preview. Nothing is kept or recorded. It
    follows the printing rules (salary only with salary access; others see the field greyed
    "hidden").
- **Employee page → Contracts tab**: each contract row gets **Print contract** (for whoever may print
  it) and, under it, its **printed copies**: "Printed copy · 2 Jun 2025 · Full-time contract v3 ·
  Mona Ibrahim", "Text edited" and "Signed" badges, **Open**.
- **HR → Contracts (renewals)**: the row's ⋯ menu gets **Print contract** (prints the row's contract;
  on a renewed row, a sub-choice "This year's / Next year's contract").
- **Print contract dialog** (mockup A, `a-*-desktop-print.png`): title with the employee, code and
  contract period; the filled A4 pages (values highlighted "Filled in", empty ones "Empty field";
  zoom; "Page 1 of 2"); beside them **Template** (default marked), **Language of the copy**, the
  empty-field warnings (with **Open file**), **Change the wording → Edit text**, **Kept on the
  contract** ("Printing or downloading saves this copy on Nadia's 2026/27 contract, with your name
  and the time"; earlier copies of this contract). Footer: "A4 · 2 pages", **Cancel**, **Download
  PDF**, **Print**.
- **Phone** (`a-*-phone-print.png`): full screen — template picker and language switch, the warning,
  the pages scaled to the width (pinch to zoom); bottom bar **Edit text** and **Print or PDF**, which
  makes the PDF and hands it to the phone's share sheet (print, save to Files, WhatsApp…); where the
  browser can't share a file, the PDF opens in the browser's viewer. **Edit text** opens "Edit this
  copy" (reflowed text, "Changes apply to this printed copy only", **Done**).
- Every screen in English and Arabic; the A4 document itself is in the copy's language and
  direction, whatever the screen's language.

## How it is built

### Editor: TipTap (ProseMirror) — GUESS

**TipTap 3** (`@tiptap/react`, `@tiptap/starter-kit` and the MIT extensions for underline, text
align, table, placeholder), pinned exact versions, **no TipTap Pro extensions** (paid). Why:

- **Field chips** are a custom inline **atom node** (`field`, attribute `key`) with a React node view
  — the cursor moves over it as one character, it can't be half-deleted or typed into, and it
  stores a key, not text. **Optional phrases** are a custom inline wrapper node (`optional`). Page
  breaks a block node. ProseMirror's schema refuses anything else (pasted HTML is reduced to it).
- **RTL Arabic**: ProseMirror leaves text layout to the browser, which shapes and orders Arabic
  correctly; the editor root gets `dir="rtl"` for the Arabic text, `ltr` for the English, and
  paragraphs keep `dir="auto"`, so a Latin code (EMP-0006) inside Arabic sits right.
- **Headless**: no styling of its own, so the toolbar and panel are our shadcn/Tailwind components
  in the "Campus" tokens.
- **JSON documents**: the text is stored as ProseMirror JSON, never HTML — we render it ourselves
  (escaped), so no user HTML ever reaches a page or the PDF renderer.
- MIT licence: fine in the Docker image we ship to self-hosted schools.

Rejected: **CKEditor 5** and **TinyMCE** (GPL or paid commercial licence — a problem for shipping
the image to schools; their own UI to restyle); **Lexical** (workable, but tables and inline
decorator nodes are less mature, and fewer examples of atom chips); **Slate** (no stable 1.0, more
built by hand); **Quill** (weak custom inline embeds and tables).

### One renderer, in `packages/shared`

A pure function `renderContractDocument(doc, values, language) → HTML` (new
`packages/shared/src/contract-document/`), with its node whitelist, the field list
(`CONTRACT_FIELDS`: key, group, EN / AR names, sample, salary yes/no), the optional-phrase rule and
the salary-in-words functions (`amountInWordsAr`, `amountInWordsEn` — pure, heavily unit-tested:
0, 1, 2, 11, 100, 1,000, 2,000, 9,500, 1,000,000, piastres, the Arabic dual and plural forms). The
web preview and the API's PDF use the **same** function and the same print CSS, so the preview is
the PDF. The zod schema of a document (`contractDocumentSchema`: node types, field keys, size) is
shared too and checked on every save and print.

### PDF: made on the server with headless Chromium — GUESS (see OPEN 2)

| | Browser print (`window.print()` of a print-styled page) | Server rendering (headless Chromium in the API) |
|---|---|---|
| Arabic shaping, RTL | Good (the browser) | Good (the same engine) |
| Same output everywhere | No — margins, headers and scaling are the user's print settings; each browser differs | Yes — one engine, our fonts, our margins |
| The kept copy reprints exactly | Only the HTML is kept; a later browser or font may lay it out differently | **The PDF itself is kept**; Open serves the same bytes |
| Phone share sheet (mockup) | Phone print dialogs vary; no file to share | A real PDF file → `navigator.share({ files })` |
| Download PDF | User must pick "Save as PDF" in the print dialog | One click |
| Cost | Nothing | Chromium in the API image (~+150–250 MB), ~150–300 MB RAM per render, fonts bundled |

**Pick: server rendering.** The owner's brief needs a copy that "reprints exactly" and a PDF handed
to the phone, and only a kept PDF gives both. Implementation: `playwright-core` with Chromium's
headless shell in `Dockerfile.api`, the app's Arabic and Latin fonts (IBM Plex Sans Arabic, Plus
Jakarta Sans — OFL) bundled so nothing is fetched; the page is our rendered HTML with
`setContent` and **JavaScript and network turned off** (requests blocked; the logo passed as a
data URL); A4, 20 mm margins, the footer "School name — template name · page N of M" through
Chromium's footer template. One browser kept warm and **at most two renders at a time** (a queue;
a render over 20 s fails with "Couldn't make the PDF — try again"). PDFs go to a new sensitive file
folder `contract-copies`. The preview in the dialog is HTML (instant); the PDF is made only on
Print / Download.

Print on a computer: the PDF is loaded into a hidden frame and the browser's print dialog opened on
it (falling back to opening it in a new tab). Download PDF: the file, named
`<code>-<contract year>-<template>.pdf` (e.g. `EMP-0006-2026-27-full-time-contract.pdf`).

### Module placement

All in HR (`modules/hr/contract-templates/` for templates; printing and copies in
`modules/hr/contracts/`), since copies belong to contracts. School address and signatory are core
settings, read by HR through core's exported settings service (HR depends on core — allowed).
Contract templates are not heavy rules: logic in services, the pure renderer and words functions in
`packages/shared` with their unit tests. Web: `apps/web/src/modules/hr/contract-templates/`
(`apis.ts`, `"use server"`, on `apiFetch`) and the print dialog in `modules/hr/contracts/`; the
editor is loaded only on the editor and the dialog's "Edit text" (`next/dynamic`), so TipTap stays
out of every other page's bundle.

## API (sketch)

Templates — `hr.contract_templates.manage` unless said:

- `GET /hr/contract-templates?hidden=&search=&page=` — the list. Also allowed with
  `hr.contracts.manage` (visible ones only: the print picker), each with `usesSalary`.
- `GET /hr/contract-templates/:id` — the template with its current version's texts.
- `POST /hr/contract-templates` `{ nameEn, nameAr, defaultForWorkSystem?, bodyAr, bodyEn? }` —
  `@Audited('hr.contract_template.create')`.
- `PUT /hr/contract-templates/:id` `{ nameEn, nameAr, defaultForWorkSystem?, bodyAr, bodyEn?,
  baseVersion }` — a changed text makes version `baseVersion + 1`; a stale `baseVersion` → 409
  `TEMPLATE_CHANGED`. `@Audited('hr.contract_template.update')`.
- `POST /hr/contract-templates/:id/hide` · `/show` — `@Audited('hr.contract_template.hide' | '.show')`.
- `GET /hr/contract-templates/:id/versions` — version, who, when (the texts by
  `GET …/versions/:version`).
- `GET /hr/contract-templates/:id/preview?employeeId=` — the values for "Preview with an employee"
  (needs `hr.contracts.view` covering the employee too; salary per the salary rule). Read-only.

Printing — `hr.contracts.manage` and `hr.contracts.view` covering the contract's employee, not one's own:

- `GET /hr/contracts/:id/print?templateId=&language=` — the template version, the filled values,
  the empty fields, the phrases left out, `valuesHash`, earlier copies. 403-style refusals as
  codes: `OWN_CONTRACT`, `CONTRACT_CANCELLED`, `SALARY_NOT_VISIBLE`, `TEMPLATE_HIDDEN`,
  `NO_ENGLISH_TEXT`.
- `POST /hr/contracts/:id/copies` `{ templateId, templateVersion, language, valuesHash, bodyEdited?,
  output: PRINT | PDF }` — refills on the server, refuses a stale version (409 `TEMPLATE_CHANGED`) or
  values (409 `VALUES_CHANGED`), validates `bodyEdited` with the shared schema (and the salary rule
  for any field in it), renders the PDF, stores copy and file in one transaction with
  `@Audited('hr.contract.copy_print')`. Returns the copy and its file URL. Rate-limited like uploads.
- `GET /hr/contracts/:id/copies` — `hr.contracts.view`: the contract's copies (salary-holding ones
  without a file URL for someone who can't see the salary). Also returned inside
  `GET /hr/employees/:id/contracts` per contract.
- `GET /files/contract-copies/:name` — the registered sensitive folder: opens with
  `hr.contracts.view` covering the employee, plus `hr.employees.view_salary` when the copy holds a
  salary; otherwise 404. `onOpen` records `hr.contract.copy_open`.

School settings — `PUT /settings/school` takes the six new keys (`core.settings.edit`, existing
`core.settings.update` entry).

## Data

- `contract_templates` — `id`, `name_en`, `name_ar` (each unique, case-insensitive), `default_for_work_system`
  (`WorkSystem`, nullable; a partial unique index where not null and not hidden — SQL-only, like
  `employee_contracts_one_active_per_employee`), `hidden_at` (null = shown), `current_version`
  (int), `created_by_id`, `created_at`, `updated_by_id`, `updated_at`.
- `contract_template_versions` — `id`, `template_id` (`ON DELETE RESTRICT`), `version` (unique per
  template), `body_ar` (jsonb), `body_en` (jsonb, nullable), `uses_salary` (bool, worked out on
  save), `fields` (text[], the field keys used), `created_by_id`, `created_at`. Insert-only.
- `contract_copies` — `id`, `contract_id` (`ON DELETE RESTRICT`), `employee_id` (for the scope check,
  indexed), `template_id`, `template_version_id`, `template_name_en` / `_ar` (as printed),
  `language` (`AR` | `EN`), `document` (jsonb: the filled document as printed — values inline, the
  copy's edits included, so it can be re-rendered or read without the template), `values` (jsonb:
  field → value as printed), `text_edited` (bool), `contains_salary` (bool), `output` (`PRINT` |
  `PDF`), `file_url` (`/files/contract-copies/<name>`), `page_count`, `printed_by_id`,
  `printed_by_name` (as it was then), `printed_at`. Insert-only (no update path in the code).
- Round 3 (signed copy) adds its own columns or table and `signed_copy_id` → `contract_copies.id`
  (nullable). Not built here.
- `SchoolSetting` rows for the six new keys (no migration needed beyond defaults: missing = empty).
- Migration: none of the existing tables change. The seed adds the generic sample template (v1,
  default for full-time), or the school's from `seed-data.local/contract-templates.json` when present.

## Timeline walks

"Today" moves; each step says what each record holds.

### A. A template's life

1. **1 Jun 2026** — Mona (HR manager) creates "Full-time contract", Arabic text only, default for
   full-time. `contract_templates`: v1 current; `hr.contract_template.create`.
2. **2 Jun** — Mona prints Nadia's 2026/27 contract from it. Copy #1: template v1, Arabic, salary
   9,500, PDF kept, Mona, 2 Jun. `hr.contract.copy_print`.
3. **10 Jun** — Mona changes clause 4's working hours and adds English text. Save → **v2**; entry
   "Text changed: version 1 → 2; languages: Arabic → Arabic + English". Copy #1 still says v1, and
   Open shows the 2 Jun PDF — clause 4 as it was.
4. **11 Jun** — Mona prints Nadia's contract again, in English. Copy #2: v2, English. The contract now
   lists two copies; #1 unchanged.
5. **1 Sep** — Mona creates "Full-time contract 2027", makes it the default for full-time (the first
   one loses the mark) and **hides** "Full-time contract". The picker no longer offers it; copies #1
   and #2 still open; their rows still name "Full-time contract v1 / v2".
6. **2 Sep** — Mona shows it again: it's in the picker, **not** the default.

### B. A contract printed, renewed, printed again

1. **2 Jun 2026** — Nadia's 2026/27 contract (1 Jun 2026 – 31 May 2027) printed: copy #1 on the
   2026/27 contract, dates 1 Jun 2026 / 31 May 2027.
2. **20 Nov 2026** — Nadia is renewed. 2026/27 is current (Renewed), 2027/28 is Upcoming (§3).
   2026/27 keeps copy #1; 2027/28 has none.
3. **15 May 2027** — Mona prints the renewal from the 2027/28 row (allowed though upcoming) with
   "Renewal annex". Copy on **2027/28**: contract start 1 Jun 2027, end 31 May 2028 — that contract's
   dates, not the employee's current ones (which still say 2026/27). Salary: the record's today.
4. **1 Jun 2027** — 2027/28 becomes current. Both contracts keep their own copies; nothing moves.
5. **If, on 20 Apr 2027, 2026/27 had been ended early** (2027/28 Cancelled): 2027/28 can no longer be
   printed (`CONTRACT_CANCELLED`); a copy printed on it before the cancellation stays listed.

### C. A field's source changes after printing

1. **2 Jun 2026** — copy #1: salary 9,500, "تسعة آلاف وخمسمائة …", name "نادية فؤاد رمضان".
2. **1 Sep** — raise to 10,000 (employee form). Copy #1 still 9,500 (kept document and PDF).
   A new print shows 10,000; the dialog has no "changed" warning — it is a new copy.
3. **5 Sep** — the Arabic name is corrected to "نادية فؤاد رمضان علي". Copy #1 keeps the old spelling.
   If it matters, Mona prints a new copy; both are listed, newest first.
4. **Between preview and Print** — Mona opens the dialog (salary 10,000); in another tab Ahmed edits
   the salary to 10,500; Mona presses Print → 409 `VALUES_CHANGED`, "The contract's details changed —
   check the preview again", preview reloads with 10,500; her text edits (if any) are kept. No copy
   was made for 10,000.
5. **Template saved meanwhile** — the same with Ahmed saving the template → 409 `TEMPLATE_CHANGED`;
   with copy edits, "Start from the new text" (edits dropped) or "Close".

### D. Reprinting an old copy

1. **3 Mar 2027** — the employee lost her paper. Mona opens copy #1 (2 Jun 2026) → the kept PDF,
   identical, salary 9,500 — no new copy, one `hr.contract.copy_open` entry.
2. If she needs **today's** figures instead, she prints anew → copy #3 with today's values.
3. **Sara** (principal: views contracts, no salary) opens Nadia's Contracts tab: sees "Printed copy ·
   2 Jun 2026 · contains salary" without **Open**; a copy from a template without salary fields she
   can open.
4. **2030** — a newer browser, new fonts in the image: copy #1 still opens as the same 2026 PDF.

## Edge cases

1. Printing your own contract → refused, `OWN_CONTRACT`; the button isn't shown.
2. Printing with only `hr.contracts.view` → the button isn't shown; the API answers 403.
3. Someone given `hr.contracts.manage` whose `hr.contracts.view` covers only their stage, printing
   another stage's employee → "We couldn't find that page" (404), like every contract write (both
   scopes are checked).
4. A template with salary fields, printer can't see that employee's salary → refused,
   `SALARY_NOT_VISIBLE`; picker greys it "Needs access to salaries". Adding a salary field in "Edit
   text" → the same refusal on Print.
5. Template without salary, printer without salary access → prints; copy `contains_salary = false`,
   opens for every viewer of the contract.
6. An empty field outside `[ ]` → dotted line, warning, printing allowed. Inside `[ ]` → phrase left out,
   warning names it.
7. An optional phrase with two fields, one empty → the whole phrase is left out.
8. Saving an optional phrase with no field → refused, "An optional phrase needs a field".
9. English copy from a template with no English text → the language switch offers Arabic only; via
   the API, `NO_ENGLISH_TEXT`.
10. Making a hidden template the default → refused ("Show the template first"). Hiding the default
    → it loses the mark; the work system then has no default (the dialog asks to pick).
11. Two templates both claiming full-time default at once (two editors) → the unique index lets one
    win; the other's save says "Another template became the default for full-time — save again to
    take it".
12. Two people saving the same template → the second gets 409 `TEMPLATE_CHANGED`; nothing is lost
    silently.
13. Printing a cancelled contract → refused, `CONTRACT_CANCELLED`. An upcoming one → allowed. An ended
    or not-renewed one → allowed, with "This contract ended on … — the values are today's".
14. The employee is inactive → printing allowed (a reprint for the file).
15. Values or template changed between preview and Print → 409 (`VALUES_CHANGED` / `TEMPLATE_CHANGED`),
    preview reloads; no copy is made.
16. The PDF render fails or takes over 20 s → no copy, no audit entry, no file; "Couldn't make the
    PDF — try again". A copy is never kept without its PDF (render first, then one transaction
    saves the file link, the copy and the entry; an orphan file from a failed transaction belongs to
    nobody and opens for nobody).
17. Many prints at once (renewal season) → at most two renders at a time, the rest wait in the queue
    (the button shows "Making the PDF…").
18. The phone can't share files (`navigator.canShare` false) → the PDF opens in the browser's viewer.
    The copy is kept either way.
19. School address or signatory not set → the field is empty → dotted line or phrase left out, and
    the warning links to Settings → School (for those who may change it).
20. The employee's main stage is "no stage" → the "Stage" field is empty (the mockup's example).
21. Salary with piastres (9,500.50) → "9,500.50 جنيه", "تسعة آلاف وخمسمائة جنيه مصري وخمسون قرشًا لا
    غير". Salary 1,000,000 (the maximum) → "مليون جنيه مصري لا غير".
22. Pasting from Word into the editor → reduced to what the schema allows (paragraphs, headings,
    bold, italic, underline, lists, tables, alignment); colours, fonts and images dropped. Typed
    `{{name}}` stays plain text (only chips are fields).
23. A template over 200 KB → refused, "This template is too long".
24. Opening a copy's file without the right → 404, never 403. Opening it → `hr.contract.copy_open`;
    if that entry can't be saved, the opening is refused.
25. The copy's file name is ours (random); the download name is built from the code and the year,
    never from typed text.
26. A long Arabic text with Latin codes, a table and a manual page break → laid out the same in the
    preview and the PDF (shared renderer and CSS; the e2e test compares the page count of the seed
    template in both).
27. A template edited after a copy was printed, then the copy's "document" re-rendered → never
    needed: Open serves the kept PDF; the document JSON is kept for reading and for a future re-render
    only if a PDF were ever lost (restored from backup with the database).

## OPEN — the owner's decisions (few; my default is built if there's no answer)

1. **Who signs for the school.** One signatory in Settings → School (name and title), printed on
   every contract — or a choice of signer on each print (e.g. the principal for teachers, the
   director for administrative staff)? **Default: one signatory in settings**; for an exception,
   "Edit text" on that copy.
2. **The PDF is made on the server.** It adds Chromium to the API's Docker image (~+150–250 MB, also
   in the images self-hosted schools receive) and a few hundred MB of RAM while rendering, in return
   for identical PDFs, exact reprints and the phone's share sheet. The alternative — the browser's
   own print — costs nothing but keeps no PDF and prints differently per browser. **Default: server
   rendering.**

Everything else above is GUESS: the owner can change any of it in review.

## Out of scope

The signed scan upload (contracts round 3 — only the link is reserved) · e-signatures · sending a
contract by email or WhatsApp from the system (the phone's share sheet covers it) · templates for
other documents (salary certificates, warning letters, experience letters — the same editor and
renderer can serve them later) · a salary kept per contract (payroll's annual raise) · restoring an
older template version as current (copy its text by hand for now) · images in templates other than
the school logo in the header · Hijri dates · bulk printing many contracts at once (a natural
follow-up for the renewal season: "Print selected").
