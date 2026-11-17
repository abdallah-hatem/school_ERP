import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { SettingsScreen } from '../components/settings-screen';
import { getSettingsMessages } from '../i18n';
import { parseSection } from '../sections';

/** Settings (§7): the module's namespace on top of the base translations, then the screen. */
export function SettingsPage({ locale, section }: { locale: Locale; section?: string | string[] }) {
  return (
    <I18nProvider messages={{ settings: getSettingsMessages(locale) } as unknown as MessageTree}>
      <SettingsScreen initialSection={parseSection(section)} />
    </I18nProvider>
  );
}
