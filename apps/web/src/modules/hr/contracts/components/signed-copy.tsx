'use client';

import {
  CONTRACT_SIGNED_COPY_ACCEPT,
  ContractStatus,
  contractYearOf,
  formatContractYear,
  type Contract,
  type ContractSignedCopy,
  type ContractSignedCopyFile,
} from '@school-erp/shared';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { PendingFilesField } from '@/shared/components/form/pending-files-field';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { FileButton } from '@/shared/components/ui/file-button';
import {
  DownloadIcon,
  LockedIcon,
  OpenIcon,
  PdfIcon,
  RemoveIcon,
  SignedCopyIcon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@/shared/components/ui/icons';
import { Skeleton, SkeletonButton, SkeletonText } from '@/shared/components/ui/skeleton';
import { formatDateTime } from '@/shared/lib/format';
import { localName, type Translate } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { handleResponse } from '@/lib/handleResponse';
import { useEmployeeCreateExtras } from '../../employees';
import { GET_EMPLOYEE_CONTRACTS, GET_SIGNED_COPY, REMOVE_SIGNED_COPY_PAGE } from '../apis';
import { ContractsI18n } from '../messages';
import { contractError } from '../lib/contract-text';
import {
  announcePages,
  failedPagesText,
  SIGNED_COPY_MAX_MB,
  SIGNED_COPY_MAX_PAGES,
  signedCopyProblemText,
  uploadSignedPages,
  type UploadPagesResult,
  type UploadProgress,
} from '../lib/signed-copy';

/*
 * A contract's signed copy (owner, 2026-11-24: "I can't upload a photo of the contract so I can see
 * it for each employee"): the Documents column's "Signed copy (n)" / "No signed copy", the viewer
 * with the pages in upload order (images inline and zoomable, a PDF opened in a new tab), Download,
 * Remove with a reason and "Add pages" — and the optional upload on Renew / New contract.
 * Who may: viewing follows `hr.contracts.view`; adding and removing `hr.contracts.manage`, never on
 * one's own contract. View only: the API decides every write.
 */

const FIELD = 'contracts.signedCopy.field';

/** Whether the viewer may add or remove pages of `contract` (the API decides; this hides the buttons). */
export function useCanManageSignedCopy(contract: Pick<Contract, 'ownContract'>): boolean {
  const can = useCan();
  return can('hr.contracts.manage') && !contract.ownContract;
}

/** The Documents column's line: "Signed copy (2)" opening the viewer, or "No signed copy". */
export function SignedCopyLink({ contract, onOpen }: { contract: Contract; onOpen: () => void }) {
  const { t, locale } = useTranslation();
  if (contract.signedCopyPages === 0) {
    return (
      <span data-testid="signed-copy-none" className="text-xs text-muted-foreground">
        {t('contracts.signedCopy.none')}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('contracts.signedCopy.open', { name: localName(contract.employee, locale) })}
      className="tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-xs font-semibold whitespace-nowrap text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
    >
      <SignedCopyIcon className="size-4 shrink-0" />
      <span data-testid="signed-copy-count">{t('contracts.signedCopy.count', { count: contract.signedCopyPages })}</span>
    </button>
  );
}

/** Whether a contract has a signed-copy line at all: a cancelled one never had one to sign, unless pages were added. */
export function hasSignedCopyLine(contract: Pick<Contract, 'status' | 'signedCopyPages'>): boolean {
  return contract.status !== ContractStatus.CANCELLED || contract.signedCopyPages > 0;
}

/**
 * A contract's signed-copy line with its viewer: "Signed copy (2)" opening the pages, or "No signed
 * copy" — the profile tab's Documents column and the Contracts page's rows (owner, 2026-11-25: "I
 * don't have to go to that specific employee page to see"). Nothing for a cancelled contract
 * without pages.
 */
export function SignedCopyEntry({ contract }: { contract: Contract }) {
  const [viewing, setViewing] = useState(false);
  if (!hasSignedCopyLine(contract)) return null;
  return (
    <>
      <SignedCopyLink contract={contract} onOpen={() => setViewing(true)} />
      {contract.signedCopyPages > 0 ? <SignedCopyViewer contract={contract} open={viewing} onOpenChange={setViewing} /> : null}
    </>
  );
}

/** The Documents column's skeleton line ("Signed copy (n)"). */
export function SignedCopyLinkSkeleton() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Skeleton className="size-4 shrink-0 rounded" />
      <SkeletonText className="text-xs" width="w-20" />
    </span>
  );
}

