import { notFound } from 'next/navigation';

/**
 * Any path under `/<locale>/` that no route matches lands here (a catch-all matches last), so it
 * renders `app/[locale]/not-found.tsx` — in the address's language, with a 404 status — instead of
 * Next's default page.
 */
export default function MissingPage(): never {
  notFound();
}
