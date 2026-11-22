// Custom icon set — style G (precise monoline) + solid-when-selected (style I).
// 24×24, live area 2–22, stroke 1.5, round caps/joins.
// Each glyph: o = outline markup (strokes, fill none).
// s (optional) = solid: { fill: shapes filled+stroked in currentColor (masked),
//                         keep: strokes kept as lines (masked), cut: knock-outs drawn black in the mask,
//                         over: strokes drawn on top, unmasked }

const f2 = (n) => +n.toFixed(2);
const dot = (x, y, w = 2) => `<path stroke-width="${w}" d="M${x} ${y}h0"/>`;
const pol = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [f2(cx + r * Math.cos(a)), f2(cy + r * Math.sin(a))];
};

function gear(cx, cy, Ro, Ri, n, ht, hb) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    const b1 = pol(cx, cy, Ri, a - hb), t1 = pol(cx, cy, Ro, a - ht), t2 = pol(cx, cy, Ro, a + ht), b2 = pol(cx, cy, Ri, a + hb);
    const nb = pol(cx, cy, Ri, a + 360 / n - hb);
    d += `${i === 0 ? 'M' : 'L'}${b1}L${t1}A${Ro} ${Ro} 0 0 1 ${t2}L${b2}A${Ri} ${Ri} 0 0 1 ${nb}`;
  }
  return d + 'Z';
}
function star(cx, cy, Ro, Ri, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) pts.push(pol(cx, cy, i % 2 ? Ri : Ro, (i * 180) / n));
  return 'M' + pts.map((p) => p.join(' ')).join('L') + 'Z';
}
function seal(cx, cy, R, r, n = 8) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pol(cx, cy, R, (i * 360) / n + 180 / n), q = pol(cx, cy, R, ((i + 1) * 360) / n + 180 / n);
    d += (i === 0 ? `M${p}` : '') + `A${r} ${r} 0 0 1 ${q}`;
  }
  return d + 'Z';
}

// shared parts
const FILE = 'M13.75 3.25H7a2.5 2.5 0 0 0-2.5 2.5v12.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5V9z';
const FOLD = 'M13.75 3.25V7a2 2 0 0 0 2 2h3.75';
const FILE_IN = 'M13.75 3.25H7a2.5 2.5 0 0 0-2.5 2.5v12.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5V9z';
const CAL = '<rect x="3.5" y="4.75" width="17" height="16" rx="2.5"/>';
const CAL_O = `${CAL}<path d="M3.5 9.75h17M8 2.75v4M16 2.75v4"/>`;
const CAL_S = (inner) => ({ fill: CAL, keep: '<path d="M8 2.75v4M16 2.75v4"/>', cut: `<path d="M1 9.75h22"/>${inner}`, over: '' });
const CIRCLE = '<circle cx="12" cy="12" r="9"/>';
const circ = (inner, cut = inner) => ({ o: CIRCLE + inner, s: { fill: CIRCLE, cut } });
const RECEIPT = 'M5 20.75V5.75a2.5 2.5 0 0 1 2.5-2.5h9a2.5 2.5 0 0 1 2.5 2.5v15l-2.33-1.5-2.34 1.5-2.33-1.5-2.33 1.5-2.34-1.5z';
const LOCK_BODY = '<rect x="4.5" y="10.25" width="15" height="10.75" rx="2.5"/>';
const SHIELD = 'M12 3 5.25 5.6a1.25 1.25 0 0 0-.75 1.15v4.6c0 4.5 3 7.95 7.5 9.65 4.5-1.7 7.5-5.15 7.5-9.65v-4.6a1.25 1.25 0 0 0-.75-1.15z';
const USER_HEAD = '<circle cx="9.5" cy="7.75" r="3.75"/>';
const USER_BODY = 'M3 20c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5';
const PERSON_IN_CIRCLE = '<circle cx="12" cy="10" r="3.25"/><path d="M6.3 18.65c1.25-2.25 3.4-3.65 5.7-3.65s4.45 1.4 5.7 3.65"/>';
const HIST_ARC = 'M3.5 12a8.5 8.5 0 1 0 2.49-6.01L3.75 8.25';
const HIST_HEAD = 'M3.75 4v4.25H8';
const HOUR = 'M6 3.25h12M6 20.75h12M7 3.25v3.1c0 .9.4 1.75 1.1 2.3L12 12l3.9-3.35c.7-.55 1.1-1.4 1.1-2.3v-3.1M7 20.75v-3.1c0-.9.4-1.75 1.1-2.3L12 12l3.9 3.35c.7.55 1.1 1.4 1.1 2.3v3.1';
const BIG_GEAR = gear(12, 12, 9, 7, 6, 11, 19);
const SMALL_GEAR = gear(17.5, 17.25, 3.9, 2.9, 6, 14, 24);

