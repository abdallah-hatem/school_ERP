'use client';

import Image from 'next/image';
import { useState } from 'react';
import { SilhouetteIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';

/** Avatar sizes: `sm` in table rows, `md` in headers, `lg` on cards, `xl` in the photo picker. */
const SIZES = {
  sm: { box: 'size-9 rounded-xl', icon: 'size-6', px: 36 },
  md: { box: 'size-12 rounded-2xl', icon: 'size-8', px: 48 },
  lg: { box: 'size-16 rounded-[1.25rem]', icon: 'size-11', px: 64 },
  xl: { box: 'size-24 rounded-3xl', icon: 'size-16', px: 96 },
} as const;
export type EmployeeAvatarSize = keyof typeof SIZES;

export interface EmployeeAvatarProps {
  /** The employee's photo (`/files/employee-photos/…`, signed-in only); null → the silhouette. */
  photoUrl?: string | null;
  size?: EmployeeAvatarSize;
  /** Greyed out (an inactive employee's card). */
  muted?: boolean;
  className?: string;
}

/**
 * An employee's avatar: their photo, square-cropped (`object-cover`), or a neutral person
 * silhouette when there is none or it fails to load — never initials (owner, 2026-11-18).
 * Decorative: the name next to it is what screen readers read.
 */
export function EmployeeAvatar({ photoUrl, size = 'sm', muted = false, className }: EmployeeAvatarProps) {
  const s = SIZES[size];
  // A photo that can't be loaded (deleted, signed out) falls back to the silhouette.
  const [failed, setFailed] = useState<string | null>(null);
  const photo = photoUrl && failed !== photoUrl ? photoUrl : null;
  return (
    <span
      aria-hidden="true"
      data-avatar={photo ? 'photo' : 'silhouette'}
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden',
        s.box,
        photo ? 'bg-muted' : muted ? 'bg-secondary text-muted-foreground/70' : 'bg-secondary text-muted-foreground',
        className,
      )}
    >
      {photo ? (
        <Image
          src={photo}
          alt=""
          width={s.px}
          height={s.px}
          unoptimized
          onError={() => setFailed(photo)}
          className={cn('size-full object-cover', muted && 'opacity-70 grayscale')}
        />
      ) : (
        <SilhouetteIcon className={cn(s.icon, 'translate-y-[12%]')} />
      )}
    </span>
  );
}
