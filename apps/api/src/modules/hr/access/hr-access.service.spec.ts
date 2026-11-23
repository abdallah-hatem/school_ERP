import { ErrorCode } from '@school-erp/shared';
import type { ClsService } from 'nestjs-cls';
import type { PermissionsService } from '../../../core/permissions';
import { HrAccessService } from './hr-access.service';

/** The service for a request signed in as `user` (none: the system acts). */
function makeService(user: { id: string } | null, link: string | null, isSystemAdmin: boolean) {
  const permissions = {
    linkedEmployeeOf: jest.fn().mockResolvedValue(link),
    heldGrants: jest.fn().mockResolvedValue({ isSystemAdmin, grants: [] }),
  };
  const cls = {
    isActive: () => user !== null,
    get: () => ({ user: user ?? undefined }),
  };
  return new HrAccessService(permissions as unknown as PermissionsService, cls as unknown as ClsService);
}

describe('HrAccessService.assertLinkedForPay — M2-B (§6, owner 2026-11-23)', () => {
  it('an unlinked account that isn’t a System admin can’t act on pay (403 ACCOUNT_NOT_LINKED)', async () => {
    await expect(makeService({ id: 'u-1' }, null, false).assertLinkedForPay()).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_NOT_LINKED,
      status: 403,
    });
  });

  it('a linked account may; so may an unlinked System admin, and the system itself', async () => {
    await expect(makeService({ id: 'u-1' }, 'e-1', false).assertLinkedForPay()).resolves.toBeUndefined();
    await expect(makeService({ id: 'u-1' }, null, true).assertLinkedForPay()).resolves.toBeUndefined();
    await expect(makeService(null, null, false).assertLinkedForPay()).resolves.toBeUndefined();
  });
});
