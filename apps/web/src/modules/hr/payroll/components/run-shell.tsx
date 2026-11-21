'use client';

import { PayrollFlag, PayrollStatus, PenaltyStatus, type PayrollRun } from '@school-erp/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { Can, useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { PageHeader } from '@/shared/components/layout/page-header';
import { activeRecordTab, RecordTabs, type RecordTab } from '@/shared/components/layout/record-tabs';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import {
  ApproveIcon,
  BlockedIcon,
  CloseIcon,
  ExportIcon,
  PendingIcon,
  RecalculateIcon,
  RestoreIcon,
} from '@/shared/components/ui/icons';
import { useNewestServerState } from '@/shared/hooks/use-newest-server-state';
import { apiErrorText } from '@/shared/lib/api-error';
import { saveDownloadedFile } from '@/shared/lib/download';
import { formatCount, formatDate, formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { APPROVE_PAYROLL_RUN, GET_BANK_SHEET, RECALCULATE_PAYROLL_RUN } from '../apis';
import { RunStatusPill } from './payroll-bits';

/**
 * The run page's sections: each a route under `/payroll/[id]` (`''` = the employees and their
 * lines), inside the `(run)` route group whose layout draws the header, the notices and these tabs
 * once — so switching tabs renders only the tab and never fetches the run again.
 */
export const RUN_TABS = [
  { key: 'lines', labelKey: 'payroll.tabs.employees', segment: '' },
  // Who did what on the run (audit log); only for people who may read the log.
  { key: 'history', labelKey: 'payroll.tabs.history', segment: 'history', permission: 'core.audit.view' },
] as const;

export interface RunState {
  /** The whole run (every line), newest version: the layout's read or a write's answer. */
  run: PayrollRun;
  /** The server stamp of the last write applied here (0: none yet) — a tab's older read refetches. */
  lastWrite: number;
  /** A write's answer (the whole run, stamped `asOf`): an older one never replaces a newer one. */
  applyRun: (next: PayrollRun, asOf: number) => void;
  /** Recalculate / Approve is in flight: the lines' search and filters wait. */
  mutating: boolean;
  /** Runs `work` now, or once the write in flight answers (a debounced search: never mid-write). */
  whenIdle: (work: () => void) => void;
  recalculating: boolean;
  recalculate: () => Promise<void>;
}

const RunContext = createContext<RunState | null>(null);

/** The run the layout loaded and its writes, for a tab (lines, adjustments) — no second fetch. */
export function useRunState(): RunState {
  const state = useContext(RunContext);
  if (!state) throw new Error('useRunState must be used inside RunShell');
  return state;
}

/** The section tabs under the header (also drawn by the route skeletons). */
export function RunTabs({ runHref }: { runHref: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const tabs: RecordTab[] = RUN_TABS.filter((tab) => !('permission' in tab) || can(tab.permission)).map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    segment: tab.segment,
  }));
  const active = activeRecordTab(usePathname() ?? '', runHref, tabs);
  return <RecordTabs label={t('payroll.tabs.label')} recordHref={runHref} tabs={tabs} active={active} />;
}

export interface RunShellProps {
  /** `/ar/payroll`. */
  basePath: string;
  /** `/ar/penalties` — the pending-penalties notice links to this month's pending ones. */
  penaltiesHref: string;
  /** The whole run (unfiltered). */
  run: PayrollRun;
  /** The server's clock before `run` was read (`loadRun`): a newer mutation result wins over it. */
  asOf: number;
  children: ReactNode;
}

/**
 * One month's run, around its tabs: status, Recalculate / Export bank sheet / Approve, the notices
 * (returned by Accounting, pending penalties, rules changed, approve refused) and the tab bar. The
 * run layout renders it once, so it stays mounted while the tabs change. Approve is never blocked
 * by client logic: the server decides (409 `PENDING_PENALTIES`).
 */
