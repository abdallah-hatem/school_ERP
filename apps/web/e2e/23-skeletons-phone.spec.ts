import { defineSkeletonSpecs } from './support/skeletons';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/*
 * Runs in the `phone-ar` project only (390×844, touch): every skeleton matches the screen it
 * stands in for on a phone, in Arabic then English. See support/skeletons.ts.
 */
defineSkeletonSpecs(['ar', 'en']);
