import { formActionsSpecs } from './support/form-actions';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Desktop (1440×900): Save stays on screen while the employee forms are scrolled. */
formActionsSpecs('en');
formActionsSpecs('ar');