export function RunShell({ basePath, penaltiesHref, run: serverRun, asOf: serverAsOf, children }: RunShellProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const [, startNavigation] = useTransition();

  // Server data, replaced by each write's answer. A render read before the latest write (a refresh
  // still in flight when it answered) never replaces it: the page re-reads instead, so the run
  // can't fall back to Draft after Approve.
  const { value: run, apply, staleCount } = useNewestServerState(serverRun, serverAsOf);
  useEffect(() => {
    if (staleCount > 0) startNavigation(() => router.refresh());
  }, [staleCount, router]);

  const [lastWrite, setLastWrite] = useState(0);
  const applyRun = useCallback(
    (next: PayrollRun, asOf: number) => {
      apply(next, asOf);
      setLastWrite((prev) => Math.max(prev, asOf));
    },
    [apply],
  );

  const [recalculating, setRecalculating] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const afterWrite = useRef<(() => void)[]>([]);
  const whenIdle = useCallback((work: () => void) => {
    if (busyRef.current) afterWrite.current.push(work);
    else work();
  }, []);

  /** Runs one run write at a time; what waited for it (`whenIdle`) runs once it answers. */
  const mutate = useCallback(async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setMutating(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setMutating(false);
      const waiting = afterWrite.current.splice(0);
      for (const waited of waiting) waited();
    }
  }, []);

  const recalculate = useCallback(
    () =>
      mutate(async () => {
        setRecalculating(true);
        try {
          const res = await callApi(RECALCULATE_PAYROLL_RUN(run.id), {
            showSuccessToast: true,
            successMessage: t('payroll.actions.recalculated'),
          });
          if (res.unauthorized) return;
          if (res.success && res.data) applyRun(res.data, res.asOf);
          else if (res.success === false && res.status === 409) startNavigation(() => router.refresh());
        } finally {
          setRecalculating(false);
        }
      }),
    [mutate, run.id, t, applyRun, router],
  );

  function approve() {
    return mutate(async () => {
      setApproveError(null);
      // The server's message is shown on the page (e.g. 409 PENDING_PENALTIES), not as a toast.
      const res = await callApi(APPROVE_PAYROLL_RUN(run.id), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('payroll.actions.approved'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) applyRun(res.data, res.asOf);
      else if (res.success === false) setApproveError(apiErrorText(res, { t, has }));
    });
  }

  async function exportBankSheet() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await callApi(GET_BANK_SHEET(run.id));
      if (res.success && res.data) saveDownloadedFile(res.data);
    } finally {
      setExporting(false);
    }
  }

  const draft = run.status === PayrollStatus.DRAFT;
  const monthLabel = formatMonth(run.month, locale);
  // The live count comes from the server; the lines' flags only reflect the last calculation
  // (how many lines still carry the flag is counted by the API over every line, not this page).
  const staleFlags = run.pendingPenaltyLines > 0;
  // `recounted`: a backdated penalty moved approved ones of this month up a level since the last
  // calculation (§4, owner 2026-11-20) — the same "penalties changed" notice, its own sentence.
  const pendingNotice = !draft || approveError
    ? null
    : run.pendingPenalties > 0
      ? 'pending'
      : staleFlags
        ? 'stale'
        : run.penaltiesRecounted
          ? 'recounted'
          : null;
  const pendingTitleId = useId();
  // HR rules (lateness, payroll) changed after the last calculation (dry run 2026-11-18). Not shown
  // beside the "stale" / "recounted" notice, which already offers Recalculate.
  const rulesNotice =
    draft && !approveError && run.rulesChanged && pendingNotice !== 'stale' && pendingNotice !== 'recounted';
  const rulesTitleId = useId();
  const returnedTitleId = useId();

  const state = useMemo<RunState>(
    () => ({ run, lastWrite, applyRun, mutating, whenIdle, recalculating, recalculate }),
    [run, lastWrite, applyRun, mutating, whenIdle, recalculating, recalculate],
  );

  return (
    <RunContext.Provider value={state}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('payroll.runTitle', { month: monthLabel })}
          status={<RunStatusPill status={run.status} transferred={run.transferredAt !== null} />}
          description={
            draft
              ? t('payroll.runDescription')
              : t('payroll.runDescriptionApproved', {
                  date: run.approvedAt ? formatDate(run.approvedAt.slice(0, 10), locale) : '',
                })
          }
          breadcrumbs={[{ label: t('payroll.title'), href: basePath }, { label: monthLabel }]}
          breadcrumbsLabel={t('ui.shell.breadcrumbs')}
          actions={
            <>
              {draft ? (
                <Can permission="hr.payroll.recalculate">
                  <Button className="cursor-pointer" loading={recalculating} onClick={() => void recalculate()}>
                    {recalculating ? null : <RecalculateIcon />}
                    {t('payroll.actions.recalculate')}
                  </Button>
                </Can>
              ) : null}
              <Can permission="hr.payroll.export_bank_sheet">
                <Button
                  className={draft ? 'cursor-not-allowed' : 'cursor-pointer'}
                  disabled={draft}
                  title={draft ? t('payroll.actions.bankSheetAfterApproval') : undefined}
                  loading={exporting}
                  onClick={() => void exportBankSheet()}
                >
                  {exporting ? null : <ExportIcon />}
                  {t('payroll.actions.exportBankSheet')}
                </Button>
              </Can>
              {draft ? (
                <Can permission="hr.payroll.approve">
                  <Button variant="primary" className="cursor-pointer" onClick={() => setApproveOpen(true)}>
                    <ApproveIcon />
                    {t('payroll.actions.approve')}
                  </Button>
                </Can>
              ) : null}
            </>
          }
        />

        {draft && run.returned ? (
          // Accounting sent the approved month back (§10): why, until it is approved again.
          <div
            role="note"
            aria-labelledby={returnedTitleId}
            data-testid="returned-notice"
            className="bg-warning-soft text-warning-ink flex items-start gap-3 rounded-2xl px-4 py-3.5"
          >
            <RestoreIcon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p id={returnedTitleId} className="font-bold">
                {t('payroll.returned.title', { date: formatDate(run.returned.at.slice(0, 10), locale) })}
              </p>
              {/* The reason is what Accounting typed: isolated in its own direction (like adjustment
                  reasons), and never followed by a sentence's period of ours. */}
              <p className="text-sm break-words" data-testid="returned-reason">
                {t('payroll.returned.reasonLabel')} <BidiText>{run.returned.reason}</BidiText>
              </p>
              <p className="text-sm">{t('payroll.returned.fix')}</p>
            </div>
          </div>
        ) : null}

        {pendingNotice === 'pending' ? (
          // Told before Approve is pressed; the button still sends (the server decides, 409).
          <div
            role="note"
            aria-labelledby={pendingTitleId}
            className="bg-warning-soft text-warning-ink flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5"
          >
            <PendingIcon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
              <p id={pendingTitleId} className="font-bold">
                {t('payroll.approve.pendingTitle')}
              </p>
              <p className="text-sm">{t('payroll.approve.pendingBody', { count: formatCount(run.pendingPenalties) })}</p>
            </div>
            <Button asChild size="sm" variant="secondary" className="cursor-pointer">
              <Link href={`${penaltiesHref}?${new URLSearchParams({ month: run.month, status: PenaltyStatus.PENDING }).toString()}`}>
                {t('payroll.approve.pendingLink')}
              </Link>
            </Button>
          </div>
        ) : null}

        {pendingNotice === 'stale' || pendingNotice === 'recounted' ? (
          // No penalty is pending any more, but the lines were calculated while some were — or a
          // backdated approval moved approved ones up a level since.
          <div
            role="note"
            aria-labelledby={pendingTitleId}
            data-testid={pendingNotice === 'recounted' ? 'penalties-recounted-notice' : undefined}
            className="bg-info-soft text-info-ink flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5"
          >
            <RecalculateIcon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
              <p id={pendingTitleId} className="font-bold">
                {t('payroll.approve.staleTitle')}
              </p>
              <p className="text-sm">
                {t(pendingNotice === 'recounted' ? 'payroll.approve.recountedBody' : 'payroll.approve.staleBody')}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              loading={recalculating}
              onClick={() => void recalculate()}
            >
              {t('payroll.approve.staleAction')}
            </Button>
          </div>
        ) : null}

        {rulesNotice ? (
          <div
            role="note"
            aria-labelledby={rulesTitleId}
            data-testid="rules-changed-notice"
            className="bg-info-soft text-info-ink flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5"
          >
            <RecalculateIcon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
              <p id={rulesTitleId} className="font-bold">
                {t('payroll.rulesChanged.title')}
              </p>
              <p className="text-sm">{t('payroll.rulesChanged.body')}</p>
            </div>
            <Can permission="hr.payroll.recalculate">
              <Button
                size="sm"
                variant="secondary"
                className="cursor-pointer"
                loading={recalculating}
                onClick={() => void recalculate()}
              >
                {t('payroll.approve.staleAction')}
              </Button>
            </Can>
          </div>
        ) : null}

        {approveError && draft ? (
          <div
            role="alert"
            className="bg-destructive-soft text-destructive-ink flex items-start gap-3 rounded-2xl px-4 py-3.5"
          >
            <BlockedIcon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-bold">{t('payroll.approve.failed')}</p>
              <p className="text-sm">{approveError}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label={t('ui.dialog.close')}
              onClick={() => setApproveError(null)}
            >
              <CloseIcon />
            </Button>
          </div>
        ) : null}

        <RunTabs runHref={`${basePath}/${run.id}`} />

        {children}

        <ConfirmDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          title={t('payroll.approve.title', { month: monthLabel })}
          description={t('payroll.approve.body')}
          confirmLabel={t('payroll.approve.confirm')}
          onConfirm={approve}
        />
      </div>
    </RunContext.Provider>
  );
}
