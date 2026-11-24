import { describe, expect, it } from 'vitest';
import { CONTRACT_FIELD_KEYS, CONTRACT_SALARY_FIELDS, type ContractFieldKey, type ContractFieldValues } from './fields';
import { EMPTY_FIELD_TEXT, fillContractDocument, renderContractDocument, valuesOfFilledDocument } from './render';
import {
  CONTRACT_DOCUMENT_MAX_BYTES,
  documentUsesSalary,
  fieldsOfDocument,
  parseContractDocument,
  type ContractDocument,
  type InlineNode,
} from './schema';
import { contractFieldValues, formatContractDate, formatContractSalary, type ContractValueSource } from './values';

const field = (key: ContractFieldKey): InlineNode => ({ type: 'field', attrs: { key } });
const text = (t: string): InlineNode => ({ type: 'text', text: t });
const para = (...content: InlineNode[]): ContractDocument['content'][number] => ({ type: 'paragraph', content });
const doc = (...content: ContractDocument['content']): ContractDocument => ({ type: 'doc', content });

const allValues = (over: Partial<ContractFieldValues> = {}): ContractFieldValues => {
  const out = {} as ContractFieldValues;
  for (const key of CONTRACT_FIELD_KEYS) out[key] = `v:${key}`;
  return { ...out, ...over };
};

const SOURCE: ContractValueSource = {
  employee: {
    code: 'EMP-0006',
    nameEn: 'Nadia Fouad Ramadan',
    nameAr: 'نادية فؤاد رمضان',
    nationalId: null,
    address: '14 شارع النصر',
    jobTitle: { nameEn: 'Accountant', nameAr: 'محاسبة' },
    department: { nameEn: 'Finance', nameAr: 'الشؤون المالية' },
    stage: null,
    hireDate: '2021-09-01',
    workSystem: 'FULL_TIME',
    basicSalary: 950_000,
  },
  contract: { startsOn: '2026-06-01', endsOn: '2027-05-31' },
  school: {
    nameEn: 'Sample School',
    nameAr: 'مدرسة تجريبية',
    addressEn: '',
    addressAr: '5 شارع المعرفة',
    signatoryNameEn: '',
    signatoryNameAr: 'أ. هشام كامل',
    signatoryTitleEn: '',
    signatoryTitleAr: 'مدير المدرسة',
  },
  today: '2026-06-02',
};

describe('contractFieldValues', () => {
  it('fills every field in the copy’s language with Western digits', () => {
    const ar = contractFieldValues(SOURCE, 'AR');
    expect(ar['contract.start']).toBe('1 يونيو 2026');
    expect(ar['contract.end']).toBe('31 مايو 2027');
    expect(ar['contract.salary']).toBe('9,500 جنيه');
    expect(ar['contract.salaryWords']).toBe('تسعة آلاف وخمسمائة جنيه مصري لا غير');
    expect(ar['employee.jobTitle']).toBe('محاسبة');
    expect(ar['school.representative']).toBe('أ. هشام كامل، مدير المدرسة');
    expect(ar.today).toBe('2 يونيو 2026');
    const en = contractFieldValues(SOURCE, 'EN');
    expect(en['contract.salary']).toBe('EGP 9,500');
    expect(en['contract.salaryWords']).toBe('Nine thousand five hundred Egyptian pounds only');
    expect(en['contract.salaryWordsAr']).toBe('تسعة آلاف وخمسمائة جنيه مصري لا غير');
    expect(en['contract.workSystem']).toBe('Full-time');
    expect(en['contract.start']).toBe('1 June 2026');
  });

  it('edge case 19: school address or signatory not set → the field is empty', () => {
    const en = contractFieldValues(SOURCE, 'EN');
    expect(en['school.address']).toBeNull();
    expect(en['school.representative']).toBeNull();
  });

  it('edge case 20: the employee’s main stage is "no stage" → the Stage field is empty', () => {
    expect(contractFieldValues(SOURCE, 'AR')['employee.stage']).toBeNull();
  });

  it('edge case 21: salary with piastres prints "9,500.50 جنيه"', () => {
    const values = contractFieldValues({ ...SOURCE, employee: { ...SOURCE.employee, basicSalary: 950_050 } }, 'AR');
    expect(values['contract.salary']).toBe('9,500.50 جنيه');
    expect(values['contract.salaryWords']).toBe('تسعة آلاف وخمسمائة جنيه مصري وخمسون قرشًا لا غير');
    expect(formatContractSalary(100_000_000, 'EN')).toBe('EGP 1,000,000');
  });

  it('a salary the reader may not see leaves every salary field empty', () => {
    const values = contractFieldValues({ ...SOURCE, employee: { ...SOURCE.employee, basicSalary: null } }, 'AR');
    for (const key of CONTRACT_SALARY_FIELDS) expect(values[key]).toBeNull();
  });

  it('formats dates day, month name, year', () => {
    expect(formatContractDate('2026-11-24', 'AR')).toBe('24 نوفمبر 2026');
    expect(formatContractDate('2026-11-24', 'EN')).toBe('24 November 2026');
  });
});

