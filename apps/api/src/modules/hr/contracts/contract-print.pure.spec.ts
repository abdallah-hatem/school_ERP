import { CONTRACT_FIELD_KEYS, type ContractFieldValues } from '@school-erp/shared';
import { contractFooterTemplate, contractPdfHtml, contractYearLabel, copyDownloadName, printValuesHash } from './contract-print.pure';

const values = (over: Partial<ContractFieldValues> = {}): ContractFieldValues => {
  const out = {} as ContractFieldValues;
  for (const key of CONTRACT_FIELD_KEYS) out[key] = `v:${key}`;
  return { ...out, ...over };
};
const FONTS = { arabic400: 'data:a4', arabic700: 'data:a7', latin400: 'data:l4', latin700: 'data:l7' };

describe('copyDownloadName', () => {
  it('edge case 25 — the download name is built from the code, the contract year and the template, never typed text', () => {
    expect(copyDownloadName('EMP-0006', '2026-06-01', 'Full-time contract')).toBe('EMP-0006-2026-27-full-time-contract.pdf');
    expect(copyDownloadName('EMP-0006', '2026-06-01', '../../etc <script>')).toBe('EMP-0006-2026-27-etc-script.pdf');
    expect(copyDownloadName('EMP-0006', '2026-06-01', 'عقد')).toBe('EMP-0006-2026-27-contract.pdf');
  });

  it('names the contract year by its start', () => {
    expect(contractYearLabel('2099-06-01')).toBe('2099-00');
    expect(contractYearLabel('2027-03-01')).toBe('2026-27');
  });
});

describe('printValuesHash', () => {
  it('edge case 15 — any value, the version or the language changing changes the hash', () => {
    const base = printValuesHash({ versionId: 'v1', language: 'AR', values: values() });
    expect(printValuesHash({ versionId: 'v1', language: 'AR', values: values() })).toBe(base);
    expect(printValuesHash({ versionId: 'v1', language: 'AR', values: values({ 'contract.salary': '10,500 جنيه' }) })).not.toBe(base);
    expect(printValuesHash({ versionId: 'v2', language: 'AR', values: values() })).not.toBe(base);
    expect(printValuesHash({ versionId: 'v1', language: 'EN', values: values() })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the PDF page', () => {
  it('loads nothing from outside: its own CSP, fonts as data URLs, the shared CSS', () => {
    const html = contractPdfHtml('<article class="cd-doc"></article>', FONTS, 'AR');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("src:url(data:a4) format('woff2')");
    expect(html).toContain('.cd-doc{');
    expect(html).toContain('dir="rtl"');
  });

  it('the footer names the school and the template, escaped, with page N of M in the copy’s language', () => {
    const footer = contractFooterTemplate({ schoolName: 'A & B', templateName: '<x>', language: 'EN', fonts: FONTS });
    expect(footer).toContain('A &amp; B — &lt;x&gt;');
    expect(footer).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
    expect(contractFooterTemplate({ schoolName: 'م', templateName: 'ع', language: 'AR', fonts: FONTS })).toContain('صفحة');
  });
});
