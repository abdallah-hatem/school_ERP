'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SchoolBranding } from './branding';

interface BrandingValue {
  branding: SchoolBranding;
  /** Saving the school name or logo (Settings screen) updates the shell at once. */
  setBranding: (next: SchoolBranding) => void;
}

const BrandingContext = createContext<BrandingValue | null>(null);

export function SchoolBrandingProvider({
  initial,
  children,
}: {
  initial: SchoolBranding;
  children: ReactNode;
}) {
  const [branding, setBranding] = useState(initial);
  const value = useMemo(() => ({ branding, setBranding }), [branding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useSchoolBranding(): BrandingValue {
  const value = useContext(BrandingContext);
  if (!value) throw new Error('useSchoolBranding must be used inside <SchoolBrandingProvider>');
  return value;
}
