'use client';

import { useId, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { FileButton } from '@/shared/components/ui/file-button';
import { RemoveIcon, UploadIcon } from '@/shared/components/ui/icons';

/**
 * Files chosen now and uploaded once the record they belong to is saved (a new employee's signed
 * contract, a renewal's signed copy) — like the photo field on "Add employee". Several may be picked
 * (a phone photo is one page each); they keep the order picked. `check` refuses a file before it is
 * listed (its translated reason shows under the field); the server checks again.
 */
export function PendingFilesField({
  label,
  hint,
  chooseLabel,
  removeLabel,
  accept,
  files,
  onChange,
  check,
  maxFiles,
  tooManyText,
  disabled = false,
}: {
  label: string;
  hint: string;
  chooseLabel: string;
  /** The remove button's name for one file ("Remove IMG_2041.jpg"). */
  removeLabel: (name: string) => string;
  accept: string;
  files: File[];
  onChange: (files: File[]) => void;
  /** Why a file can't be added (translated), or null. */
  check: (file: File) => string | null;
  /** At most this many files; picking more keeps the first ones and shows `tooManyText`. */
  maxFiles?: number;
  tooManyText?: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const [problem, setProblem] = useState<string | null>(null);

  function add(picked: File[]) {
    let refused = picked.map(check).find((why) => why !== null) ?? null;
    let ok = picked.filter((file) => check(file) === null);
    const room = maxFiles === undefined ? ok.length : Math.max(0, maxFiles - files.length);
    if (ok.length > room) {
      ok = ok.slice(0, room);
      refused = tooManyText ?? refused;
    }
    setProblem(refused);
    if (ok.length > 0) onChange([...files, ...ok]);
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2 sm:col-span-2">
      <span id={labelId} className="text-sm font-semibold">
        {label}
      </span>
      {files.length > 0 ? (
        <ol className="flex flex-col gap-1.5" data-testid="pending-files">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted px-3 py-1.5">
              <span dir="ltr" className="tabular shrink-0 text-xs text-muted-foreground">
                {i + 1}
              </span>
              <bdi className="min-w-0 flex-1 truncate text-sm font-semibold">{file.name}</bdi>
              <Button
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer"
                aria-label={removeLabel(file.name)}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <RemoveIcon />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      <FileButton
        accept={accept}
        multiple
        inputLabel={label}
        onFiles={add}
        disabled={disabled}
        variant="secondary"
        className="cursor-pointer justify-start self-start border-dashed"
      >
        <UploadIcon />
        {chooseLabel}
      </FileButton>
      {problem ? (
        <p role="alert" className="text-xs font-semibold text-destructive-ink">
          {problem}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
