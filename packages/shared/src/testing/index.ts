/*
 * Test-only exports: fixtures shared by this package's tests and the API's e2e specs. Imported as
 * `@school-erp/shared/testing`, never by app code — the main entry (`@school-erp/shared`) stays free
 * of test data so it never reaches a browser bundle. A guard test enforces both.
 */
export * from './search-fixture';
