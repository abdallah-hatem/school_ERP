const fs = require('fs');
const path = require('path');
const { G } = require('./glyphs');

const ROOT = '/Users/abdallahhatem/Desktop/Projects/Freelancing/school-erp';
const SRC = process.argv[2] || ROOT + '/apps/web/src/shared/components/ui/icons.tsx';

// [export, glyph, group, solid, mirror, meaning]
const S = true, M = true, _ = false;
const E = [
  // Navigation & modules
  ['Dashboard', 'grid', 'nav', S, _, 'Home / dashboard'],
  ['Employees', 'usersThree', 'nav', S, _, 'Employees'],
  ['Staff', 'users', 'nav', S, _, 'Employees page in the HR menu'],
  ['Penalties', 'gavel', 'nav', S, _, 'Penalties'],
  ['Lateness', 'stopwatch', 'nav', S, _, 'Lateness'],
  ['Payroll', 'wallet', 'nav', S, _, 'Payroll / approved pay'],
  ['PayrollTaxes', 'receiptTax', 'nav', S, _, 'Payroll taxes'],
  ['Settings', 'sliders', 'nav', S, _, 'Settings'],
  ['Activity', 'history', 'nav', S, _, 'Activity log'],
  ['Users', 'userGear', 'nav', S, _, 'Sign-in accounts'],
  ['Roles', 'shieldCheck', 'nav', S, _, 'Roles'],
  ['HrModule', 'usersThree', 'nav', S, _, 'HR module group'],
  ['AccountingModule', 'calculator', 'nav', S, _, 'Accounting module'],
  ['InventoryModule', 'package', 'nav', S, _, 'Inventory module (soon)'],
  ['StudentsModule', 'student', 'nav', S, _, 'Students module (soon)'],
  ['AdministrationModule', 'buildings', 'nav', S, _, 'Administration module'],
  ['CoreModule', 'gear', 'nav', S, _, 'Core module (activity tag)'],
  ['Menu', 'list', 'nav', _, _, 'Open the drawer'],
  ['School', 'buildings', 'nav', S, _, 'Settings tab: school'],
  ['Structure', 'tree', 'nav', S, _, 'Settings tab: structure'],
  ['Lists', 'listBullets', 'nav', S, _, 'Settings tab: lists'],
  ['Rules', 'scales', 'nav', S, _, 'Settings tab: HR rules'],
  ['History', 'history', 'nav', S, _, 'History tab'],
  // Actions
  ['Add', 'plus', 'act', _, _, 'Plus inside the add badge (badge stays CSS)'],
  ['More', 'dots', 'act', _, _, 'Row actions ⋯'],
  ['Edit', 'pencil', 'act', _, _, 'Edit'],
  ['Deactivate', 'userMinus', 'act', _, _, 'Deactivate a person'],
  ['Reactivate', 'userCheck', 'act', _, _, 'Reactivate a person'],
  ['Show', 'eye', 'act', S, _, 'Show (password, column)'],
  ['Hide', 'eyeSlash', 'act', _, _, 'Hide'],
  ['Remove', 'trash', 'act', _, _, 'Remove / delete'],
  ['Upload', 'upload', 'act', _, _, 'Upload'],
  ['Retire', 'archive', 'act', _, _, 'Retire (archive) a list item'],
  ['Restore', 'restore', 'act', _, M, 'Restore (undo-like)'],
  ['Recalculate', 'recalc', 'act', _, _, 'Recalculate'],
  ['Retry', 'retry', 'act', _, _, 'Retry / reload'],
  ['Export', 'fileDown', 'act', _, _, 'Export a file'],
  ['Approve', 'seal', 'act', S, _, 'Approve a month'],
  ['Print', 'printer', 'act', _, _, 'Print'],
  ['Adjust', 'plusMinus', 'act', _, _, 'Add or deduct an amount'],
  ['NewPeriod', 'calendarPlus', 'act', _, _, 'Open a new period'],
  ['Search', 'search', 'act', _, _, 'Search'],
  ['Filter', 'funnel', 'act', S, _, 'Filter (solid while filters are on)'],
  ['ClearFilters', 'eraser', 'act', _, _, 'Clear filters'],
  ['Open', 'folderOpen', 'act', _, M, 'Open a record (payroll run)'],
  ['OpenRecord', 'arrowSquareOut', 'act', _, M, 'Open the changed record'],
  ['Copy', 'copy', 'act', _, _, 'Copy'],
  ['Close', 'x', 'act', _, _, 'Close'],
  ['Check', 'check', 'act', _, _, 'Selected / done tick'],
  ['Excel', 'fileGrid', 'act', _, _, 'Export to Excel (generic sheet, no brand logo)'],
  ['Pdf', 'filePdf', 'act', _, _, 'Export to PDF (file with a P)'],
  // Status
  ['Empty', 'tray', 'status', _, _, 'Empty state'],
  ['Error', 'warningCircle', 'status', S, _, 'Error'],
  ['Ready', 'checkCircle', 'status', S, _, 'Ready / done'],
  ['Pending', 'hourglass', 'status', _, _, 'Pending'],
  ['Blocked', 'prohibit', 'status', S, _, 'Blocked'],
  ['Warning', 'warning', 'status', S, _, 'Warning toast'],
  ['Info', 'info', 'status', S, _, 'Info toast'],
  ['Created', 'plusCircle', 'status', S, _, 'Activity: created'],
  ['Cancelled', 'xCircle', 'status', S, _, 'Activity: cancelled'],
  ['Locked', 'lock', 'status', S, _, 'Sign-in locked'],
  ['Unlock', 'lockOpen', 'status', S, _, 'Unlock sign-in'],
  ['SameRule', 'equals', 'status', _, _, 'Tax rule unchanged'],
  ['OtherRule', 'notEquals', 'status', _, _, 'Tax rule differs'],
  ['Insured', 'shieldCheck', 'status', S, _, 'Insured employee'],
  // Money & payroll
  ['Gross', 'coins', 'money', _, _, 'Gross pay'],
  ['Money', 'coins', 'money', _, _, 'Money tag in activity'],
  ['Deductions', 'receipt', 'money', _, _, 'Deductions'],
  ['Payslip', 'receipt', 'money', _, _, 'Payslip'],
  ['NetPay', 'handCoins', 'money', _, _, 'Net pay'],
  // People & access
  ['Department', 'buildings', 'people', _, _, 'Department'],
  ['Stage', 'chalkboard', 'people', _, _, 'School stage (teacher at a board)'],
  ['WorkSystem', 'clock', 'people', _, _, 'Work system (hours)'],
  ['ManagesPeople', 'users', 'people', _, _, 'Job title that leads staff'],
  ['Anyone', 'users', 'people', _, _, 'Filter: anyone'],
  ['Person', 'userCircle', 'people', S, _, 'A person (activity actor)'],
  ['NoUser', 'userCircleDashed', 'people', _, _, 'No linked account'],
  ['AddUser', 'userPlus', 'people', _, _, 'Add a user'],
  ['LinkedEmployee', 'idCard', 'people', _, _, 'Linked employee'],
  ['SystemAdmin', 'shieldStar', 'people', S, _, 'System admin role'],
  ['CustomRole', 'sparkle', 'people', S, _, 'Custom role badge'],
  ['TemporaryPassword', 'key', 'people', _, _, 'Temporary password'],
  ['Password', 'lockKey', 'people', S, _, 'Password'],
  ['FailedSignIn', 'lockKey', 'people', _, _, 'Failed sign-in'],
  ['Email', 'envelope', 'people', _, _, 'Email'],
  // Notifications
  ['Notifications', 'bell', 'notif', S, _, 'Bell (solid while the panel is open)'],
  ['MarkAllRead', 'checks', 'notif', _, _, 'Mark all read'],
  ['NotificationSettings', 'gear', 'notif', _, _, 'Notification settings'],
  ['ContractEnd', 'fileText', 'notif', _, _, 'Contract ending'],
  ['ProbationEnd', 'hourglassMedium', 'notif', _, _, 'Probation ending'],
  ['LatenessDue', 'clockCountdown', 'notif', _, _, 'Lateness due'],
  ['PayrollDue', 'calendarCheck', 'notif', _, _, 'Payroll due'],
  // Arrows & chevrons
  ['ChevronStart', 'caretLeft', 'arrows', _, M, 'Back / previous'],
  ['ChevronEnd', 'caretRight', 'arrows', _, M, 'Next / forward'],
  ['ChevronFirst', 'caretDoubleLeft', 'arrows', _, M, 'First page'],
  ['ChevronLast', 'caretDoubleRight', 'arrows', _, M, 'Last page'],
  ['ChevronDown', 'caretDown', 'arrows', _, _, 'Expand'],
  ['SignIn', 'signIn', 'arrows', _, M, 'Sign in'],
  ['SignOut', 'signOut', 'arrows', _, M, 'Sign out'],
  // Misc
  ['Calendar', 'calendar', 'misc', S, _, 'Date picker'],
  ['RepeatsInDay', 'repeat', 'misc', _, _, 'Can repeat in a day'],
  ['Field', 'listSearch', 'misc', _, _, 'Changed field (activity)'],
];

