// @vitest-environment jsdom
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/en/payroll';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import GlobalError from './global-error';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const error = (digest?: string) => Object.assign(new Error('root layout failed'), digest ? { digest } : {});

describe('global-error', () => {
  it('EN: its own document, LTR, system fonts, one inline SVG, the code, a retry button and no inline handlers', () => {
    pathname = '/en/payroll';
    const html = renderToString(<GlobalError error={error('3141592653')} />);
    expect(html).toMatch(/<html lang="en" dir="ltr">/);
    expect(html).toContain('<title>Something went wrong</title>');
    expect(html).toContain('The app couldn&#x27;t load. Please try again in a moment.');
    expect(html).toContain('3141592653');
    expect(html).toContain('>Try again</button>');
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain('system-ui');
    // Nothing the CSP would block: no inline event handler attributes, no external stylesheet or font.
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/<link|@import|url\(/);
    expect(html).not.toContain('root layout failed');
  });

  it('AR: the language comes from the first path segment', () => {
    pathname = '/ar/employees/12';
    const html = renderToString(<GlobalError error={error('7')} />);
    expect(html).toMatch(/<html lang="ar" dir="rtl">/);
    expect(html).toContain('حدث خطأ ما');
    expect(html).toContain('حاول مرة أخرى');
  });

  it('an address without a language gets English', () => {
    pathname = '/';
    expect(renderToString(<GlobalError error={error('7')} />)).toMatch(/<html lang="en" dir="ltr">/);
  });
});
