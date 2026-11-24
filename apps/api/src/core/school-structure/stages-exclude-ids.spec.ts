import type { TransactionHost } from '@nestjs-cls/transactional';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DbAdapter } from '../../database/transactions';
import { ListItemsQueryDto, wantsPage } from './dto/list-item.dto';
import { StageRepository } from './repositories/stage.repository';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

async function parse(query: Record<string, string>) {
  const dto = plainToInstance(ListItemsQueryDto, query);
  return { dto, errors: await validate(dto) };
}

function makeRepository() {
  const tx = {
    stage: {
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(0)),
    },
  };
  const repository = new StageRepository({ tx } as unknown as TransactionHost<DbAdapter>);
  return { repository, tx };
}

describe('GET /stages excludeIds (a picker leaves out what is already chosen)', () => {
  it('reads a comma-separated list of UUIDs and asks for a page', async () => {
    const { dto, errors } = await parse({ excludeIds: `${A},${B}` });
    expect(errors).toEqual([]);
    expect(dto.excludeIds).toEqual([A, B]);
    expect(wantsPage(dto)).toBe(true);
  });

  it('refuses an id that is not a UUID', async () => {
    const { errors } = await parse({ excludeIds: `${A},not-a-uuid` });
    expect(errors.map((e) => e.property)).toContain('excludeIds');
  });

  it('refuses more than 50 ids', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
    const { errors } = await parse({ excludeIds: many.join(',') });
    expect(errors.map((e) => e.property)).toContain('excludeIds');
  });

  it('the repository leaves the excluded ids out of both the page and its total', async () => {
    const { repository, tx } = makeRepository();
    await repository.findPage(false, 1, 20, undefined, undefined, [A, B]);
    const expected = { isActive: true, id: { notIn: [A, B] } };
    expect(tx.stage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expected }));
    expect(tx.stage.count).toHaveBeenCalledWith({ where: expected });
  });

  it('with ids too, keeps only those and still leaves the excluded ones out', async () => {
    const { repository, tx } = makeRepository();
    await repository.findPage(true, 1, 20, undefined, [A, B], [B]);
    expect(tx.stage.count).toHaveBeenCalledWith({ where: { id: { in: [A, B], notIn: [B] } } });
  });

  it('an empty exclusion changes nothing', async () => {
    const { repository, tx } = makeRepository();
    await repository.findPage(false, 1, 20, undefined, undefined, []);
    expect(tx.stage.count).toHaveBeenCalledWith({ where: { isActive: true } });
  });
});
