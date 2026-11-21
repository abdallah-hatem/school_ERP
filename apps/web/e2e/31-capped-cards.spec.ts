import { defineCappedCardSpecs } from './support/capped-cards';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/*
 * Desktop (1440×900): the Approved payroll month's cards scroll inside a capped box with the
 * pagination in sight, in English and Arabic. The phone pass is 31-capped-cards-phone.spec.ts.
 */
defineCappedCardSpecs('en', 'capped');
defineCappedCardSpecs('ar', 'capped');