const G = {
  grid: {
    o: '<rect x="3" y="3" width="8" height="10" rx="2.5"/><rect x="13" y="3" width="8" height="6" rx="2.5"/><rect x="13" y="11" width="8" height="10" rx="2.5"/><rect x="3" y="15" width="8" height="6" rx="2.5"/>',
    s: { fill: '<rect x="3" y="3" width="8" height="10" rx="2.5"/><rect x="13" y="3" width="8" height="6" rx="2.5"/><rect x="13" y="11" width="8" height="10" rx="2.5"/><rect x="3" y="15" width="8" height="6" rx="2.5"/>' },
  },
  usersThree: {
    o: '<circle cx="12" cy="7.75" r="3.25"/><path d="M6.5 20c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5"/><circle cx="4.75" cy="10" r="2"/><circle cx="19.25" cy="10" r="2"/><path d="M2.75 18.75c0-2 1.3-3.6 3.1-4M21.25 18.75c0-2-1.3-3.6-3.1-4"/>',
    s: {
      fill: '<circle cx="12" cy="7.75" r="3.25"/><path d="M6.5 20c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5z"/><circle cx="4.75" cy="10" r="2"/><circle cx="19.25" cy="10" r="2"/>',
      keep: '<path d="M2.75 18.75c0-2 1.3-3.6 3.1-4M21.25 18.75c0-2-1.3-3.6-3.1-4"/>',
    },
  },
  users: {
    o: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.31 2.69-6 6-6s6 2.69 6 6"/><circle cx="16.75" cy="8.75" r="2.75"/><path d="M16.75 14.1c2.65.35 4.5 2.65 4.5 5.9"/>',
    s: {
      fill: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.31 2.69-6 6-6s6 2.69 6 6z"/><circle cx="16.75" cy="8.75" r="2.75"/>',
      keep: '<path d="M16.75 14.1c2.65.35 4.5 2.65 4.5 5.9"/>',
    },
  },
  gavel: {
    o: '<g transform="translate(-.25 .5) rotate(45 12 12)"><rect x="8.25" y="2.5" width="7.5" height="6.5" rx="1.5"/><path d="M12 9v10.5"/></g><path d="M13.75 20.75h7.5"/>',
    s: { fill: '<rect x="8.25" y="2.5" width="7.5" height="6.5" rx="1.5" transform="translate(-.25 .5) rotate(45 12 12)"/>', keep: '<path d="M12 9v10.5" transform="translate(-.25 .5) rotate(45 12 12)"/><path d="M13.75 20.75h7.5"/>' },
  },
  stopwatch: {
    o: '<circle cx="12" cy="13.25" r="7.75"/><path d="M10 2.75h4M12 2.75v2.75M18.25 6.5l1.25-1.25M12 9.5v3.75l2.5 1.5"/>',
    s: { fill: '<circle cx="12" cy="13.25" r="7.75"/>', keep: '<path d="M10 2.75h4M12 2.75v2.75M18.25 6.5l1.25-1.25"/>', cut: '<path d="M12 9.5v3.75l2.5 1.5"/>' },
  },
  wallet: {
    o: '<rect x="3" y="6.5" width="18" height="14" rx="2.5"/><path d="M5.5 6.5l9.8-2.9a1.75 1.75 0 0 1 2.2 1.68V6.5M21 11h-3.5a2.25 2.25 0 0 0 0 4.5H21"/>',
    s: { fill: '<rect x="3" y="6.5" width="18" height="14" rx="2.5"/>', keep: '<path d="M5.5 6.5l9.8-2.9a1.75 1.75 0 0 1 2.2 1.68V6.5"/>', cut: '<path d="M20.25 11h-2.75a2.25 2.25 0 0 0 0 4.5h2.75"/>' },
  },
  sliders: {
    o: '<path d="M3.5 7h9.5M18 7h2.5M3.5 17h2.5M11 17h9.5"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>',
    s: { fill: '<circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>', keep: '<path d="M3.5 7h9.5M18 7h2.5M3.5 17h2.5M11 17h9.5"/>' },
  },
  signOut: { o: '<path d="M9.5 3.75H6.25a2.5 2.5 0 0 0-2.5 2.5v11.5a2.5 2.5 0 0 0 2.5 2.5H9.5M9.5 12h11M16.75 8.25 20.5 12l-3.75 3.75"/>' },
  signIn: { o: '<path d="M14.5 3.75h3.25a2.5 2.5 0 0 1 2.5 2.5v11.5a2.5 2.5 0 0 1-2.5 2.5H14.5M3.5 12h11M10.75 8.25 14.5 12l-3.75 3.75"/>' },
  calculator: {
    o: `<rect x="4.5" y="2.75" width="15" height="18.5" rx="2.5"/><rect x="7.5" y="5.75" width="9" height="4" rx="1"/>${dot(8.5, 13.75)}${dot(12, 13.75)}${dot(15.5, 13.75)}${dot(8.5, 17.5)}${dot(12, 17.5)}${dot(15.5, 17.5)}`,
    s: {
      fill: '<rect x="4.5" y="2.75" width="15" height="18.5" rx="2.5"/>',
      cut: `<rect x="7.5" y="5.75" width="9" height="4" rx="1" fill="#000" stroke="none"/>${dot(8.5, 13.75)}${dot(12, 13.75)}${dot(15.5, 13.75)}${dot(8.5, 17.5)}${dot(12, 17.5)}${dot(15.5, 17.5)}`,
    },
  },
  package: {
    o: '<path d="M12 2.75 20.25 7.25v9.5L12 21.25 3.75 16.75v-9.5z"/><path d="M3.75 7.25 12 11.75l8.25-4.5M12 11.75v9.5M7.9 5l8.2 4.5"/>',
    s: { fill: '<path d="M12 2.75 20.25 7.25v9.5L12 21.25 3.75 16.75v-9.5z"/>', cut: '<path d="M5.15 8 12 11.75 18.85 8M12 11.75v8M8.9 5.55l7.2 3.95"/>' },
  },
  student: {
    o: '<path d="M2.75 9 12 4.75 21.25 9 12 13.25z"/><path d="M6.5 11.5v4.25c0 1.5 2.46 3 5.5 3s5.5-1.5 5.5-3V11.5M21.25 9v5"/>',
    s: { fill: '<path d="M2.75 9 12 4.75 21.25 9 12 13.25z"/>', keep: '<path d="M6.5 11.5v4.25c0 1.5 2.46 3 5.5 3s5.5-1.5 5.5-3V11.5M21.25 9v5"/>' },
  },
  buildings: {
    o: `<path d="M4 20.75V5.5A2.5 2.5 0 0 1 6.5 3h5A2.5 2.5 0 0 1 14 5.5v15.25M14 9.25h4.5A2.5 2.5 0 0 1 21 11.75v9M2.75 20.75h18.5"/>${dot(7.25, 7)}${dot(10.75, 7)}${dot(7.25, 10.5)}${dot(10.75, 10.5)}${dot(7.25, 14)}${dot(10.75, 14)}${dot(17.5, 13)}${dot(17.5, 16.5)}`,
    s: {
      fill: '<path d="M4 20.75V5.5A2.5 2.5 0 0 1 6.5 3h5A2.5 2.5 0 0 1 14 5.5v15.25z"/><path d="M14 9.25h4.5A2.5 2.5 0 0 1 21 11.75v9H14z"/>',
      keep: '<path d="M2.75 20.75h18.5"/>',
      cut: `${dot(7.25, 7)}${dot(10.75, 7)}${dot(7.25, 10.5)}${dot(10.75, 10.5)}${dot(7.25, 14)}${dot(10.75, 14)}${dot(17.5, 13)}${dot(17.5, 16.5)}<path d="M14 10v9.25"/>`,
    },
  },
  chalkboard: {
    o: '<rect x="3" y="3.5" width="18" height="12" rx="2.5"/><path d="M7 7.75h6M7 11.25h4M8.25 15.5 6.5 20.75M15.75 15.5l1.75 5.25"/>',
  },
  clock: { o: CIRCLE + '<path d="M12 7.25V12l-3.25 3"/>' },
  history: {
    o: `<path d="${HIST_ARC}"/><path d="${HIST_HEAD}M12 7.75V12l3 2"/>`,
    s: { fill: '<circle cx="12" cy="12" r="8.5"/>', cut: `<path d="M12 7.75V12l3 2"/><path stroke-width="3.75" d="${HIST_HEAD}"/>`, over: `<path d="${HIST_HEAD}"/>` },
  },
  repeat: { o: '<path d="M3.5 11.5V10A3.5 3.5 0 0 1 7 6.5h13.25M17.25 3.5l3 3-3 3M20.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H3.75M6.75 20.5l-3-3 3-3"/>' },
  list: { o: '<path d="M3.75 6.5h16.5M3.75 12h16.5M3.75 17.5h16.5"/>' },
  x: { o: '<path d="M5.75 5.75l12.5 12.5M18.25 5.75 5.75 18.25"/>' },
  caretLeft: { o: '<path d="M14.75 5.5 8.25 12l6.5 6.5"/>' },
  caretRight: { o: '<path d="M9.25 5.5 15.75 12l-6.5 6.5"/>' },
  caretDoubleLeft: { o: '<path d="M18 5.5 11.5 12l6.5 6.5M12 5.5 5.5 12l6.5 6.5"/>' },
  caretDoubleRight: { o: '<path d="M6 5.5 12.5 12 6 18.5M12 5.5l6.5 6.5-6.5 6.5"/>' },
  caretDown: { o: '<path d="M5.5 9.25 12 15.75l6.5-6.5"/>' },
  check: { o: '<path d="M4.5 12.75l4.75 4.75L19.5 7.25"/>' },
  search: { o: '<circle cx="10.75" cy="10.75" r="7"/><path d="M15.75 15.75l4.5 4.5"/>' },
  calendar: { o: CAL_O, s: CAL_S('') },
  calendarPlus: { o: CAL_O + '<path d="M12 12.75v5M9.5 15.25h5"/>', s: CAL_S('<path d="M12 12.75v5M9.5 15.25h5"/>') },
  calendarCheck: { o: CAL_O + '<path d="M9.25 15.25l1.9 1.9 3.6-3.65"/>', s: CAL_S('<path d="M9.25 15.25l1.9 1.9 3.6-3.65"/>') },
  retry: { o: '<path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01L20.25 8.25M20.25 4v4.25H16"/>' },
  restore: { o: `<path d="${HIST_ARC}${HIST_HEAD}"/>` },
  recalc: { o: '<path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 4.5v4h-4M20 12a8 8 0 0 1-13.66 5.66L4 15.5M4 19.5v-4h4"/>' },
  plus: { o: '<path d="M12 5v14M5 12h14"/>' },
  dots: { o: `${dot(5.5, 12, 2.5)}${dot(12, 12, 2.5)}${dot(18.5, 12, 2.5)}` },
  pencil: { o: '<path d="M4 20l1-4.25L15.5 5.25a2.12 2.12 0 0 1 3 3L8 18.75z"/><path d="M13.5 7.25l3 3"/>' },
  userMinus: { o: USER_HEAD + `<path d="${USER_BODY}M17 10.75h4.25"/>` },
  userCheck: { o: USER_HEAD + `<path d="${USER_BODY}M16.75 10.75l1.5 1.5 3-3"/>` },
  userPlus: { o: USER_HEAD + `<path d="${USER_BODY}M19.125 8.625v4.25M17 10.75h4.25"/>` },
  eye: {
    o: '<path d="M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="3.25"/>',
    s: { fill: '<path d="M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12z"/>', cut: '<circle cx="12" cy="12" r="3.25"/>' },
  },
  eyeSlash: { o: '<path d="M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="3.25"/><path d="M4.5 4.5l15 15"/>' },
  trash: { o: '<path d="M3.75 6.5h16.5M9 6.5V5a1.75 1.75 0 0 1 1.75-1.75h2.5A1.75 1.75 0 0 1 15 5v1.5M5.75 6.5l.9 12.2A2.5 2.5 0 0 0 9.14 21h5.72a2.5 2.5 0 0 0 2.49-2.3l.9-12.2M10 10.5v6M14 10.5v6"/>' },
  upload: { o: '<path d="M12 15V3.75M7.5 8.25 12 3.75l4.5 4.5M3.75 14.5v3.75a2.5 2.5 0 0 0 2.5 2.5h11.5a2.5 2.5 0 0 0 2.5-2.5V14.5"/>' },
  archive: { o: '<rect x="3" y="3.75" width="18" height="4.5" rx="1.5"/><path d="M4.75 8.25V18.5A2.5 2.5 0 0 0 7.25 21h9.5a2.5 2.5 0 0 0 2.5-2.5V8.25M10 12h4"/>' },
  fileDown: { o: `<path d="${FILE}"/><path d="${FOLD}M12 11.75v6M9.5 15.25 12 17.75l2.5-2.5"/>` },
  fileText: { o: `<path d="${FILE}"/><path d="${FOLD}M8.5 12.75h7M8.5 16.25h4.5"/>` },
  fileGrid: { o: `<path d="${FILE}"/><path d="${FOLD}"/><path d="M8 12h8v6H8zM8 15h8M12 12v6"/>` },
  filePdf: { o: `<path d="${FILE}"/><path d="${FOLD}M9.75 18v-6h2.25a2 2 0 0 1 0 4H9.75"/>` },
  seal: {
    o: `<path d="${seal(12, 12, 7.7, 2.6, 10)}"/><path d="M8.6 12.2l2.3 2.3 4.5-4.7"/>`,
    s: { fill: `<path d="${seal(12, 12, 7.7, 2.6, 10)}"/>`, cut: '<path d="M8.6 12.2l2.3 2.3 4.5-4.7"/>' },
  },
  printer: { o: `<path d="M7 8.25V4.5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 .75.75v3.75M7 17.25H5.5A2.5 2.5 0 0 1 3 14.75v-4A2.5 2.5 0 0 1 5.5 8.25h13a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H17M7 13.75h10v6.5H7z"/>${dot(17.25, 11)}` },
  plusMinus: { o: '<path d="M7.75 4v6.5M4.5 7.25H11M13 16.75h6.5M18.5 5.5l-13 13"/>' },
  coins: {
    o: '<ellipse cx="12" cy="7.75" rx="7.5" ry="3.25"/><path d="M4.5 7.75v9c0 1.8 3.36 3.25 7.5 3.25s7.5-1.45 7.5-3.25v-9M4.5 12.25c0 1.8 3.36 3.25 7.5 3.25s7.5-1.45 7.5-3.25"/>',
  },
  receipt: { o: `<path d="${RECEIPT}"/><path d="M8.75 8h6.5M8.75 11.5h6.5M8.75 15h4"/>` },
  receiptTax: {
    o: `<path d="${RECEIPT}"/><path d="M8.75 7.75h6.5M14.75 11l-5.5 5.25"/>${dot(9.5, 11.25)}${dot(14.5, 16)}`,
    s: { fill: `<path d="${RECEIPT}"/>`, cut: `<path d="M8.75 7.75h6.5M14.75 11l-5.5 5.25"/>${dot(9.5, 11.25)}${dot(14.5, 16)}` },
  },
  handCoins: { o: '<circle cx="15.5" cy="6.75" r="3.75"/><path d="M11 15.5h2.25a1.75 1.75 0 0 0 0-3.5H10c-.6 0-1.15.24-1.55.66L3.5 17.5M7.25 20.75l1.3-1.2c.35-.35.85-.55 1.35-.55h4.1c1 0 1.95-.4 2.65-1.1l3.9-4a1.75 1.75 0 0 0-2.5-2.45l-3.55 3.4M2.75 16l5 4.75"/>' },
  folderOpen: { o: '<path d="M3.5 18.25V6a2.25 2.25 0 0 1 2.25-2.25h3.4c.5 0 1 .2 1.35.55L12 5.75h5.25A2.25 2.25 0 0 1 19.5 8v1.75"/><path d="M3.5 18.25 6 11.4a2.25 2.25 0 0 1 2.1-1.65h11.9a1.25 1.25 0 0 1 1.18 1.66l-2.35 7.04A2.25 2.25 0 0 1 16.7 20H5.25a1.75 1.75 0 0 1-1.75-1.75z"/>' },
  arrowSquareOut: { o: '<path d="M20.25 13.5v4.25a2.5 2.5 0 0 1-2.5 2.5H6.25a2.5 2.5 0 0 1-2.5-2.5V6.25a2.5 2.5 0 0 1 2.5-2.5h4.25M14 3.75h6.25V10M20.25 3.75 11.5 12.5"/>' },
  tray: { o: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 13.5h4.5l1.5 2.5h6l1.5-2.5H21"/>' },
  warningCircle: circ(`<path d="M12 7.5v5.25"/>${dot(12, 16.25)}`),
  checkCircle: circ('<path d="M8.25 12.25l2.5 2.5 5-5"/>'),
  info: circ(`<path d="M12 11v5.5"/>${dot(12, 7.75)}`),
  plusCircle: circ('<path d="M12 8v8M8 12h8"/>'),
  xCircle: circ('<path d="M9 9l6 6M15 9l-6 6"/>'),
  prohibit: { o: CIRCLE + '<path d="M5.64 5.64l12.72 12.72"/>', s: { fill: CIRCLE, cut: '<path d="M6.7 6.7l10.6 10.6"/>' } },
  hourglass: { o: `<path d="${HOUR}"/>` },
  hourglassMedium: { o: `<path d="${HOUR}"/><path d="M9.5 18.5h5L12 16.5z"/>` },
  warning: {
    o: `<path d="M10.27 4.2a2 2 0 0 1 3.46 0l7.07 12.25a2 2 0 0 1-1.73 3H4.93a2 2 0 0 1-1.73-3z"/><path d="M12 9.25v4.5"/>${dot(12, 16.5)}`,
    s: { fill: '<path d="M10.27 4.2a2 2 0 0 1 3.46 0l7.07 12.25a2 2 0 0 1-1.73 3H4.93a2 2 0 0 1-1.73-3z"/>', cut: `<path d="M12 9.25v4.5"/>${dot(12, 16.5)}` },
  },
  tree: {
    o: '<rect x="9" y="3" width="6" height="4.5" rx="1.5"/><rect x="3" y="16.5" width="6" height="4.5" rx="1.5"/><rect x="15" y="16.5" width="6" height="4.5" rx="1.5"/><path d="M12 7.5v5M6 16.5v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>',
    s: { fill: '<rect x="9" y="3" width="6" height="4.5" rx="1.5"/><rect x="3" y="16.5" width="6" height="4.5" rx="1.5"/><rect x="15" y="16.5" width="6" height="4.5" rx="1.5"/>', keep: '<path d="M12 7.5v5M6 16.5v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>' },
  },
  listBullets: {
    o: `${dot(4.5, 6.5)}${dot(4.5, 12)}${dot(4.5, 17.5)}<path d="M8.5 6.5h11.25M8.5 12h11.25M8.5 17.5h11.25"/>`,
    s: { fill: '<circle cx="4.5" cy="6.5" r=".9"/><circle cx="4.5" cy="12" r=".9"/><circle cx="4.5" cy="17.5" r=".9"/>', keep: '<path d="M8.5 6.5h11.25M8.5 12h11.25M8.5 17.5h11.25"/>' },
  },
  scales: {
    o: '<path d="M12 4v16.5M8 20.5h8M5.25 6.5h13.5M5.25 6.5 2.75 13M5.25 6.5 7.75 13M18.75 6.5 16.25 13M18.75 6.5 21.25 13M2.75 13a2.5 2.5 0 0 0 5 0zM16.25 13a2.5 2.5 0 0 0 5 0z"/>',
    s: { fill: '<path d="M2.75 13a2.5 2.5 0 0 0 5 0zM16.25 13a2.5 2.5 0 0 0 5 0z"/>', keep: '<path d="M12 4v16.5M8 20.5h8M5.25 6.5h13.5M5.25 6.5 2.75 13M5.25 6.5 7.75 13M18.75 6.5 16.25 13M18.75 6.5 21.25 13"/>' },
  },
  funnel: { o: '<path d="M3.75 4.25h16.5l-6.5 7.75v6.75l-3.5 2V12z"/>', s: { fill: '<path d="M3.75 4.25h16.5l-6.5 7.75v6.75l-3.5 2V12z"/>' } },
  eraser: { o: '<path d="M8.25 20.75 4.1 16.6a1.75 1.75 0 0 1 0-2.47l9.53-9.53a1.75 1.75 0 0 1 2.47 0l4.15 4.15a1.75 1.75 0 0 1 0 2.47l-9.53 9.53M8.25 20.75H20M8.5 9.75l6.61 6.61"/>' },
  lockKey: {
    o: `${LOCK_BODY}<path d="M8 10.25v-3a4 4 0 0 1 8 0v3"/><circle cx="12" cy="14.75" r="1.25"/><path d="M12 16v1.75"/>`,
    s: { fill: LOCK_BODY, keep: '<path d="M8 10.25v-3a4 4 0 0 1 8 0v3"/>', cut: '<circle cx="12" cy="14.75" r="1.25" fill="#000"/><path d="M12 16v1.75"/>' },
  },
  lock: { o: `${LOCK_BODY}<path d="M8 10.25v-3a4 4 0 0 1 8 0v3"/>`, s: { fill: LOCK_BODY, keep: '<path d="M8 10.25v-3a4 4 0 0 1 8 0v3"/>' } },
  lockOpen: { o: `${LOCK_BODY}<path d="M8 10.25v-3a4 4 0 0 1 7.8-1.25"/>`, s: { fill: LOCK_BODY, keep: '<path d="M8 10.25v-3a4 4 0 0 1 7.8-1.25"/>' } },
  gear: { o: `<path d="${BIG_GEAR}"/><circle cx="12" cy="12" r="3"/>`, s: { fill: `<path d="${BIG_GEAR}"/>`, cut: '<circle cx="12" cy="12" r="2.25" fill="#000" stroke="none"/>' } },
  listSearch: { o: '<path d="M3.75 6.5h16.5M3.75 12h5.5M3.75 17.5h5.5"/><circle cx="15.75" cy="14.75" r="3.5"/><path d="M18.25 17.25l2.5 2.5"/>' },
  userCircle: {
    o: CIRCLE + PERSON_IN_CIRCLE,
    s: { fill: CIRCLE, cut: '<circle cx="12" cy="10" r="3.25" fill="#000" stroke="none"/><path fill="#000" stroke="none" d="M6.3 18.65c1.25-2.25 3.4-3.65 5.7-3.65s4.45 1.4 5.7 3.65A9 9 0 0 1 6.3 18.65z"/>', over: CIRCLE },
  },
  userCircleDashed: { o: '<circle cx="12" cy="12" r="9" stroke-dasharray="1.6 3.11"/>' + PERSON_IN_CIRCLE },
  userGear: {
    o: `<circle cx="9.5" cy="7.75" r="3.5"/><path d="M3 20.25c0-3.45 2.91-6.25 6.5-6.25.9 0 1.75.17 2.5.48"/><path d="${SMALL_GEAR}"/><circle cx="17.5" cy="17.25" r="1"/>`,
    s: {
      fill: `<circle cx="9.5" cy="7.75" r="3.5"/><path d="M3 20.25c0-3.45 2.91-6.25 6.5-6.25.9 0 1.75.17 2.5.48v5.77z"/><path d="${SMALL_GEAR}"/>`,
      cut: '<circle cx="17.5" cy="17.25" r="1.2" fill="#000" stroke="none"/>',
    },
  },
  shieldCheck: { o: `<path d="${SHIELD}"/><path d="M9 12.25l2.1 2.1 4-4.1"/>`, s: { fill: `<path d="${SHIELD}"/>`, cut: '<path d="M9 12.25l2.1 2.1 4-4.1"/>' } },
  shieldStar: {
    o: `<path d="${SHIELD}"/><path d="${star(12, 11.9, 3.9, 1.75)}"/>`,
    s: { fill: `<path d="${SHIELD}"/>`, cut: `<path fill="#000" d="${star(12, 11.9, 3.6, 1.6)}"/>` },
  },
  key: { o: `<circle cx="15.25" cy="8.75" r="5.25"/><path d="M11.54 12.46 3.5 20.5M5.75 18.25 8 20.5M8.25 15.75 10 17.5"/>${dot(16.6, 7.4)}` },
  copy: { o: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>' },
  idCard: { o: '<rect x="2.75" y="4.75" width="18.5" height="14.5" rx="2.5"/><circle cx="8.5" cy="10.25" r="2.25"/><path d="M5.25 16.25c.45-1.55 1.75-2.6 3.25-2.6s2.8 1.05 3.25 2.6M14.75 10h3.5M14.75 13.75h3.5"/>' },
  sparkle: { o: '<path d="M12 3.5c.85 4.95 2.55 6.65 8.5 8.5-5.95 1.85-7.65 3.55-8.5 8.5-.85-4.95-2.55-6.65-8.5-8.5 5.95-1.85 7.65-3.55 8.5-8.5z"/>', s: { fill: '<path d="M12 3.5c.85 4.95 2.55 6.65 8.5 8.5-5.95 1.85-7.65 3.55-8.5 8.5-.85-4.95-2.55-6.65-8.5-8.5 5.95-1.85 7.65-3.55 8.5-8.5z"/>' } },
  envelope: { o: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.75 7.5 12 13l8.25-5.5"/>' },
  equals: { o: '<path d="M5 9.25h14M5 14.75h14"/>' },
  notEquals: { o: '<path d="M5 9.25h14M5 14.75h14M15.25 4.75l-6.5 14.5"/>' },
  bell: {
    o: '<path d="M6 10.25a6 6 0 0 1 12 0v3.6c0 .6.15 1.2.45 1.7l.95 1.7H4.6l.95-1.7c.3-.5.45-1.1.45-1.7z"/><path d="M9.75 19.75a2.5 2.5 0 0 0 4.5 0"/>',
    s: { fill: '<path d="M6 10.25a6 6 0 0 1 12 0v3.6c0 .6.15 1.2.45 1.7l.95 1.7H4.6l.95-1.7c.3-.5.45-1.1.45-1.7z"/>', keep: '<path d="M9.75 19.75a2.5 2.5 0 0 0 4.5 0"/>' },
  },
  checks: { o: '<path d="M2.75 12.5 7 16.75l9.25-9.25M11.75 15.5l1.25 1.25 8.25-8.25"/>' },
  clockCountdown: { o: `<path d="M12 3a9 9 0 1 1-6.36 15.36"/>${dot(3.08, 13.17)}${dot(4.21, 7.5)}${dot(8.56, 3.68)}<path d="M12 7.5V12l3 2"/>` },
};

module.exports = { G };
