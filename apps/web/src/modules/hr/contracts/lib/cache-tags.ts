/**
 * The cache tags of the contracts screens: every contract read is tagged with `CONTRACTS_TAG`, and a
 * write expires it — from `apis.ts` (Server Actions) and from the upload Route Handler alike. A write
 * that changes what the employee screens show (dates, status) expires `EMPLOYEES_TAG` too.
 */
export const CONTRACTS_TAG = 'hr-contracts';
export const EMPLOYEES_TAG = 'hr-employees';
