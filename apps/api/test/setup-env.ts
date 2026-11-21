import { existsSync } from 'node:fs';

// On a machine that has ~/.config/school-erp/e2e-ci-only (the owner's, so also every Claude agent
// on it), API e2e tests run on GitHub CI only (owner, 2026-11-21). Other developers run them locally.
if (process.env.GITHUB_ACTIONS !== 'true' && existsSync(join(homedir(), '.config/school-erp/e2e-ci-only'))) {
  throw new Error('On this machine API e2e tests run on GitHub CI only (owner rule). Push and let CI run them.');
}

/**
 * e2e environment. DATABASE_URL and PORT come from the caller's env so parallel agents each use
 * their own database (create one with `scripts/e2e-db.sh <n>`):
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5442/school_erp_e2e_1 PORT=4101 \
 *     pnpm --filter api test:e2e
 *
 * Refuses to run against anything that isn't an `_e2e` database — teardown deletes rows.
 */
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

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
// Uploads go to a throwaway folder per database, never the app's own uploads/.
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(tmpdir(), `${dbName}-uploads`);
// A throwaway signing secret for tests only (the real one comes from the deployment's env).
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'e2e-only-secret-'.repeat(4);
// The seed suite's HR admin password (test only; the real one comes from the operator's env).
process.env.SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'e2e-only-seed-password';
