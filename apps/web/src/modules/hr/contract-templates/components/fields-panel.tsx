'use client';

import { CONTRACT_FIELD_KEYS, type ContractFieldKey, type ContractLanguage } from '@school-erp/shared';
import { useId, useState } from 'react';
import { SearchInput } from '@/shared/components/form/filter-controls';
import { AddIcon, ContractFieldIcon, OptionalPhraseIcon } from '@/shared/components/ui/icons';
import { matchesSearch } from '@/shared/lib/search';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { fieldName, FIELDS_BY_GROUP, fieldSample, languageOfLocale, otherLanguage } from '../lib/fields';

/**
 * The Fields panel (spec → Screens; mockup A): the 19 fields in their four groups, each with its
 * name in the screen's language, the other language's name and a sample in the document's
 * language; a click puts the chip at the cursor. The search narrows this fixed list in the browser:
 * it is code (`CONTRACT_FIELDS`), not records.
 */
export function FieldsPanel({
  documentLanguage,
  onInsert,
  className,
  sheet = false,
  searchId,
}: {
  documentLanguage: ContractLanguage;
  onInsert: (key: ContractFieldKey) => void;
  className?: string;
  /** Inside the phone's bottom sheet: no own title row (the sheet has one). */
  sheet?: boolean;
  /** The search box's id (the toolbar's "Insert field" focuses it). */
  searchId?: string;
}) {
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState('');
  const headingId = useId();
  const screen = languageOfLocale(locale);
  const other = otherLanguage(screen);
  const text = (key: ContractFieldKey) => ({
    name: fieldName(key, screen),
    otherName: fieldName(key, other),
    sample: fieldSample(key, documentLanguage),
  });
  const matches = (key: ContractFieldKey) => {
    const f = text(key);
    return matchesSearch(query, [f.name, f.otherName, f.sample ?? '']);
  };
  const groups = FIELDS_BY_GROUP.map((g) => ({ ...g, keys: g.keys.filter(matches) })).filter((g) => g.keys.length > 0);

  return (
    <section
      aria-labelledby={sheet ? undefined : headingId}
      aria-label={sheet ? t('contractTemplates.editor.fields.title') : undefined}
      data-skeleton-block="fields-panel"
      data-skeleton-measure="width"
      className={cn('flex min-h-0 flex-col', className)}
    >
      <div className={cn('flex flex-col gap-3 px-4 pt-4', sheet && 'pt-1')}>
        {sheet ? null : (
          <div className="flex items-center justify-between gap-2">
            <h2 id={headingId} className="flex items-center gap-2 font-display text-lg font-extrabold">
              <ContractFieldIcon className="size-5 text-primary" />
              {t('contractTemplates.editor.fields.title')}
            </h2>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold tabular-nums">{CONTRACT_FIELD_KEYS.length}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">{t('contractTemplates.editor.fields.hint')}</p>
        <SearchInput
          id={searchId}
          aria-label={t('contractTemplates.editor.fields.search')}
          placeholder={t('contractTemplates.editor.fields.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          wrapperClassName="basis-auto flex-none"
        />
      </div>
      <div className="scrollbar-clean mt-3 min-h-0 flex-1 overflow-y-auto border-t border-border px-2 pb-2">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t('contractTemplates.editor.fields.noMatches', { query: query.trim() })}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.group} className="pt-3">
              <h3 className="px-2 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {t(`contractTemplates.groups.${g.group}`)}
              </h3>
              <ul className="flex flex-col">
                {g.keys.map((key) => {
                  const f = text(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        // Keep the editor's cursor where it is: the chip goes there.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onInsert(key)}
                        aria-label={t('contractTemplates.editor.fields.insert', { name: f.name })}
                        className="group/field flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-primary-soft/60 focus-visible:outline-3 focus-visible:outline-ring/55"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-semibold break-words">{f.name}</span>
                          <span className="text-xs break-words text-muted-foreground">
                            <bdi>{f.otherName}</bdi>
                            {' · '}
                            {f.sample ? <bdi>{f.sample}</bdi> : t('contractTemplates.editor.fields.emptySample')}
                          </span>
                        </span>
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg text-primary group-hover/field:bg-primary group-hover/field:text-primary-foreground">
                          <AddIcon className="size-4" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
      <p className="m-3 flex gap-2.5 rounded-xl border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <OptionalPhraseIcon className="size-4 shrink-0 text-accent-foreground" />
        <span>{t('contractTemplates.editor.fields.optionalHint')}</span>
      </p>
    </section>
  );
}
