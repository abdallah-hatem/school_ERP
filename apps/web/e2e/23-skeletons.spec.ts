import { defineSkeletonSpecs } from './support/skeletons';

/*
 * Every skeleton matches the screen it stands in for, on a desktop (1440×900), in English then
 * Arabic. How the comparison works: support/skeletons.ts; the phone pass is
 * 23-skeletons-phone.spec.ts.
 */
defineSkeletonSpecs(['en', 'ar']);
