import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { ProfileEmployeeDetails } from '@/modules/hr/employees';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/**
 * Employee profile — the "Details" tab. The employee comes from the profile layout, which already
 * loaded it, so switching back to this tab fetches nothing.
 */
export default async function EmployeeProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ProfileEmployeeDetails basePath={`/${locale}/employees`} />;
}
