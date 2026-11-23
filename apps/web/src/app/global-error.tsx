'use client';

import arUi from '@school-erp/shared/locales/ar/ui.json';
import enUi from '@school-erp/shared/locales/en/ui.json';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useErrorReference } from '@/shared/lib/error-reference';

/*
 * The whole app failed (the root layout itself threw), so nothing of it can be trusted: no layout,
 * no app CSS, no web fonts, no icon set, no providers (design/mockups/error-pages.html → D). System
 * fonts, one inline SVG and inline styles, so it renders even when the app's CSS or fonts fail.
 * The words come from the shared locale files (`ui.errorPages`). Under the nonce CSP (src/proxy.ts)
 * Next's own scripts carry the nonce and `style-src` allows inline styles; there are no inline
 * event-handler attributes (React's `onClick` is not one).
 */

const PAGE_CSS = `
html,body{margin:0;min-height:100%}
body{display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;
  background:#f2f8f6;color:#11302b;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",Tahoma,sans-serif;
  -webkit-font-smoothing:antialiased;line-height:1.5}
.ge{max-width:420px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
.ge h1{margin:6px 0 0;font-size:26px;line-height:1.2;font-weight:800;outline:none}
.ge p{margin:0;color:#587069;font-size:15px}
.ge button{margin-top:10px;font:inherit;font-weight:700;font-size:15px;background:#0b7a68;color:#fff;border:0;border-radius:14px;
  padding:12px 22px;min-height:46px;cursor:pointer}
.ge button:hover{background:#096656}
.ge button:focus-visible{outline:3px solid rgb(11 122 104 / .55);outline-offset:2px}
.ge small{color:#587069;font-size:12.5px;margin-top:6px}
.ge code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.04em;direction:ltr;unicode-bidi:isolate}
`;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const pathname = usePathname() ?? '';
  const locale = pathname.split('/')[1] === 'ar' ? 'ar' : 'en';
  const text = (locale === 'ar' ? arUi : enUi).errorPages;
  const code = useErrorReference(error);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <head>
        <title>{text.errorTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{PAGE_CSS}</style>
      </head>
      <body>
        <main className="ge">
          <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
            <circle cx="36" cy="36" r="34" fill="#fff1c9" />
            <circle cx="36" cy="36" r="24" fill="#ffc43d" />
            <rect x="33" y="22" width="6" height="18" rx="3" fill="#4a3400" />
            <circle cx="36" cy="47.5" r="3.4" fill="#4a3400" />
          </svg>
          <h1 ref={heading} tabIndex={-1}>
            {text.errorTitle}
          </h1>
          <p>{text.globalBody}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {text.retry}
          </button>
          <small>
            {`${text.globalCode}: `}
            <code>{code}</code>
          </small>
        </main>
      </body>
    </html>
  );
}
