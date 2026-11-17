import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { RoleScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('roles');

/** Add a custom role; `?from=<id>` starts from that role's permissions (Duplicate). */
export default async function NewRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ locale }, { from }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <RoleScreen locale={locale} from={typeof from === 'string' ? from : undefined} />;
}