describe('renderContractDocument', () => {
  it('escapes every text and value: no user HTML reaches the page', () => {
    const { html } = renderContractDocument(doc(para(text('<script>x</script>'), field('employee.nameEn'))), {
      language: 'EN',
      values: allValues({ 'employee.nameEn': '"><img src=x onerror=alert(1)>' }),
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('sets the direction and language of the copy, whatever the screen', () => {
    expect(renderContractDocument(doc(para(text('a'))), { language: 'AR', values: {} }).html).toMatch(/^<article class="cd-doc" dir="rtl" lang="ar">/);
    expect(renderContractDocument(doc(para(text('a'))), { language: 'EN', values: {} }).html).toMatch(/dir="ltr" lang="en"/);
  });

  it('edge case 6: an empty field outside [ ] prints a dotted line and is listed', () => {
    const r = renderContractDocument(doc(para(text('ID: '), field('employee.nationalId'))), {
      language: 'AR',
      values: allValues({ 'employee.nationalId': null }),
    });
    expect(r.html).toContain(EMPTY_FIELD_TEXT);
    expect(r.emptyFields).toEqual(['employee.nationalId']);
    expect(r.phrasesLeftOut).toEqual([]);
  });

  it('edge case 6: an empty field inside [ ] leaves the phrase out, and the warning names it', () => {
    const r = renderContractDocument(
      doc(para(text('Works in '), { type: 'optional', content: [{ type: 'text', text: ', stage ' }, { type: 'field', attrs: { key: 'employee.stage' } }] })),
      { language: 'EN', values: allValues({ 'employee.stage': null }) },
    );
    expect(r.html).not.toContain(', stage');
    expect(r.html).not.toContain(EMPTY_FIELD_TEXT);
    expect(r.emptyFields).toEqual([]);
    expect(r.phrasesLeftOut).toEqual([['employee.stage']]);
  });

  it('edge case 7: an optional phrase with two fields, one empty → the whole phrase is left out', () => {
    const r = renderContractDocument(
      doc(
        para({
          type: 'optional',
          content: [
            { type: 'text', text: 'Stage ' },
            { type: 'field', attrs: { key: 'employee.stage' } },
            { type: 'text', text: ' in ' },
            { type: 'field', attrs: { key: 'employee.department' } },
          ],
        }),
      ),
      { language: 'EN', values: allValues({ 'employee.stage': null }) },
    );
    expect(r.html).not.toContain('v:employee.department');
    expect(r.html).not.toContain('Stage ');
    expect(r.phrasesLeftOut).toEqual([['employee.stage']]);
  });

  it('an optional phrase whose fields all have values prints in full', () => {
    const r = renderContractDocument(
      doc(para({ type: 'optional', content: [{ type: 'text', text: 'Stage ' }, { type: 'field', attrs: { key: 'employee.stage' } }] })),
      { language: 'EN', values: allValues() },
    );
    expect(r.html).toContain('Stage ');
    expect(r.html).toContain('v:employee.stage');
  });

  it('highlight marks filled and empty values for the preview, and flags left-out phrases', () => {
    const r = renderContractDocument(
      doc(para(field('employee.code'), field('employee.nationalId'), { type: 'optional', content: [{ type: 'field', attrs: { key: 'employee.stage' } }] })),
      {
        language: 'EN',
        values: allValues({ 'employee.nationalId': null, 'employee.stage': null }),
        highlight: true,
        leftOutText: (keys) => `${keys.join(',')} left out`,
      },
    );
    expect(r.html).toContain('cd-filled');
    expect(r.html).toContain('cd-empty cd-mark');
    expect(r.html).toContain('employee.stage left out');
  });

  it('hidden salary fields show greyed, not their value, and count as filled for phrases', () => {
    const r = renderContractDocument(doc(para(field('contract.salary'))), {
      language: 'AR',
      values: allValues({ 'contract.salary': null }),
      hidden: ['contract.salary'],
      hiddenText: 'hidden',
    });
    expect(r.html).toContain('cd-hidden');
    expect(r.html).toContain('hidden');
    expect(r.emptyFields).toEqual([]);
  });

  it('edge case 22: typed {{name}} stays plain text — only chips are fields', () => {
    const r = renderContractDocument(doc(para(text('{{employee.nameEn}}'))), { language: 'EN', values: allValues() });
    expect(r.html).toContain('{{employee.nameEn}}');
    expect(r.fields).toEqual([]);
  });

  it('edge case 26: a long Arabic text with Latin codes, a table and a manual page break renders them all', () => {
    const long = doc(
      para(text('كود الموظف '), field('employee.code'), text(' — '.repeat(5))),
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('البند'))] }, { type: 'tableHeader', content: [para(text('القيمة'))] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('الأجر'))] }, { type: 'tableCell', content: [para(field('contract.salary'))] }] },
        ],
      },
      { type: 'pageBreak' },
      para(text('الصفحة الثانية')),
    );
    const r = renderContractDocument(long, { language: 'AR', values: allValues({ 'employee.code': 'EMP-0006' }) });
    expect(r.html).toContain('<table class="cd-table">');
    expect(r.html).toContain('<th dir="auto">');
    expect(r.html).toContain('class="cd-page-break"');
    // The Latin code sits isolated inside the Arabic line.
    expect(r.html).toContain('<bdi>EMP-0006</bdi>');
  });

  it('is pure: the same input renders the same HTML', () => {
    const d = doc(para(text('a'), field('today')), { type: 'orderedList', content: [{ type: 'listItem', content: [para(text('x'))] }] });
    const options = { language: 'EN' as const, values: allValues() };
    expect(renderContractDocument(d, options).html).toBe(renderContractDocument(d, options).html);
  });

  it('renders marks, alignment, headings and lists from the schema only', () => {
    const r = renderContractDocument(
      doc(
        { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [text('Title')] },
        para({ type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'underline' }] }),
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [para(text('three'))] }] },
      ),
      { language: 'EN', values: {} },
    );
    expect(r.html).toContain('<h1 dir="auto" class="cd-a-center">Title</h1>');
    expect(r.html).toContain('<strong><u>b</u></strong>');
    expect(r.html).toContain('<ol start="3">');
  });
});

