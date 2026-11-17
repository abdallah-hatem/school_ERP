import { defineSkeletonSpecs } from './support/skeletons';

/*
 * Runs in the `phone-ar` project only (390×844, touch): every skeleton matches the screen it
 * stands in for on a phone, in Arabic then English. See support/skeletons.ts.
 */
defineSkeletonSpecs(['ar', 'en']);
