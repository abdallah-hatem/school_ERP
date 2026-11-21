import { pagingScrollSpecs } from './support/paging-scroll';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Desktop (1440×900). */
pagingScrollSpecs('en');
pagingScrollSpecs('ar');