describe('fillContractDocument (the copy as printed)', () => {
  it('keeps each value inline and drops the phrases left out', () => {
    const d = doc(para(field('employee.code'), { type: 'optional', content: [{ type: 'text', text: ' stage ' }, { type: 'field', attrs: { key: 'employee.stage' } }] }));
    const filled = fillContractDocument(d, allValues({ 'employee.code': 'EMP-0006', 'employee.stage': null }));
    expect(JSON.stringify(filled)).toContain('"value":"EMP-0006"');
    expect(JSON.stringify(filled)).not.toContain('stage');
    expect(valuesOfFilledDocument(filled)).toEqual({ 'employee.code': 'EMP-0006' });
  });

  it('edge case 27: a kept document re-renders on its own, without the template or the values', () => {
    const d = doc(para(text('Salary '), field('contract.salary')));
    const filled = fillContractDocument(d, allValues({ 'contract.salary': '9,500 جنيه' }));
    const again = renderContractDocument(filled, { language: 'AR', values: valuesOfFilledDocument(filled) });
    expect(again.html).toContain('9,500 جنيه');
  });
});

describe('parseContractDocument', () => {
  it('accepts what the editor makes', () => {
    const r = parseContractDocument(doc(para(text('a'), field('today'))), { requireContent: true });
    expect(r.ok).toBe(true);
  });

  it('edge case 8: saving an optional phrase with no field is refused', () => {
    expect(parseContractDocument(doc(para({ type: 'optional', content: [{ type: 'text', text: 'x' }] })))).toEqual({
      ok: false,
      problem: 'OPTIONAL_PHRASE_NEEDS_FIELD',
    });
    expect(parseContractDocument(doc(para({ type: 'optional' })))).toEqual({ ok: false, problem: 'OPTIONAL_PHRASE_NEEDS_FIELD' });
  });

  it('an optional phrase can’t hold another optional phrase', () => {
    const nested = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'optional', content: [{ type: 'optional', content: [] }] }] }] };
    expect(parseContractDocument(nested)).toEqual({ ok: false, problem: 'CONTRACT_DOCUMENT_INVALID' });
  });

  it('edge case 22: pasted nodes outside the schema (images, colours, fonts) are refused by the API', () => {
    const image = { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] };
    const colour = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'textStyle', attrs: { color: 'red' } }] }] }] };
    expect(parseContractDocument(image).ok).toBe(false);
    expect(parseContractDocument(colour).ok).toBe(false);
  });

  it('an unknown field key is refused: a template can only name a field that exists', () => {
    const r = parseContractDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'field', attrs: { key: 'employee.password' } }] }] });
    expect(r).toEqual({ ok: false, problem: 'CONTRACT_DOCUMENT_INVALID' });
  });

  it('edge case 23: a template over 200 KB is refused', () => {
    const big = doc(para(text('x'.repeat(CONTRACT_DOCUMENT_MAX_BYTES))));
    expect(parseContractDocument(big)).toEqual({ ok: false, problem: 'TEMPLATE_TOO_LONG' });
  });

  it('an empty Arabic text can’t be saved', () => {
    expect(parseContractDocument(doc(para()), { requireContent: true })).toEqual({ ok: false, problem: 'TEMPLATE_TEXT_EMPTY' });
    expect(parseContractDocument(doc(para()))).toMatchObject({ ok: true });
  });

  it('finds the fields used and whether a salary is among them', () => {
    const d = doc(para(field('employee.code'), field('contract.salaryWords'), field('employee.code')));
    expect(fieldsOfDocument(d)).toEqual(['employee.code', 'contract.salaryWords']);
    expect(documentUsesSalary(d, (k) => CONTRACT_SALARY_FIELDS.includes(k))).toBe(true);
    expect(documentUsesSalary(doc(para(field('employee.code'))), (k) => CONTRACT_SALARY_FIELDS.includes(k))).toBe(false);
  });
});
