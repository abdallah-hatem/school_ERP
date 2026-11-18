'use client';

import { Gender } from '@school-erp/shared';
import Image from 'next/image';
import { useState } from 'react';
import { FemaleSilhouetteIcon, MaleSilhouetteIcon, PersonSilhouetteIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';

/**
 * Avatar sizes: `xs` in pickers and stacks, `sm` in table rows and the user chip, `md` in headers,
 * `lg` on cards, `xl` in the photo picker.
 */
const SIZES = {
  xs: { box: 'size-7 rounded-lg', px: 28 },
  sm: { box: 'size-9 rounded-xl', px: 36 },
  md: { box: 'size-12 rounded-2xl', px: 48 },
  lg: { box: 'size-16 rounded-[1.25rem]', px: 64 },
  xl: { box: 'size-24 rounded-3xl', px: 96 },
} as const;
export type PersonAvatarSize = keyof typeof SIZES;

export interface PersonAvatarProps {
  /** The (linked) employee's photo (`/files/employee-photos/…`, signed-in only); null → the silhouette. */
  photoUrl?: string | null;
  /**
   * Picks the male or female silhouette when there is no photo; unknown — an account with no
   * linked employee — → the neutral one.
   */
  gender?: Gender | null;
  size?: PersonAvatarSize;
  /** Greyed out (an inactive employee or user). */
  muted?: boolean;
  className?: string;
}

const SILHOUETTES = {
  [Gender.MALE]: MaleSilhouetteIcon,
  [Gender.FEMALE]: FemaleSilhouetteIcon,
} as const;

/**
 * Every person's avatar — employees, and user accounts through their linked employee (owner,
 * 2026-11-19): the photo, square-cropped (`object-cover`), or a person silhouette when there is
 * none or it fails to load — male or female by `gender`, neutral when it is unknown; never initials
 * (owner, 2026-11-18). The background stays the same neutral tile for all three.
 * Decorative: the name next to it is what screen readers read.
 */
export function PersonAvatar({ photoUrl, gender, size = 'sm', muted = false, className }: PersonAvatarProps) {
  const s = SIZES[size];
  // A photo that can't be loaded (deleted, signed out) falls back to the silhouette.
  const [failed, setFailed] = useState<string | null>(null);
  const photo = photoUrl && failed !== photoUrl ? photoUrl : null;
  const Silhouette = (gender && SILHOUETTES[gender]) || PersonSilhouetteIcon;
  return (
    <span
      aria-hidden="true"
      data-avatar={photo ? 'photo' : 'silhouette'}
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden',
        s.box,
        // No photo: the classic default avatar — a white figure on a light grey tile.
        photo ? 'bg-muted' : cn('bg-avatar-tile text-avatar-figure', muted && 'opacity-70'),
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
        // The figures fill the tile edge to edge, shoulders on the bottom edge.
        <Silhouette className="size-full" />
      )}
    </span>
  );
}