/**
 * The viewer: a dialog (full width on a phone) with the pages in order, each with Download and —
 * for whoever may manage — Remove (a reason is required; the page is kept in the history). "Add
 * pages" uploads more at the end. Reads the pages each time it opens (every page shown is an
 * opening, recorded by the API).
 */
export function SignedCopyViewer({
  contract,
  open,
  onOpenChange,
}: {
  contract: Contract;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The panel mounts with each opening, so it starts empty and reads the pages afresh.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <SignedCopyPanel contract={contract} /> : null}
    </Dialog>
  );
}

function SignedCopyPanel({ contract }: { contract: Contract }) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const manage = useCanManageSignedCopy(contract);
  const canAdd = manage && contract.status !== ContractStatus.CANCELLED;
  const [copy, setCopy] = useState<ContractSignedCopy | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uploading, setUploading] = useState<UploadProgress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ page: ContractSignedCopyFile; index: number } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const seq = useRef(0);
  const name = localName(contract.employee, locale);

  useEffect(() => {
    const mine = ++seq.current;
    void callApi(GET_SIGNED_COPY(contract.id), { showErrorToast: false }).then((res) => {
      if (mine !== seq.current || res.unauthorized) return;
      if (res.success && res.data) setCopy(res.data);
      else setFailed(true);
    });
  }, [contract.id, attempt]);

  function retry() {
    setFailed(false);
    setAttempt((n) => n + 1);
  }

  async function add(files: File[]) {
    const { ok, problem: refused } = checkPicked(files, copy?.files.length ?? 0, t);
    setProblem(refused);
    if (ok.length === 0) return;
    const result = await uploadSignedPages(contract.id, ok, setUploading);
    setUploading(null);
    if (result.unauthorized) return;
    if (result.copy) setCopy(result.copy);
    // The pages that didn't go up stay named under the list until the next try.
    const failed = failedPagesText(result, t);
    if (failed) setProblem(failed);
    await announcePages(result, t);
    router.refresh();
  }

  async function remove(page: ContractSignedCopyFile, reason: string): Promise<boolean> {
    setRemoveError(null);
    const res = await callApi(REMOVE_SIGNED_COPY_PAGE(contract.id, page.id, reason), {
      showErrorToast: false,
      showSuccessToast: true,
      successMessage: t('contracts.signedCopy.removed'),
    });
    if (res.unauthorized) return false;
    if (res.success && res.data) {
      setCopy(res.data);
      router.refresh();
      return true;
    }
    setRemoveError(contractError(res, { t, has, locale }, t('errors.INTERNAL_ERROR')));
    return false;
  }

  const addButton = canAdd ? (
    <FileButton
      accept={CONTRACT_SIGNED_COPY_ACCEPT}
      multiple
      inputLabel={t('contracts.signedCopy.addPages')}
      onFiles={(files) => void add(files)}
      disabled={uploading !== null}
      loading={uploading !== null}
      variant={copy && copy.files.length === 0 ? 'primary' : 'secondary'}
      className="cursor-pointer"
    >
      {uploading ? null : <UploadIcon />}
      {uploadingText(uploading, t) ?? t('contracts.signedCopy.addPages')}
    </FileButton>
  ) : null;

  let body;
  if (failed) {
    body = <ErrorState title={t('contracts.signedCopy.loadFailed')} onRetry={retry} />;
  } else if (!copy) {
    body = <SignedCopyPagesSkeleton />;
  } else if (copy.files.length === 0) {
    body = (
      <EmptyState
        icon={SignedCopyIcon}
        title={t('contracts.signedCopy.emptyTitle')}
        description={canAdd ? t('contracts.signedCopy.emptyBody') : t('contracts.signedCopy.emptyBodyView')}
      />
    );
  } else {
    body = (
      <ol aria-label={t('contracts.signedCopy.listLabel')} data-skeleton-block="signed-copy-pages" className="flex flex-col gap-4">
        {copy.files.map((page, i) => (
          <SignedCopyPage key={page.id} page={page} index={i + 1} canRemove={manage} onRemove={() => setRemoving({ page, index: i + 1 })} />
        ))}
      </ol>
    );
  }

  return (
    <>
      <DialogContent
        size="lg"
        title={t('contracts.signedCopy.title')}
        description={t('contracts.signedCopy.description', { name, year: formatContractYear(contractYearOf(contract.startsOn)) })}
        closeLabel={t('ui.dialog.close')}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1 basis-56">
              {contract.ownContract ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LockedIcon className="size-4 shrink-0" />
                  {t('contracts.signedCopy.ownContract')}
                </span>
              ) : problem ? (
                <span role="alert" className="text-xs font-semibold text-destructive-ink">
                  {problem}
                </span>
              ) : canAdd ? (
                <span className="text-xs text-muted-foreground">{t('contracts.signedCopy.hint', { max: SIGNED_COPY_MAX_MB })}</span>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <DialogClose asChild>
                <Button variant="secondary" className="cursor-pointer">
                  {t('ui.dialog.close')}
                </Button>
              </DialogClose>
              {addButton}
            </span>
          </div>
        }
      >
        <div data-testid="signed-copy-viewer">{body}</div>
      </DialogContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRemoving(null);
            setRemoveError(null);
          }
        }}
        tone="destructive"
        title={t('contracts.signedCopy.removeTitle', { page: removing?.index ?? 1 })}
        description={
          <>
            {t('contracts.signedCopy.removeBody', { name: removing?.page.name ?? '' })}
            {removeError ? (
              <span role="alert" className="mt-3 block rounded-xl bg-destructive-soft px-3.5 py-2.5 font-semibold text-destructive-ink">
                {removeError}
              </span>
            ) : null}
          </>
        }
        confirmLabel={t('contracts.signedCopy.removeConfirm')}
        requireReason
        reasonLabel={t('contracts.signedCopy.removeReasonLabel')}
        reasonPlaceholder={t('contracts.signedCopy.removeReasonPlaceholder')}
        onConfirm={(reason) => (removing ? remove(removing.page, reason ?? '') : false)}
      />
    </>
  );
}

