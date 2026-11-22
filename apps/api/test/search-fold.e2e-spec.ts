import { SEARCH_FIXTURE, searchKey } from '@school-erp/shared';
import type { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';
import { e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The guard that keeps the two folds identical (docs/ARCHITECTURE.md → Search): the database's
 * `search_fold(text)` (which fills every generated search column) must give exactly what
 * `searchKey` (which folds the typed query) gives, for every string of the shared fixture. A change
 * to one fold without the other fails here.
 */

const strings = [
  ...new Set<string>([
    ...SEARCH_FIXTURE.strings,
    ...SEARCH_FIXTURE.same.flat(),
    ...SEARCH_FIXTURE.matches.flat(),
    ...SEARCH_FIXTURE.misses.flat(),
  ]),
];

describe('search_fold (SQL) equals searchKey (JS) on the shared fixture (e2e)', () => {
  let db: DatabaseService;

  beforeAll(() => {
    db = new DatabaseService({ getOrThrow: () => e2eDatabaseUrl() } as unknown as ConfigService);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it.each(strings.map((s) => [JSON.stringify(s), s]))('%s', async (_label, s) => {
    const [row] = await db.$queryRaw<{ folded: string }[]>`SELECT search_fold(${s}) AS folded`;
    expect(row.folded).toBe(searchKey(s));
  });

  it('the generated columns follow inserts and updates; the client never returns them', async () => {
    const role = await db.role.create({
      data: { key: `search-fold-${Date.now()}`, nameEn: '  Abdel  Rahman ', nameAr: 'عَبْد الرَّحمٰن' },
    });
    expect(role).not.toHaveProperty('searchText');
    expect(role).not.toHaveProperty('searchCompact');
    const read = async () =>
      (
        await db.$queryRaw<{ text: string; compact: string }[]>`
          SELECT search_text AS text, search_compact AS compact FROM roles WHERE id = ${role.id}::uuid`
      )[0];
    expect(await read()).toEqual({ text: 'abdel rahman عبد الرحمن', compact: 'abdelrahmanعبدالرحمن' });
    await db.role.update({ where: { id: role.id }, data: { nameAr: 'أبو بكر' } });
    expect(await read()).toEqual({ text: 'abdel rahman ابو بكر', compact: 'abdelrahmanابوبكر' });
    await db.role.delete({ where: { id: role.id } });
  });

  it('search_fold is IMMUTABLE (generated columns and indexes need it)', async () => {
    const [row] = await db.$queryRaw<{ volatility: string }[]>`
      SELECT provolatile AS volatility FROM pg_proc WHERE proname = 'search_fold'`;
    expect(row.volatility).toBe('i');
  });
});
