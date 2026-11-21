import { formActionsSpecs } from './support/form-actions';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Phone (390×844): the same checks — this is where the forms are longest. */
formActionsSpecs('en');
formActionsSpecs('ar');