/** One page: its number and name, who uploaded it, Download / Remove, and the page itself. */
function SignedCopyPage({
  page,
  index,
  canRemove,
  onRemove,
}: {
  page: ContractSignedCopyFile;
  /** Its place among the pages shown (removed ones leave no gap). */
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { t, locale } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  const isPdf = page.mimeType === 'application/pdf';
  const when = formatDateTime(page.uploadedAt, locale);
  return (
    <li data-testid="signed-copy-page" className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="text-sm font-bold">{t('contracts.signedCopy.page', { page: index })}</span>
          <span className="truncate text-xs text-muted-foreground">
            {/* Each part isolated: a Latin file or person name beside an Arabic date keeps its order. */}
            <bdi>{page.name}</bdi>
            {' · '}
            {page.uploadedBy ? (
              <>
                <bdi>{page.uploadedBy.name}</bdi>
                {' · '}
                <bdi>{when}</bdi>
              </>
            ) : (
              t('contracts.signedCopy.uploadedOn', { date: when })
            )}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {isPdf ? null : (
            <Button size="sm" variant="ghost" className="cursor-pointer" aria-pressed={zoomed} onClick={() => setZoomed((z) => !z)}>
              {zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}
              {zoomed ? t('contracts.signedCopy.zoomOut') : t('contracts.signedCopy.zoomIn')}
            </Button>
          )}
          <Button asChild size="sm" variant="secondary" className="cursor-pointer">
            <a href={page.url} download={page.name}>
              <DownloadIcon />
              {t('contracts.signedCopy.download')}
            </a>
          </Button>
          {canRemove ? (
            <Button size="sm" variant="ghost" className="cursor-pointer text-destructive-ink" onClick={onRemove}>
              <RemoveIcon />
              {t('contracts.signedCopy.remove')}
            </Button>
          ) : null}
        </span>
      </div>
      {isPdf ? (
        // A PDF opens in the browser's own viewer, in a new tab (files are served sandboxed, so an
        // embedded frame can't show it).
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer"
          className="flex cursor-pointer items-center gap-3 rounded-xl bg-muted px-4 py-5 text-sm font-semibold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
        >
          <PdfIcon className="size-8 shrink-0" />
          <span className="flex-1">{t('contracts.signedCopy.openPdf')}</span>
          <OpenIcon className="size-5 shrink-0" />
        </a>
      ) : (
        // Zoomed: twice the width, scrolled inside its own frame (pinch-zoom works on a phone too).
        <div className={cn('overflow-auto rounded-xl bg-muted', zoomed ? 'max-h-[70dvh]' : null)}>
          <Image
            src={page.url}
            alt={t('contracts.signedCopy.page', { page: index })}
            width={1200}
            height={1600}
            unoptimized
            onClick={() => setZoomed((z) => !z)}
            className={cn('mx-auto h-auto', zoomed ? 'w-[200%] max-w-none cursor-zoom-out' : 'w-full max-w-full cursor-zoom-in')}
          />
        </div>
      )}
    </li>
  );
}

/** The viewer while its pages load: two page frames of the same shape. */
export function SignedCopyPagesSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" data-skeleton-block="signed-copy-pages" className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        {t('contracts.signedCopy.loading')}
      </span>
      {[1, 2].map((n) => (
        <div key={n} aria-hidden="true" className="flex flex-col gap-3 rounded-2xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
              <SkeletonText className="text-sm font-bold" width="w-16" />
              <SkeletonText className="text-xs" width="w-44" />
            </span>
            <span className="flex items-center gap-1.5">
              <SkeletonButton size="sm">
                <ZoomInIcon />
                {t('contracts.signedCopy.zoomIn')}
              </SkeletonButton>
              <SkeletonButton size="sm">
                <DownloadIcon />
                {t('contracts.signedCopy.download')}
              </SkeletonButton>
            </span>
          </div>
          <Skeleton className="aspect-[3/4] w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/**
 * The optional signed copy of a contract about to be made (Renew, New contract): files picked now,
 * uploaded once the contract exists (`uploadPickedPages`).
 */
export function SignedCopyField({
  files,
  onChange,
  disabled,
  hint,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** Replaces the usual hint (Add employee says whose stage it needs). */
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <PendingFilesField
      label={t(`${FIELD}.label`)}
      hint={hint ?? t(`${FIELD}.hint`, { max: SIGNED_COPY_MAX_MB })}
      chooseLabel={t(`${FIELD}.choose`)}
      removeLabel={(name) => t(`${FIELD}.removeFile`, { name })}
      accept={CONTRACT_SIGNED_COPY_ACCEPT}
      files={files}
      onChange={onChange}
      check={(file) => signedCopyProblemText(file, t, FIELD)}
      maxFiles={SIGNED_COPY_MAX_PAGES}
      tooManyText={t('errors.SIGNED_COPY_PAGE_LIMIT', { max: SIGNED_COPY_MAX_PAGES })}
      disabled={disabled}
    />
  );
}

/**
 * After the contract is made: uploads the picked pages to it and says how it went (a toast per
 * outcome, the pages that didn't go up named); the contract stands either way.
 */
export async function uploadPickedPages(contractId: string, files: readonly File[], t: Translate): Promise<UploadPagesResult | null> {
  if (files.length === 0) return null;
  const result = await uploadSignedPages(contractId, files);
  if (!result.unauthorized) await announcePages(result, t);
  return result;
}

/**
 * "Add employee" → the optional signed contract (owner, 2026-11-24), placed in the employee form's
 * contract section by the route (`EmployeeForm`'s `contractExtra`): pages picked now, attached to
 * the new employee's first contract once they are saved, through the form's after-create hook
 * (`useEmployeeCreateExtras`). Only for whoever may manage contracts. Whether their scope covers the
 * chosen stage is the API's to say: when it doesn't, the employee is saved and the screen says why
 * the contract wasn't attached.
 */
export function NewEmployeeSignedContract() {
  const { locale } = useTranslation();
  return (
    <ContractsI18n locale={locale}>
      <NewEmployeeSignedContractField />
    </ContractsI18n>
  );
}

function NewEmployeeSignedContractField() {
  const { t } = useTranslation();
  const can = useCan();
  const { disabled, setAfterCreate } = useEmployeeCreateExtras();
  const [files, setFiles] = useState<File[]>([]);
  const manage = can('hr.contracts.manage');

  useEffect(() => {
    if (!manage || files.length === 0) {
      setAfterCreate(null);
      return;
    }
    setAfterCreate(async (employeeId) => {
      const first = await callApi(GET_EMPLOYEE_CONTRACTS(employeeId, { page: 1, limit: 1 }), { showErrorToast: false });
      const contractId = first.success ? first.data?.[0]?.id : undefined;
      if (first.unauthorized) return true;
      if (!contractId) {
        await handleResponse({ response: { success: false, status: 0, message: t('contracts.signedCopy.newEmployee.failed') }, showErrorToast: true });
        return false;
      }
      const result = await uploadSignedPages(contractId, files);
      if (result.unauthorized) return true;
      // Their access doesn't cover the chosen stage: say so plainly rather than "upload failed".
      const failedStatus = result.lastFailed && 'status' in result.lastFailed ? result.lastFailed.status : null;
      const notCovered = result.added === 0 && (failedStatus === 404 || failedStatus === 403);
      if (notCovered) {
        await handleResponse({ response: { success: false, status: 403, message: t('contracts.signedCopy.newEmployee.notCovered') }, showErrorToast: true });
        return false;
      }
      await announcePages(result, t);
      return result.failedNames.length === 0;
    });
    return () => setAfterCreate(null);
  }, [manage, files, setAfterCreate, t]);

  if (!manage) return null;
  return (
    <SignedCopyField
      files={files}
      onChange={setFiles}
      disabled={disabled}
      hint={t('contracts.signedCopy.newEmployee.hint', { max: SIGNED_COPY_MAX_MB })}
    />
  );
}

/** Picked files that can be pages: the right type and size, and room left (30 pages). */
function checkPicked(files: readonly File[], already: number, t: Translate): { ok: File[]; problem: string | null } {
  const valid = files.filter((f) => signedCopyProblemText(f, t, FIELD) === null);
  const wrong = files.map((f) => signedCopyProblemText(f, t, FIELD)).find((why) => why !== null) ?? null;
  const room = Math.max(0, SIGNED_COPY_MAX_PAGES - already);
  if (valid.length > room) {
    return { ok: valid.slice(0, room), problem: t('errors.SIGNED_COPY_PAGE_LIMIT', { max: SIGNED_COPY_MAX_PAGES }) };
  }
  return { ok: valid, problem: wrong };
}

/** "Uploading page 2 of 5…", or "Too many uploads at once: page 2 of 5 goes up in 40 s…". */
function uploadingText(progress: UploadProgress | null, t: Translate): string | null {
  if (!progress) return null;
  if (progress.waitSeconds) return t('contracts.signedCopy.waiting', { done: progress.done, total: progress.total, seconds: progress.waitSeconds });
  return t('contracts.signedCopy.uploading', { done: progress.done, total: progress.total });
}
