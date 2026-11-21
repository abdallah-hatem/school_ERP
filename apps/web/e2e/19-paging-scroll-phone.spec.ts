import { pagingScrollSpecs } from './support/paging-scroll';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Phone (390×844): the cards stack, so the page is long. */
pagingScrollSpecs('en');
pagingScrollSpecs('ar');
