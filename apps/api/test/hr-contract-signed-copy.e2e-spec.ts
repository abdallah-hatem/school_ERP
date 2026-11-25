import type { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  ErrorCode,
  type AuditEntry,
  type AuthUser,
  type Contract,
  type ContractSignedCopy,
  type ContractsPage,
  type UserAccount,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { ContractsService } from '../src/modules/hr/contracts/services/contracts.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { deleteEmployees } from './helpers/employees';
import { historyMark } from './helpers/history';

/*
 * A contract's signed copy (owner, 2026-11-24) through the API, as timeline walks: pages uploaded,
 * a renewal, a page removed with a reason and the History; who may see and change it (a stage head,
 * one's own contract); the files refused; and the signed contract of a new employee. Employees are
 * created through the API (they get their first contract there), years ahead so this suite's
 * contracts are alone in their contract years; the school's today is the first day of those
 * contracts (`ContractsService.today`), so they are in force.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const TEMPORARY = 'a-temporary-password-1';
const OWN = 'my-own-password-123';
const YEAR = 2047; // 1 Jun 2047 – 31 May 2048

function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list
    .map((c) => c.split(';')[0] ?? '')
    .filter((pair) => pair.startsWith(`${AUTH_COOKIES.access}=`) || pair.startsWith(`${AUTH_COOKIES.refresh}=`))
    .join('; ');
}

describe('Contract signed copy (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let admin: string;
  let stageA: string;
  let stageB: string;
  let departmentId: string;
  let jobTitleId: string;
  let mark: bigint;
  const users: string[] = [];
  const employees: string[] = [];
  let pinnedToday: jest.SpyInstance;

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = admin;
    }
  }

  const newUser = async (label: string, roleKeys: string[], employeeId: string | null = null) => {
    const id = (
      await db.user.create({
        data: { email: `${unique(label)}@example.test`, name: label, passwordHash: 'x', employeeId },
        select: { id: true },
      })
    ).id;
    users.push(id);
    await giveRoles(db, id, roleKeys);
    return id;
  };

  /** A real session (files are opened with the session cookie, checked by the real auth). */
  async function session(roleKeys: string[], employeeId: string | null = null): Promise<string> {
    const roleIds = (await db.role.findMany({ where: { key: { in: roleKeys } }, select: { id: true } })).map((r) => r.id);
    const email = `${unique('signed')}@school.test`.toLowerCase();
    const u = (await http(app).post('/users').send({ name: unique('Reader'), email, password: TEMPORARY, roleIds, employeeId }).expect(201))
      .body.data as UserAccount;
    users.push(u.id);
    const first = await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: TEMPORARY }).expect(200);
    await http(app).post('/account/password').set(ANONYMOUS_HEADER, '1').set('Cookie', sessionCookie(first)).send({ newPassword: OWN }).expect(204);
    return sessionCookie(await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: OWN }).expect(200));
  }
  const withCookie = (cookie: string) => ({
    get: (url: string) => http(app).get(url).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie),
    post: (url: string) => http(app).post(url).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie),
  });

  const employee = async (over: Record<string, unknown> = {}) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Signed'),
          nameAr: unique('موقع'),
          gender: 'MALE',
          dateOfBirth: '1988-03-01',
          phone: '01000000000',
          hireDate: '2016-09-01',
          stageId: stageA,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          contractStart: `${YEAR}-06-01`,
          contractEnd: `${YEAR + 1}-05-31`,
          ...over,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };

  const contractsOf = async (employeeId: string): Promise<Contract[]> =>
    (await http(app).get(`/hr/employees/${employeeId}/contracts`).expect(200)).body.data as Contract[];
  const upload = (contractId: string, file: Buffer, filename: string, contentType: string) =>
    http(app).post(`/hr/contracts/${contractId}/signed-copy`).attach('file', file, { filename, contentType });
  const pagesOf = async (contractId: string): Promise<ContractSignedCopy> =>
    (await http(app).get(`/hr/contracts/${contractId}/signed-copy`).expect(200)).body.data as ContractSignedCopy;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    admin = user.id;
    db = app.get(DatabaseService);
    pinnedToday = jest.spyOn(app.get(ContractsService), 'today').mockReturnValue(`${YEAR}-06-01`);
    mark = await historyMark(db);
    [stageA, stageB] = [
      (await db.stage.create({ data: { nameEn: unique('Stage A'), nameAr: unique('مرحلة أ') } })).id,
      (await db.stage.create({ data: { nameEn: unique('Stage B'), nameAr: unique('مرحلة ب') } })).id,
    ];
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
  });

  afterAll(async () => {
    pinnedToday.mockRestore();
    await db.notification.deleteMany({ where: { items: { some: { employeeId: { in: employees } } } } });
    const emails = (await db.user.findMany({ where: { id: { in: users } }, select: { email: true } })).map((u) => u.email);
    await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    // Pages and contracts first, then the employees (test cleanup only; none is ever deleted in the app).
    await deleteEmployees(db, { where: { id: { in: employees } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: { in: [stageA, stageB] } } });
    await app.close();
  });

  it('two pages on the current contract → renew → the new contract has none, the old keeps its pages → a page removed with a reason → History → reopened', async () => {
    const id = await employee();
    const [current] = await contractsOf(id);
    expect(current.signedCopyPages).toBe(0);

    // Two pages, in upload order: a phone photo, then a PDF.
    await upload(current.id, PNG, 'IMG_2041.png', 'image/png').expect(200);
    const two = (await upload(current.id, PDF, 'page-2.pdf', 'application/pdf').expect(200)).body.data as ContractSignedCopy;
    expect(two.files.map((f) => [f.page, f.name, f.mimeType])).toEqual([
      [1, 'IMG_2041.png', 'image/png'],
      [2, 'page-2.pdf', 'application/pdf'],
    ]);
    expect(two.files[0].url).toMatch(new RegExp(`^/files/contract-signed-copies/${current.id}-.+\\.png$`));
    expect(two.files[0].uploadedBy).toMatchObject({ id: admin });
    expect((await contractsOf(id))[0].signedCopyPages).toBe(2);

    // Renewed: the new contract starts with no signed copy; the old one keeps its two pages.
    const renewed = (await http(app).post('/hr/contracts/renew').send({ contractIds: [current.id] }).expect(200)).body.data as Contract[];
    const nextId = renewed[0].next!.id;
    const history = await contractsOf(id);
    expect(history.map((c) => [c.id, c.signedCopyPages])).toEqual([
      [nextId, 0],
      [current.id, 2],
    ]);
    expect((await pagesOf(nextId)).files).toEqual([]);

    // A page removed: a reason is required; it leaves the copy but is kept, with who and why.
    const [first] = two.files;
    await http(app).post(`/hr/contracts/${current.id}/signed-copy/${first.id}/remove`).send({ reason: '  ' }).expect(400);
    const after = (await http(app).post(`/hr/contracts/${current.id}/signed-copy/${first.id}/remove`).send({ reason: 'Blurry photo' }).expect(200))
      .body.data as ContractSignedCopy;
    expect(after.files.map((f) => [f.page, f.name])).toEqual([[2, 'page-2.pdf']]);
    // Removing it again: it isn't there any more.
    await http(app).post(`/hr/contracts/${current.id}/signed-copy/${first.id}/remove`).send({ reason: 'Again' }).expect(404);
    // A page of another contract isn't found through this one.
    await http(app).post(`/hr/contracts/${nextId}/signed-copy/${two.files[1].id}/remove`).send({ reason: 'x' }).expect(404);
    const kept = await db.employeeContractFile.findUniqueOrThrow({ where: { id: first.id } });
    expect(kept).toMatchObject({ removedReason: 'Blurry photo', removedById: admin });
    expect(kept.removedAt).toBeInstanceOf(Date);

    // The employee's History lists the pages added and the removal (with its reason).
    const entries = (await http(app).get(`/audit/records/employee/${id}?limit=100`).expect(200)).body.data as AuditEntry[];
    const signed = entries.filter((e) => e.action.startsWith('hr.contract.signed_copy_'));
    expect(signed.map((e) => e.action)).toEqual(['hr.contract.signed_copy_remove', 'hr.contract.signed_copy_add', 'hr.contract.signed_copy_add']);
    const removal = await db.auditEntry.findFirstOrThrow({
      where: { seq: { gt: mark }, action: 'hr.contract.signed_copy_remove', entityId: current.id },
      select: { actorId: true, changes: true },
    });
    expect(removal.actorId).toBe(admin);
    expect(JSON.stringify(removal.changes)).toContain('Blurry photo');

    // Reopened: the one page left, and the old contract counts one.
    expect((await pagesOf(current.id)).files.map((f) => f.name)).toEqual(['page-2.pdf']);
    expect((await contractsOf(id)).find((c) => c.id === current.id)!.signedCopyPages).toBe(1);
    // The Contracts page's row (owner, 2026-11-25) carries the same count, read with the list itself:
    // this year's row is the renewed contract with its own page, not the renewal's next one.
    const listed = (await http(app).get(`/hr/contracts?year=${YEAR}&search=${encodeURIComponent(current.employee.code)}`).expect(200))
      .body.data as ContractsPage;
    expect(listed.items.map((c) => [c.id, c.signedCopyPages])).toEqual([[current.id, 1]]);
    // The removed page's file no longer opens; the one left does, and its opening is recorded.
    const hr = await session(['hr_manager']);
    await withCookie(hr).get(first.url).expect(404);
    const opened = await withCookie(hr).get(after.files[0].url).expect(200);
    expect(opened.headers['content-type']).toContain('application/pdf');
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.document_open', entityId: current.id } })).toBe(1);
  });

  it('a stage head opens their own stage’s signed copy, gets 404 for another stage’s, and can’t upload', async () => {
    const head = await employee({ stageId: stageA });
    const inA = (await contractsOf(await employee({ stageId: stageA })))[0];
    const inB = (await contractsOf(await employee({ stageId: stageB })))[0];
    const pageA = ((await upload(inA.id, PNG, 'a.png', 'image/png').expect(200)).body.data as ContractSignedCopy).files[0];
    const pageB = ((await upload(inB.id, PNG, 'b.png', 'image/png').expect(200)).body.data as ContractSignedCopy).files[0];
    const stageHead = withCookie(await session(['stage_head'], head));

    const own = (await stageHead.get(`/hr/contracts/${inA.id}/signed-copy`).expect(200)).body.data as ContractSignedCopy;
    expect(own.files.map((f) => f.id)).toEqual([pageA.id]);
    const image = await stageHead.get(pageA.url).expect(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.document_open', entityId: inA.id } })).toBe(1);

    await stageHead.get(`/hr/contracts/${inB.id}/signed-copy`).expect(404);
    await stageHead.get(pageB.url).expect(404);
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.document_open', entityId: inB.id } })).toBe(0);

    await stageHead.post(`/hr/contracts/${inA.id}/signed-copy`).attach('file', PNG, { filename: 'x.png', contentType: 'image/png' }).expect(403);
    await stageHead.post(`/hr/contracts/${inA.id}/signed-copy/${pageA.id}/remove`).send({ reason: 'x' }).expect(403);
    // Signed out → 401; without the view permission (an accountant) the page doesn't exist.
    await http(app).get(pageA.url).set(ANONYMOUS_HEADER, '1').expect(401);
    await withCookie(await session(['accountant'])).get(pageA.url).expect(404);
    expect((await pagesOf(inA.id)).files).toHaveLength(1);
  });

  it('acting on your own contract is refused (OWN_CONTRACT); an unlinked admin may', async () => {
    const self = await employee();
    const [c] = await contractsOf(self);
    // The unlinked System admin (the test user) uploads a page…
    const page = ((await upload(c.id, PNG, 'p.png', 'image/png').expect(200)).body.data as ContractSignedCopy).files[0];
    // …the HR manager linked to this employee can neither add nor remove.
    const manager = await newUser('HR manager', ['hr_manager'], self);
    const add = await as(manager, () => upload(c.id, PNG, 'mine.png', 'image/png').expect(403));
    expect(add.body.error).toBe(ErrorCode.OWN_CONTRACT);
    const remove = await as(manager, () => http(app).post(`/hr/contracts/${c.id}/signed-copy/${page.id}/remove`).send({ reason: 'mine' }).expect(403));
    expect(remove.body.error).toBe(ErrorCode.OWN_CONTRACT);
    expect((await pagesOf(c.id)).files).toHaveLength(1);
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: { startsWith: 'hr.contract.signed_copy_' }, entityId: c.id } })).toBe(1);
  });

  it('a wrong type or a file over 10 MB is refused; any phase takes a signed copy, a cancelled contract doesn’t', async () => {
    const id = await employee();
    const [c] = await contractsOf(id);
    const typeError = await upload(c.id, Buffer.from('just text'), 'notes.png', 'image/png').expect(400);
    expect(typeError.body.error).toBe(ErrorCode.INVALID_FILE_TYPE);
    // A renamed file is refused by its bytes; an SVG never.
    await upload(c.id, Buffer.from('<html></html>'), 'x.pdf', 'application/pdf').expect(400);
    await upload(c.id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml').expect(400);
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    const sizeError = await upload(c.id, big, 'big.pdf', 'application/pdf').expect(413);
    expect(sizeError.body.error).toBe(ErrorCode.FILE_TOO_LARGE);
    await http(app).post(`/hr/contracts/${c.id}/signed-copy`).expect(400);
    expect((await pagesOf(c.id)).files).toEqual([]);
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.signed_copy_add', entityId: c.id } })).toBe(0);

    // Ended (past) → a new contract with a future start (upcoming): both take pages.
    await http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'OTHER', endsOn: `${YEAR}-11-30`, note: 'Left' }).expect(200);
    pinnedToday.mockReturnValue(`${YEAR}-12-01`);
    try {
      await upload(c.id, PNG, 'old.png', 'image/png').expect(200);
      const upcoming = (await http(app).post(`/hr/employees/${id}/contracts`).send({ startsOn: `${YEAR + 1}-06-01` }).expect(201)).body.data as Contract;
      expect(upcoming.phase).toBe('UPCOMING');
      await upload(upcoming.id, PNG, 'next.png', 'image/png').expect(200);
      // Cancelled, it never started: no new pages (409); its page stays viewable.
      await http(app).post(`/hr/contracts/${upcoming.id}/cancel`).send({ reason: 'Never joined' }).expect(200);
      const refused = await upload(upcoming.id, PNG, 'late.png', 'image/png').expect(409);
      expect(refused.body.error).toBe(ErrorCode.CONTRACT_CANCELLED);
      expect((await pagesOf(upcoming.id)).files).toHaveLength(1);
    } finally {
      pinnedToday.mockReturnValue(`${YEAR}-06-01`);
    }
  });

  it('an employee added with a signed contract gets it on their first contract', async () => {
    // "Add employee" saves the employee, then attaches each page to the first contract (the form does
    // exactly these calls, in this order).
    const id = await employee({ contractStart: `${YEAR}-09-01`, contractEnd: `${YEAR + 1}-08-31` });
    const [first, ...others] = await contractsOf(id);
    expect(others).toEqual([]);
    await upload(first.id, PNG, 'عقد-1.png', 'image/png').expect(200);
    await upload(first.id, PNG, 'عقد-2.png', 'image/png').expect(200);
    const [after] = await contractsOf(id);
    expect(after).toMatchObject({ id: first.id, startsOn: `${YEAR}-09-01`, signedCopyPages: 2 });
    // Its Arabic file names read back as typed.
    expect((await pagesOf(first.id)).files.map((f) => f.name)).toEqual(['عقد-1.png', 'عقد-2.png']);
  });
});
