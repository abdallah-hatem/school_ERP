import { settingsHref, type Uuid } from '@school-erp/shared';
import { notFound } from 'next/navigation';
import type { Locale } from '@/shared/lib/i18n';
import { GET_CONTRACT_TEMPLATE } from './apis';
import { TemplateEditor } from './components/template-editor';
import { ContractTemplatesSection } from './components/templates-list';
import { ContractTemplatesI18n } from './messages';

/*
 * Contract templates' screens (spec docs/specs/2026-11-24-contract-templates.md → Screens).
 */

const listHref = (locale: Locale) => settingsHref(locale, 'contractTemplates');
const editorBase = (locale: Locale) => `/${locale}/settings/contract-templates`;

/** Server: the template editor — a new one, or an existing one by id (404 outside: not found). */
export async function TemplateEditorScreen({ locale, id }: { locale: Locale; id?: Uuid }) {
  let template = null;
  if (id) {
    const res = await GET_CONTRACT_TEMPLATE(id);
    if (!res.success) {
      if (res.unauthorized) throw new Error(res.message);
      if (res.status === 404 || res.status === 400) notFound();
      throw new Error(res.message);
    }
    template = res.data ?? null;
  }
  return (
    <ContractTemplatesI18n locale={locale}>
      <TemplateEditor key={template ? `${template.id}-${template.version}` : 'new'} template={template} listHref={listHref(locale)} />
    </ContractTemplatesI18n>
  );
}

/** Settings → Contract templates (composed into the Settings screen by its route). */
export function ContractTemplatesSettingsSection({ locale }: { locale: Locale }) {
  return (
    <ContractTemplatesI18n locale={locale}>
      <ContractTemplatesSection editorHref={editorBase(locale)} />
    </ContractTemplatesI18n>
  );
}
