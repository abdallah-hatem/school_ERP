/**
 * e2e environment. DATABASE_URL and PORT come from the caller's env so parallel agents each use
 * their own database (create one with `scripts/e2e-db.sh <n>`):
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5442/school_erp_e2e_1 PORT=4101 \
 *     pnpm --filter api test:e2e
 *
 * Refuses to run against anything that isn't an `_e2e` database — teardown deletes rows.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('e2e: DATABASE_URL is required (create one with scripts/e2e-db.sh <n>)');
}
const dbName = new URL(url).pathname.replace(/^\//, '');
if (!/_e2e(_\w+)?$/.test(dbName)) {
  throw new Error(`e2e: refusing to run against "${dbName}" — use a school_erp_e2e_<n> database`);
}
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '0';
