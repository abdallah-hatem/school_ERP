import { defineCappedCardSpecs } from './support/capped-cards';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/*
 * Phone (390×844, phone-ar project): the Approved payroll month's cards flow with the page — no
 * scroll box inside the scrolling page. See support/capped-cards.ts.
 */
defineCappedCardSpecs('ar', 'flows');
defineCappedCardSpecs('en', 'flows');
