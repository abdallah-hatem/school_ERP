import { Controller, Get, INestApplication, Module, Post } from '@nestjs/common';
import { ErrorCode, PERMISSION_KEYS, type AuthUser } from '@school-erp/shared';
import { Permission, SignedIn } from '../src/core/permissions';
import { http } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';

/**
 * Test-only endpoints exercising the global permission guard on the real app (R3, edge cases 1
 * and 9). Not part of the app; the controller scans only cover src/.
 */
@Controller('__permission-probe')
class PermissionProbeController {
  /** Edge case 1 — a handler that forgot its declaration. */
  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }

  @Post('undeclared')
  undeclaredWrite() {
    return { ok: true };
  }

  @Get('signed-in')
  @SignedIn()
  signedIn() {
    return { ok: true };
  }

  @Get('record')
  @Permission('hr.penalties.record')
  record() {
    return { ok: true };
  }

  @Get('approve')
  @Permission('hr.penalties.view', 'hr.penalties.approve')
  approve() {
    return { ok: true };
  }
}

@Module({ controllers: [PermissionProbeController] })
class PermissionProbeModule {}

describe('permissions (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser(undefined, [PermissionProbeModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  /** Runs `fn` as a user whose role P1 grants nothing (the test user's role, swapped). */
  async function asRoleWithoutPermissions(fn: () => Promise<void>) {
    const role = user.role;
    user.role = 'NO_PERMISSIONS' as AuthUser['role'];
    try {
      await fn();
    } finally {
      user.role = role;
    }
  }

  it('edge case 1 — an endpoint without a declaration → 403 at run time, even for the HR admin', async () => {
    const res = await http(app).get('/__permission-probe/undeclared').expect(403);
    expect(res.body).toMatchObject({ success: false, error: ErrorCode.FORBIDDEN });
    await http(app).post('/__permission-probe/undeclared').expect(403);
  });

  it('signed out → 401 before any 403', async () => {
    for (const path of ['undeclared', 'record', 'signed-in']) {
      const res = await http(app)
        .get(`/__permission-probe/${path}`)
        .set(ANONYMOUS_HEADER, '1')
        .expect(401);
      expect(res.body.error).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it('the HR admin holds every key: declared endpoints pass, behaviour unchanged', async () => {
    await http(app).get('/__permission-probe/record').expect(200);
    await http(app).get('/__permission-probe/approve').expect(200);
    await http(app).get('/hr/penalties').expect(200);
  });

  it('a user without the key → 403 on the probe and on real endpoints; @SignedIn still passes', async () => {
    await asRoleWithoutPermissions(async () => {
      await http(app).get('/__permission-probe/record').expect(403);
      await http(app).get('/__permission-probe/approve').expect(403);
      await http(app).get('/__permission-probe/signed-in').expect(200);
      // Edge case 9 — penalty approve without hr.penalties.approve → 403 (before the id is looked up).
      await http(app)
        .post('/hr/penalties/00000000-0000-4000-8000-000000000000/approve')
        .expect(403);
      await http(app).get('/audit').expect(403);
      await http(app).get('/audit/actors').expect(403);
      await http(app)
        .get('/audit/summary?from=2026-11-17T00:00:00Z&to=2026-11-18T00:00:00Z')
        .expect(403);
      await http(app).get('/audit/records/employee/x/fields').expect(403);
      const me = await http(app).get('/auth/me').expect(200);
      expect(me.body.data.permissions).toEqual([]);
    });
  });

  it('GET /auth/me carries the user’s permission keys (R6)', async () => {
    const res = await http(app).get('/auth/me').expect(200);
    expect(res.body.data).toMatchObject({ id: user.id, role: 'HR_ADMIN' });
    expect([...res.body.data.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});