// coverage check against icons.tsx (silhouettes are already custom, 64-grid avatars — kept as-is)
const src = fs.readFileSync(SRC, 'utf8');
const exported = [...src.matchAll(/^export (?:const|function) ([A-Za-z]+)Icon\b/gm)].map((m) => m[1]);
const SIL = ['MaleSilhouette', 'PersonSilhouette', 'FemaleSilhouette'];
const want = exported.filter((n) => !SIL.includes(n));
const have = E.map((e) => e[0]);
const missing = want.filter((n) => !have.includes(n)), extra = have.filter((n) => !want.includes(n));
const dup = have.filter((n, i) => have.indexOf(n) !== i);
if (missing.length || extra.length || dup.length) { console.error({ missing, extra, dup }); process.exit(1); }
for (const e of E) {
  if (!G[e[1]]) throw new Error('no glyph ' + e[1]);
  if (e[3] && !G[e[1]].s) throw new Error('no solid for ' + e[0]);
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const ATTR = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const outline = (g, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ${ATTR}${extra}>${G[g].o}</svg>`;
let uid = 0;
const solid = (g, idBase, extra = '') => {
  const s = G[g].s; const id = idBase || `m${++uid}`;
  const mask = s.cut
    ? `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${s.cut}</g></mask></defs>`
    : '';
  const m = s.cut ? ` mask="url(#${id})"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ${ATTR}${extra}>${mask}<g${m}><g fill="currentColor">${s.fill}</g>${s.keep || ''}</g>${s.over || ''}</svg>`;
};

// 1. SVG files
const OUT = ROOT + '/design/icons';
for (const d of ['outline', 'solid']) { fs.rmSync(`${OUT}/${d}`, { recursive: true, force: true }); fs.mkdirSync(`${OUT}/${d}`, { recursive: true }); }
for (const [name, g, , sol] of E) {
  fs.writeFileSync(`${OUT}/outline/${kebab(name)}.svg`, outline(g) + '\n');
  if (sol) fs.writeFileSync(`${OUT}/solid/${kebab(name)}.svg`, solid(g, `${kebab(name)}-cut`) + '\n');
}

// 2. Review page
const GROUPS = [
  ['nav', 'Navigation & modules', 'Sidebar pages, module groups and settings tabs. Every one has a solid version for its selected state.'],
  ['act', 'Actions', 'Buttons and menu items.'],
  ['status', 'Status', 'Pills, toasts, empty and error states.'],
  ['money', 'Money & payroll', 'Payroll figures.'],
  ['people', 'People & access', 'Employee facts, users, roles and passwords.'],
  ['notif', 'Notifications', 'The bell, its actions and one icon per kind of notification.'],
  ['arrows', 'Arrows & chevrons', 'Marked ⇄ mirror in Arabic (they point the reading direction).'],
  ['misc', 'Misc', ''],
];
const ic = (name) => E.find((e) => e[0] === name);
const O = (name, cls = '') => outline(ic(name)[1], cls ? ` class="${cls}"` : '');
const SO = (name, cls = '') => solid(ic(name)[1], null, cls ? ` class="${cls}"` : '');
const mir = (name) => (ic(name)[4] ? ' mirror' : '');

const cell = ([name, g, , sol, mirror, meaning]) => `
  <div class="cell" title="${meaning}">
    <div class="name">${name}${mirror ? ' <span class="tag" title="Mirrors in RTL">⇄</span>' : ''}</div>
    <div class="row">
      <div class="v"><span class="box">${outline(g)}</span><small>outline</small></div>
      <div class="v">${sol ? `<span class="box on">${solid(g)}</span><small>solid</small>` : '<span class="box none">—</span><small>&nbsp;</small>'}</div>
      <div class="v"><span class="box sm">${outline(g, ' width="16" height="16"')}</span><small>16</small></div>
    </div>
    <div class="mean">${meaning}${G[g] && E.filter((e) => e[1] === g).length > 1 ? `<br><span class="share">shares the drawing with ${E.filter((e) => e[1] === g && e[0] !== name).map((e) => e[0]).join(', ')}</span>` : ''}</div>
  </div>`;

const NAV = {
  en: { home: 'Home', dashboard: 'Dashboard', hr: 'HR', employees: 'Employees', penalties: 'Penalties', lateness: 'Lateness', payroll: 'Payroll', accounting: 'Accounting', approved: 'Approved pay', taxes: 'Payroll taxes', inventory: 'Inventory', students: 'Students', admin: 'Administration', settings: 'Settings', activity: 'Activity', users: 'Users', roles: 'Roles', soon: 'Soon', signout: 'Sign out', title: 'Sidebar · English' },
  ar: { home: 'الرئيسية', dashboard: 'لوحة التحكم', hr: 'الموارد البشرية', employees: 'الموظفون', penalties: 'الجزاءات', lateness: 'التأخير', payroll: 'الرواتب', accounting: 'الحسابات', approved: 'الرواتب المعتمدة', taxes: 'ضرائب الرواتب', inventory: 'المخازن', students: 'الطلاب', admin: 'الإدارة', settings: 'الإعدادات', activity: 'سجل النشاط', users: 'المستخدمون', roles: 'الأدوار', soon: 'قريبًا', signout: 'تسجيل الخروج', title: 'القائمة · العربية' },
};
const sidebar = (lang) => {
  const t = NAV[lang];
  const item = (icon, label, on = false) => `<a class="nav${on ? ' on' : ''}">${on ? SO(icon) : O(icon)}<span>${label}</span></a>`;
  const group = (icon, label, items, open = true, on = false) => `
    <div class="grp${on ? ' active' : ''}"><div class="ghead"><span class="gicon">${on ? SO(icon) : O(icon)}</span><span>${label}</span>${O('ChevronDown', 'chev' + (open ? '' : ' closed'))}</div>${open ? `<div class="gitems">${items}</div>` : ''}</div>`;
  const soon = (icon, label) => `<div class="grp soon"><div class="ghead"><span class="gicon">${O(icon)}</span><span>${label}</span><em>${t.soon}</em></div></div>`;
  return `<aside class="side card" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
    <p class="tagline">${t.title}</p>
    ${item('Dashboard', t.dashboard)}
    ${group('HrModule', t.hr, item('Staff', t.employees, true) + item('Penalties', t.penalties) + item('Lateness', t.lateness) + item('Payroll', t.payroll), true, true)}
    ${group('AccountingModule', t.accounting, item('Payroll', t.approved) + item('PayrollTaxes', t.taxes))}
    ${soon('InventoryModule', t.inventory)}
    ${soon('StudentsModule', t.students)}
    ${group('AdministrationModule', t.admin, item('Settings', t.settings) + item('Activity', t.activity) + item('Users', t.users) + item('Roles', t.roles))}
    <div class="sep"></div>
    <a class="nav">${O('SignOut', 'mirror')}<span>${t.signout}</span></a>
  </aside>`;
};

const tabs = (sel, lang = 'en') => {
  const L = lang === 'ar' ? ['الموظفون', 'السجل'] : ['Employees', 'History'];
  return `<div class="tabs" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${[['Staff', L[0]], ['History', L[1]]].map(([i, l], n) => `<button class="tab${n === sel ? ' on' : ''}">${n === sel ? SO(i) : O(i)}${l}</button>`).join('')}</div>`;
};
const settingsTabs = (sel) => `<div class="tabs">${[['School', 'School'], ['Structure', 'Structure'], ['Lists', 'Lists'], ['Rules', 'HR rules'], ['History', 'History']].map(([i, l], n) => `<button class="tab${n === sel ? ' on' : ''}">${n === sel ? SO(i) : O(i)}${l}</button>`).join('')}</div>`;

const toolbar = (lang = 'en', filterOn = false) => {
  const ar = lang === 'ar';
  return `<div class="toolbar" dir="${ar ? 'rtl' : 'ltr'}">
    <label class="search">${O('Search')}<input placeholder="${ar ? 'ابحث بالاسم أو الكود' : 'Search by name or code'}"></label>
    <button class="btn${filterOn ? ' active' : ''}">${filterOn ? SO('Filter') : O('Filter')}<span>${ar ? 'تصفية' : 'Filter'}</span>${filterOn ? '<b class="count">2</b>' : ''}</button>
    <button class="btn">${O('Export')}<span>${ar ? 'تصدير' : 'Export'}</span></button>
    <button class="btn icon" aria-label="More">${O('More')}</button>
    <button class="btn primary"><span class="badge">${O('Add')}</span><span>${ar ? 'إضافة موظف' : 'Add employee'}</span></button>
  </div>`;
};

const CMP = [['Dashboard', 'squares-four'], ['Employees', 'users-three'], ['Penalties', 'gavel'], ['Lateness', 'clock'], ['Payroll', 'wallet'], ['Settings', 'sliders-horizontal'], ['Notifications', 'bell'], ['Roles', 'shield-check']];

const counts = { outline: E.length, solid: E.filter((e) => e[3]).length, glyphs: new Set(E.map((e) => e[1])).size };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Custom icon set</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=IBM+Plex+Sans+Arabic:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/duotone/style.css">
<style>
  :root{--bg:#f2f8f6;--fg:#11302b;--card:#fff;--muted:#587069;--primary:#0b7a68;--deep:#0a5a4d;--psoft:#d5efe8;--accent:#ffc43d;--border:#dce9e5;--mutedfill:#f5faf8}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:"Plus Jakarta Sans","IBM Plex Sans Arabic",sans-serif;padding:28px 24px 64px}
  [dir=rtl],[lang=ar]{font-family:"IBM Plex Sans Arabic","Plus Jakarta Sans",sans-serif}
  .wrap{max-width:1320px;margin:0 auto}
  h1{font-size:24px;font-weight:800;margin:0 0 6px}
  .sub{color:var(--muted);font-size:14px;margin:0 0 6px;max-width:900px;line-height:1.5}
  .stats{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 8px}
  .stat{background:var(--card);border:1px solid var(--border);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600}
  .stat b{color:var(--primary)}
  h2{font-size:18px;font-weight:800;margin:36px 0 4px}
  .why{color:var(--muted);font-size:13px;margin:0 0 14px;max-width:820px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:18px}
  svg{display:block;color:var(--deep);flex:none}
  [dir=rtl] .mirror{transform:scaleX(-1)}
  /* grid */
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:12px}
  .cell{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:12px 12px 10px;display:flex;flex-direction:column;gap:8px;min-width:0}
  .name{font-size:13px;font-weight:700;overflow-wrap:anywhere}
  .tag{display:inline-block;font-size:11px;background:var(--psoft);color:var(--deep);border-radius:6px;padding:0 5px;margin-inline-start:4px}
  .cell .row{display:flex;gap:8px;align-items:flex-end}
  .v{display:flex;flex-direction:column;align-items:center;gap:4px}
  .v small{font-size:10px;color:var(--muted)}
  .box{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--mutedfill)}
  .box.on{background:var(--psoft)}
  .box.on svg{color:var(--primary)}
  .box.none{color:var(--border);font-size:14px;background:none;border:1px dashed var(--border)}
  
  .mean{font-size:11px;color:var(--muted);line-height:1.4}
  .share{color:#7b918b;font-style:italic}
  /* scale strip */
  .scale{display:flex;flex-direction:column;gap:14px;padding:16px}
  .scale div{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--muted)}
  .scale b{width:28px;font-weight:700}
  /* context */
  .ctx{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
  .side{width:264px;padding:14px 12px;flex:none}
  .tagline{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:0 6px 10px}
  [lang=ar] .tagline{letter-spacing:0}
  .nav{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:12px;font-size:14px;font-weight:600;color:#2c4842;text-decoration:none;cursor:default}
  .nav svg{width:20px;height:20px;color:#3d5a53}
  .nav.on{background:var(--psoft);color:var(--deep)}
  .nav.on svg{color:var(--primary)}
  .grp{margin-top:6px}
  .ghead{display:flex;align-items:center;gap:10px;padding:8px 10px;font-size:13px;font-weight:700;color:#2c4842}
  .ghead .gicon{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:var(--mutedfill)}
  .ghead .gicon svg{width:18px;height:18px;color:#3d5a53}
  .grp.active .gicon{background:var(--primary)}
  .grp.active .gicon svg{color:#fff}
  .ghead .chev{width:16px;height:16px;margin-inline-start:auto;color:var(--muted)}
  .ghead .chev.closed{transform:rotate(-90deg)}
  [dir=rtl] .ghead .chev.closed{transform:rotate(90deg)}
  .ghead em{margin-inline-start:auto;font-style:normal;font-size:11px;font-weight:700;background:var(--accent);color:#3b2a00;border-radius:999px;padding:2px 8px}
  .grp.soon{opacity:.75}
  .gitems{padding-inline-start:20px}
  .sep{height:1px;background:var(--border);margin:10px 6px}
  .panel{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px}
  .panel .card{padding:16px}
  .tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);overflow-x:auto}
  .tab{display:flex;align-items:center;gap:8px;border:0;background:none;font:inherit;font-size:14px;font-weight:600;color:var(--muted);padding:10px 14px;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
  .tab svg{width:20px;height:20px;color:inherit}
  .tab.on{color:var(--deep);border-bottom-color:var(--primary)}
  .tab.on svg{color:var(--primary)}
  .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .search{flex:1 1 220px;display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:12px;padding:0 12px;height:40px;background:#fff}
  .search svg{width:18px;height:18px;color:var(--muted)}
  .search input{border:0;outline:0;font:inherit;font-size:14px;flex:1;min-width:0;background:none}
  .btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:1px solid var(--border);border-radius:12px;background:#fff;font:inherit;font-size:14px;font-weight:600;color:var(--fg)}
  .btn svg{width:18px;height:18px;color:var(--deep)}
  .btn.icon{padding:0;width:40px;justify-content:center}
  .btn.active{background:var(--psoft);border-color:#b9e0d5;color:var(--deep)}
  .btn.active svg{color:var(--primary)}
  .count{background:var(--primary);color:#fff;border-radius:999px;font-size:11px;padding:1px 7px}
  .btn.primary{background:var(--primary);border-color:var(--primary);color:#fff;padding-inline-start:8px;box-shadow:0 6px 16px -8px rgba(11,122,104,.6)}
  .badge{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.18)}
  .badge svg{width:16px;height:16px;color:#fff;stroke-width:2}
  .lbl{font-size:12px;font-weight:700;color:var(--muted);margin:0 0 8px}
  /* compare */
  .cmp{display:grid;grid-template-columns:repeat(8,1fr);gap:10px;padding:16px}
  .cmp .c{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11px;color:var(--muted);text-align:center}
  .cmp .pair{display:flex;gap:10px;align-items:center}
  .cmp i{font-size:28px;color:var(--primary);line-height:1}
  .cmp svg{width:28px;height:28px}
  .cmp .k{display:flex;gap:10px;font-size:10px;color:#8aa09a}
  .rtlrow{display:flex;gap:20px;flex-wrap:wrap;padding:14px 16px;align-items:center}
  .rtlrow .pair{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--muted)}
  @media (max-width:900px){.cmp{grid-template-columns:repeat(4,1fr)}}
  @media (max-width:600px){
    body{padding:20px 16px 48px}
    .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .cell{padding:10px}
    .cell .row{gap:6px}
    .box{width:36px;height:36px}
    .side{width:100%}
    .toolbar .btn span:not(.badge){display:none}
    .toolbar .btn{padding:0;width:40px;justify-content:center}
    .toolbar .btn.primary{width:auto;padding:0 12px 0 8px}
    .toolbar .btn.active{width:auto;padding:0 10px}
    .toolbar .btn.primary span:last-child{display:inline}
    .cmp{grid-template-columns:repeat(2,1fr)}
  }
</style>
</head>
<body><div class="wrap">
<h1>Custom icon set — precise monoline, solid when selected</h1>
<p class="sub">Every icon the app uses, drawn on one 24-point grid: 1.5 line, round ends and joins, 2.5 corner radius, 2 points of padding. Outline everywhere; the selected sidebar item, tab or toggle switches to the solid version of the same shape (inner details are cut out, so it works on any background). Single colour — <code>currentColor</code>, shown here in deep teal.</p>
<p class="sub">Review only — not wired into the app yet. Sources: <code>design/icons/outline/*.svg</code> and <code>design/icons/solid/*.svg</code>.</p>
<div class="stats"><span class="stat"><b>${counts.outline}</b> exports</span><span class="stat"><b>${counts.glyphs}</b> drawings</span><span class="stat"><b>${counts.solid}</b> with a solid version</span><span class="stat"><b>${E.filter((e) => e[4]).length}</b> mirror in Arabic</span></div>

<h2>In context</h2>
<p class="why">The real menu, English and Arabic. Employees is selected, so it and its HR group show the solid icons.</p>
<div class="ctx">
  ${sidebar('en')}
  ${sidebar('ar')}
  <div class="panel">
    <div class="card"><p class="lbl">Employee profile tabs</p>${tabs(0)}<div style="height:12px"></div>${tabs(1)}<div style="height:12px"></div>${tabs(0, 'ar')}</div>
    <div class="card"><p class="lbl">Settings tabs</p>${settingsTabs(2)}</div>
    <div class="card"><p class="lbl">Toolbar</p>${toolbar()}<div style="height:12px"></div>${toolbar('en', true)}<div style="height:12px"></div>${toolbar('ar')}</div>
  </div>
</div>

<h2>Next to today's icons</h2>
<p class="why">Eight key icons: today's Phosphor duotone on the left, the custom drawing on the right (outline, then solid).</p>
<div class="card cmp">${CMP.map(([n, ph]) => `<div class="c"><div class="pair"><i class="ph-duotone ph-${ph}"></i>${O(n)}${SO(n)}</div><div class="k"><span>today</span><span>new</span><span>solid</span></div>${n}</div>`).join('')}</div>

<h2>Sizes</h2>
<p class="why">The same icons at 16, 20 and 24 points.</p>
<div class="card scale">${[16, 20, 24].map((s) => `<div><b>${s}</b>${['Dashboard', 'Employees', 'Penalties', 'Lateness', 'Payroll', 'PayrollTaxes', 'Settings', 'Notifications', 'Search', 'Filter', 'Edit', 'Remove', 'Ready', 'Warning'].map((n) => O(n).replace('width="24" height="24"', `width="${s}" height="${s}"`)).join('')}</div>`).join('')}</div>

${GROUPS.map(([k, title, why]) => `
<h2>${title}</h2>${why ? `<p class="why">${why}</p>` : ''}
${k === 'arrows' ? `<div class="card rtlrow" dir="rtl" lang="ar"><span class="lbl" style="margin:0">في العربية:</span>${E.filter((e) => e[4]).map((e) => `<span class="pair">${O(e[0], 'mirror')}${e[0]}</span>`).join('')}</div><div style="height:12px"></div>` : ''}
<div class="grid">${E.filter((e) => e[2] === k).map(cell).join('')}</div>`).join('')}

<h2>Not redrawn</h2>
<p class="why">MaleSilhouette, FemaleSilhouette and PersonSilhouette are already custom avatar shapes on their own 64 grid (avatars-basic.html) and stay as they are.</p>
</div></body></html>`;

fs.writeFileSync(ROOT + '/design/mockups/icon-set.html', html);
console.log(counts, 'mirror', E.filter((e) => e[4]).map((e) => e[0]).join(', '));
