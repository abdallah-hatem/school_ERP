'use client';

import { createContext, useContext, useEffect } from 'react';

/**
 * Unsaved-changes tracking for the Settings screen. A section reports whether its form has edits
 * (`useReportDirty`); the screen asks before switching section, following a link or closing the
 * tab while it does (`useLeaveGuard`).
 */
const DirtyContext = createContext<(source: string, dirty: boolean) => void>(() => {});

export const DirtyReporterProvider = DirtyContext.Provider;

/**
 * Call from a form with its `isDirty`; `source` tells forms of one section apart (the school form
 * and the logo card). Unmounting clears it.
 */
export function useReportDirty(source: string, dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(source, dirty);
    return () => report(source, false);
  }, [source, dirty, report]);
}

// The leave guard is shared with other screens that edit (the contract template editor).
export { useLeaveGuard } from '@/shared/hooks/use-leave-guard';
