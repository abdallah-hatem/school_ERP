'use client';

import type { AccountingPayrollLine } from '@school-erp/shared';
import { useEffect, useState } from 'react';

/**
 * Print / PDF of a whole month (or statement): every line is read from the API first (`load`, pages
 * of 500), handed to the tables as `printRows`, and the browser's print opens once they are drawn —
 * never the page or the search on screen. `rows` stays for a second print.
 */
export function usePrintEveryLine<K extends string>(load: () => Promise<Record<K, AccountingPayrollLine[]> | null>) {
  const [rows, setRows] = useState<Record<K, AccountingPayrollLine[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [due, setDue] = useState(0);
  useEffect(() => {
    if (due > 0) window.print();
  }, [due]);
  async function print() {
    if (busy) return;
    setBusy(true);
    try {
      const all = await load();
      if (!all) return;
      setRows(all);
      setDue((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  return { rows, busy, print };
}
