'use client';

import type { PenaltyGroup, Violation } from '@school-erp/shared';
import { useState } from 'react';
import { callApi } from '@/lib/callApi';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { AddIcon, ChevronDownIcon, EditIcon, RestoreIcon, RetireIcon } from '@/shared/components/ui/icons';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount, formatDays } from '@/shared/lib/format';
import { localName, otherName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  CREATE_PENALTY_GROUP,
  CREATE_VIOLATION,
  GET_PENALTY_GROUPS,
  UPDATE_PENALTY_GROUP,
  UPDATE_VIOLATION,
} from '../apis';
import { useResource } from '../hooks/use-resource';
import { toLevelInputs, type NamesFormValues, type ViolationFormValues } from '../schemas';
import { NamesDialog } from './names-dialog';
import { SectionPanel } from './section-panel';
import { ViolationDialog } from './violation-dialog';

type GroupDialog = { mode: 'new' } | { mode: 'rename'; group: PenaltyGroup };
type ViolationEdit = { groupId: string; violation: Violation | null };

/**
 * The penalty catalogue (§4, §7): groups → violations → levels. Groups and violations are retired
 * and restored, never deleted. Edits change pending penalties and new ones, never approved ones.
 */
export function CatalogueSection() {
  const { t, locale } = useTranslation();
  const catalogue = useResource('catalogue', () => GET_PENALTY_GROUPS());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [groupDialog, setGroupDialog] = useState<GroupDialog | null>(null);
  const [editing, setEditing] = useState<ViolationEdit | null>(null);
  const [retiring, setRetiring] = useState<PenaltyGroup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = catalogue.data ? [...catalogue.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined;
  // The first group starts open so the screen shows what a catalogue looks like.
  const firstId = groups?.[0]?.id;
  const isOpen = (id: string) => open.has(id) !== (id === firstId);

  function toggleOpen(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function mergeGroup(updated: PenaltyGroup) {
    catalogue.setData((all) =>
      all.map((g) => (g.id === updated.id ? { ...g, ...updated, violations: updated.violations ?? g.violations } : g)),
    );
  }

  function putViolation(groupId: string, violation: Violation) {
    catalogue.setData((all) =>
      all.map((g) => {
        if (g.id !== groupId) return g;
        const exists = g.violations.some((v) => v.id === violation.id);
        return {
          ...g,
          violations: exists ? g.violations.map((v) => (v.id === violation.id ? violation : v)) : [...g.violations, violation],
        };
      }),
    );
  }

  async function saveGroup(values: NamesFormValues): Promise<boolean> {
    if (!groupDialog) return false;
    if (groupDialog.mode === 'new') {
      const nextOrder = (groups ?? []).reduce((max, g) => Math.max(max, g.sortOrder), 0) + 1;
      const res = await callApi(CREATE_PENALTY_GROUP({ ...values, sortOrder: nextOrder }));
      if (res.success && res.data) {
        const created = { ...res.data, violations: res.data.violations ?? [] };
        catalogue.setData((all) => [...all, created]);
        return true;
      }
      return false;
    }
    const res = await callApi(UPDATE_PENALTY_GROUP(groupDialog.group.id, values));
    if (res.success && res.data) mergeGroup(res.data);
    return Boolean(res.success);
  }

  async function setGroupActive(group: PenaltyGroup, isActive: boolean): Promise<boolean> {
    setBusyId(group.id);
    try {
      const res = await callApi(UPDATE_PENALTY_GROUP(group.id, { isActive }));
      if (res.success && res.data) mergeGroup(res.data);
      return Boolean(res.success);
    } finally {
      setBusyId(null);
    }
  }

  async function setViolationActive(groupId: string, violation: Violation, isActive: boolean) {
    if (busyId) return;
    setBusyId(violation.id);
    try {
      const res = await callApi(UPDATE_VIOLATION(violation.id, { isActive }));
      if (res.success && res.data) putViolation(groupId, res.data);
    } finally {
      setBusyId(null);
    }
  }

  async function saveViolation(values: ViolationFormValues): Promise<boolean> {
    if (!editing) return false;
    const body = {
      nameEn: values.nameEn,
      nameAr: values.nameAr,
      note: values.note.trim() || null,
      levels: toLevelInputs(values.levels),
    };
    const res = editing.violation
      ? await callApi(UPDATE_VIOLATION(editing.violation.id, body))
      : await callApi(CREATE_VIOLATION(editing.groupId, body));
    if (res.success && res.data) putViolation(editing.groupId, res.data);
    return Boolean(res.success);
  }

  const addGroup = (
    <Button variant="primary" disabled={!groups} onClick={() => setGroupDialog({ mode: 'new' })}>
      <AddIcon />
      {t('settings.catalogue.addGroup')}
    </Button>
  );

  let body;
  if (catalogue.error) body = <ErrorState onRetry={catalogue.retry} retrying={catalogue.retrying} />;
  else if (!groups) body = <CatalogueSkeleton />;
  else if (groups.length === 0)
    body = <EmptyState title={t('settings.catalogue.emptyTitle')} description={t('settings.catalogue.emptyBody')} action={addGroup} />;
  else
    body = (
      <ul className="flex flex-col gap-3">
        {groups.map((group) => {
          const expanded = isOpen(group.id);
          const name = localName(group, locale);
          const panelId = `group-${group.id}`;
          return (
            <li key={group.id} className="overflow-hidden rounded-2xl border border-border">
              <div className={cn('flex flex-wrap items-center gap-3 p-3 sm:p-4', expanded && 'border-b border-border bg-muted')}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggleOpen(group.id)}
                  className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3 rounded-lg text-start"
                >
                  <ChevronDownIcon className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-150', !expanded && '-rotate-90 rtl:rotate-90')} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-display font-extrabold break-words">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('settings.catalogue.violationCount', { count: formatCount(group.violations.length) })}
                    </span>
                  </span>
                </button>
                {group.isActive ? null : <StatusPill tone="neutral">{t('settings.catalogue.retired')}</StatusPill>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('settings.catalogue.renameGroup', { name })}
                    onClick={() => setGroupDialog({ mode: 'rename', group })}
                  >
                    <EditIcon />
                    {t('settings.lists.rename')}
                  </Button>
                  {group.isActive ? (
                    <Button size="sm" variant="ghost" aria-label={t('settings.catalogue.retireGroup', { name })} onClick={() => setRetiring(group)}>
                      <RetireIcon />
                      {t('settings.catalogue.retire')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === group.id}
                      aria-label={t('settings.catalogue.restoreGroup', { name })}
                      onClick={() => void setGroupActive(group, true)}
                    >
                      {busyId === group.id ? null : <RestoreIcon />}
                      {t('settings.catalogue.restore')}
                    </Button>
                  )}
                </div>
              </div>
              {expanded ? (
                <div id={panelId} className="flex flex-col gap-3 p-3 sm:p-4">
                  {group.isActive ? null : <p className="text-sm text-muted-foreground">{t('settings.catalogue.groupRetiredNote')}</p>}
                  {group.violations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('settings.catalogue.noViolations')}</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {group.violations.map((violation) => (
                        <ViolationRow
                          key={violation.id}
                          violation={violation}
                          groupActive={group.isActive}
                          busy={busyId === violation.id}
                          locked={busyId !== null && busyId !== violation.id}
                          onEdit={() => setEditing({ groupId: group.id, violation })}
                          onToggle={() => void setViolationActive(group.id, violation, !violation.isActive)}
                        />
                      ))}
                    </ul>
                  )}
                  {group.isActive ? (
                    <div>
                      <Button size="sm" variant="soft" onClick={() => setEditing({ groupId: group.id, violation: null })}>
                        <AddIcon />
                        {t('settings.catalogue.addViolation')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

  return (
    <SectionPanel title={t('settings.sections.catalogue.title')} description={t('settings.sections.catalogue.description')} actions={addGroup}>
      {body}
      {groupDialog ? (
        <NamesDialog
          key={groupDialog.mode === 'new' ? 'new' : groupDialog.group.id}
          open
          onOpenChange={(o) => !o && setGroupDialog(null)}
          title={
            groupDialog.mode === 'new'
              ? t('settings.catalogue.addGroup')
              : t('settings.catalogue.renameGroup', { name: localName(groupDialog.group, locale) })
          }
          max="group"
          initial={groupDialog.mode === 'new' ? undefined : { nameEn: groupDialog.group.nameEn, nameAr: groupDialog.group.nameAr }}
          placeholders={{ en: t('settings.catalogue.groupPlaceholderEn'), ar: t('settings.catalogue.groupPlaceholderAr') }}
          submitLabel={groupDialog.mode === 'new' ? t('common.actions.create') : t('common.actions.save')}
          onSubmit={saveGroup}
        />
      ) : null}
      {editing ? (
        <ViolationDialog
          key={editing.violation?.id ?? `new-${editing.groupId}`}
          violation={editing.violation}
          // A short title (a long violation name wrapped to three lines on a phone); the name
          // follows underneath, clamped to two lines.
          title={editing.violation ? t('settings.catalogue.editViolationTitle') : t('settings.catalogue.addViolation')}
          description={
            editing.violation ? (
              <span className="line-clamp-2 break-words">{localName(editing.violation, locale)}</span>
            ) : undefined
          }
          onClose={() => setEditing(null)}
          onSubmit={saveViolation}
        />
      ) : null}
      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(o) => !o && setRetiring(null)}
        title={t('settings.catalogue.retireGroupTitle', { name: retiring ? localName(retiring, locale) : '' })}
        description={t('settings.catalogue.retireGroupBody')}
        confirmLabel={t('settings.catalogue.retire')}
        tone="destructive"
        onConfirm={async () => (retiring ? setGroupActive(retiring, false) : true)}
      />
    </SectionPanel>
  );
}

function ViolationRow({
  violation,
  groupActive,
  busy,
  locked,
  onEdit,
  onToggle,
}: {
  violation: Violation;
  groupActive: boolean;
  busy: boolean;
  locked: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { t, locale } = useTranslation();
  const name = localName(violation, locale);
  const levels = [...violation.levels].sort((a, b) => a.level - b.level);
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold break-words">{name}</span>
          {violation.isActive ? null : <StatusPill tone="neutral">{t('settings.catalogue.retired')}</StatusPill>}
        </div>
        <BidiText className="text-xs break-words text-muted-foreground">{otherName(violation, locale)}</BidiText>
        <ol className="flex flex-wrap gap-1.5" aria-label={t('settings.catalogue.levels')}>
          {levels.map((l) => (
            <li key={l.level} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
              {l.days != null
                ? t('settings.catalogue.levelWithDays', {
                    level: l.level,
                    action: t(`common.enums.penaltyAction.${l.action}`),
                    days: formatDays(l.days),
                  })
                : t('settings.catalogue.levelPlain', { level: l.level, action: t(`common.enums.penaltyAction.${l.action}`) })}
            </li>
          ))}
        </ol>
        {violation.note ? (
          <p className="text-xs break-words text-muted-foreground">
            <BidiText>{violation.note}</BidiText>
          </p>
        ) : null}
      </div>
      {groupActive ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="ghost" aria-label={t('settings.catalogue.editViolation', { name })} onClick={onEdit}>
            <EditIcon />
            {t('common.actions.edit')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={locked}
            aria-label={t(violation.isActive ? 'settings.catalogue.retireViolation' : 'settings.catalogue.restoreViolation', { name })}
            onClick={onToggle}
          >
            {busy ? null : violation.isActive ? <RetireIcon /> : <RestoreIcon />}
            {violation.isActive ? t('settings.catalogue.retire') : t('settings.catalogue.restore')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function CatalogueSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border p-4">
          <Skeleton className="size-5 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
