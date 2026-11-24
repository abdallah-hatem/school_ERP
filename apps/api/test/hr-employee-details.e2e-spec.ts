/**
 * §3 (owner, 2026-11-18): social insurance, bank account, emergency contact, qualification and
 * the employee photo — create / update / read through the real API and database.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, type AuthUser, type CreateEmployeeRequest, type Employee } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';
import { deleteEmployees } from './helpers/employees';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake png body'),
]);
const WEBP = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 body', 'latin1');
const IBAN = 'EG380019000500000000263180002';

describe('HR employee details and photo (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let roleless: string;
  let refs: { stageId: string; departmentId: string; jobTitleId: string };
  /** Where a `/files/<folder>/<name>` URL lives on disk (setup-env points UPLOADS_DIR at a temp folder). */
  const onDisk = (url: string) =>
    join(app.get(ConfigService).getOrThrow<string>('uploadsDir'), url.replace(/^\/files\//, ''));

  let seq = 0;
  const digits = (n: number) => `${Date.now()}${seq++}`.slice(-n).padStart(n, '7');

  const body = (overrides: Partial<CreateEmployeeRequest> = {}): CreateEmployeeRequest => ({
    nameEn: unique('Employee'),
    nameAr: unique('موظف'),
    gender: 'MALE',
    dateOfBirth: '1988-03-02',
    phone: '01000000000',
    hireDate: '2023-09-01',
    ...refs,
    workSystem: 'FULL_TIME',
    basicSalary: 1_200_000,
    ...overrides,
  });

  const insured = () => ({
    insuranceStatus: 'INSURED' as const,
    insuranceNumber: digits(9),
    insuranceRegistrationDate: '2023-10-01',
    insuredSalary: 900_000,
  });

  const createOk = async (overrides: Partial<CreateEmployeeRequest> = {}) =>
    (await http(app).post('/hr/employees').send(body(overrides)).expect(201)).body.data as Employee;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    const mk = async (path: string, nameEn: string) =>
      (await http(app).post(path).send({ nameEn, nameAr: `${nameEn}-ar` }).expect(201)).body.data
        .id as string;
    refs = {
      stageId: (await db.stage.create({ data: { nameEn: 'Prep', nameAr: 'إعدادي' } })).id,
      departmentId: await mk('/hr/departments', unique('Dept')),
      jobTitleId: await mk('/hr/job-titles', unique('Title')),
    };
    roleless = (
      await db.user.upsert({
        where: { email: 'e2e-details-roleless@example.test' },
        create: { email: 'e2e-details-roleless@example.test', name: 'No Roles', passwordHash: 'x' },
        update: {},
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await db.employee.updateMany({ data: { managerId: null } });
    await deleteEmployees(db);
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await db.user.deleteMany({ where: { id: roleless } });
    await app.close();
  });

  describe('create and read', () => {
    it('a new employee is not insured and has no details; every group reads back after create', async () => {
      const plain = await createOk();
      expect(plain).toMatchObject({
        insuranceStatus: 'NOT_INSURED',
        insuranceNumber: null,
        insuranceRegistrationDate: null,
        insuredSalary: null,
        iban: null,
        highestDegree: null,
        graduationYear: null,
        photoUrl: null,
      });

      const ins = insured();
      const full = await createOk({
        ...ins,
        bankName: '  National Bank of Egypt ',
        bankAccountNumber: '0123456789012',
        iban: 'eg38 0019 0005 0000 0000 2631 8000 2',
        emergencyContactName: 'Ahmed Khalil',
        emergencyContactRelationship: 'Brother',
        emergencyContactPhone: '+20 111 234 5678',
        highestDegree: 'BACHELOR',
        major: 'English',
        university: 'Cairo University',
        graduationYear: 2010,
      });
      const read = (await http(app).get(`/hr/employees/${full.id}`).expect(200)).body.data as Employee;
      expect(read).toMatchObject({
        ...ins,
        bankName: 'National Bank of Egypt',
        iban: IBAN,
        emergencyContactPhone: '+20 111 234 5678',
        highestDegree: 'BACHELOR',
        graduationYear: 2010,
      });
    });

    it('insured requires the number, the registration date and the insured salary', async () => {
      const before = await db.employee.count();
      for (const missing of ['insuranceNumber', 'insuranceRegistrationDate', 'insuredSalary'] as const) {
        await http(app)
          .post('/hr/employees')
          .send(body({ ...insured(), [missing]: null }))
          .expect(400);
        const { [missing]: _left, ...rest } = insured();
        await http(app).post('/hr/employees').send(body(rest)).expect(400);
      }
      expect(await db.employee.count()).toBe(before);
    });

    it('format rules: digits-only insurance number, past registration date, salary > 0, IBAN, degree, year', async () => {
      const bad: Partial<CreateEmployeeRequest>[] = [
        { ...insured(), insuranceNumber: '12-34' },
        { ...insured(), insuranceRegistrationDate: '2999-01-01' },
        { ...insured(), insuredSalary: 0 },
        { ...insured(), insuredSalary: 10.5 },
        { iban: `${IBAN}1` },
        { iban: `SA${IBAN.slice(2)}` },
        { highestDegree: 'PHD' as never },
        { graduationYear: 1949 },
        { graduationYear: new Date().getFullYear() + 1 },
        { insuranceStatus: 'MAYBE' as never },
      ];
      for (const overrides of bad) {
        await http(app).post('/hr/employees').send(body(overrides)).expect(400);
      }
      await createOk({ graduationYear: 1950 });
      await createOk({ graduationYear: new Date().getFullYear(), highestDegree: 'NONE' });
    });

    it('not insured clears the insurance details even when they are sent', async () => {
      const e = await createOk({ ...insured(), insuranceStatus: 'NOT_INSURED' });
      expect(e).toMatchObject({
        insuranceStatus: 'NOT_INSURED',
        insuranceNumber: null,
        insuranceRegistrationDate: null,
        insuredSalary: null,
      });
    });

    it('a duplicate insurance number → 409 DUPLICATE_INSURANCE_NUMBER', async () => {
      const ins = insured();
      await createOk(ins);
      const res = await http(app).post('/hr/employees').send(body(ins)).expect(409);
      expect(res.body.error).toBe(ErrorCode.DUPLICATE_INSURANCE_NUMBER);
    });
  });

  describe('update', () => {
    it('becoming insured needs all three; then one detail can change alone; not insured clears them', async () => {
      const e = await createOk();
      await http(app).patch(`/hr/employees/${e.id}`).send({ insuranceStatus: 'INSURED' }).expect(400);

      const ins = insured();
      await http(app).patch(`/hr/employees/${e.id}`).send(ins).expect(200);
      const raised = (
        await http(app).patch(`/hr/employees/${e.id}`).send({ insuredSalary: 950_000 }).expect(200)
      ).body.data as Employee;
      expect(raised).toMatchObject({ ...ins, insuredSalary: 950_000 });

      // Clearing a required detail while staying insured is refused.
      await http(app).patch(`/hr/employees/${e.id}`).send({ insuranceNumber: null }).expect(400);
      await http(app).patch(`/hr/employees/${e.id}`).send({ insuranceStatus: null }).expect(400);

      const cleared = (
        await http(app).patch(`/hr/employees/${e.id}`).send({ insuranceStatus: 'NOT_INSURED' }).expect(200)
      ).body.data as Employee;
      expect(cleared).toMatchObject({
        insuranceStatus: 'NOT_INSURED',
        insuranceNumber: null,
        insuranceRegistrationDate: null,
        insuredSalary: null,
      });
      const row = await db.employee.findUniqueOrThrow({ where: { id: e.id } });
      expect(row.insuranceNumber).toBeNull();
      // Its old number is free for someone else now.
      await createOk(ins);
    });

    it('keeping your own insurance number → 200; taking another employee’s → 409', async () => {
      const a = insured();
      const first = await createOk(a);
      const second = await createOk(insured());
      await http(app).patch(`/hr/employees/${first.id}`).send(a).expect(200);
      const res = await http(app)
        .patch(`/hr/employees/${second.id}`)
        .send({ insuranceNumber: a.insuranceNumber })
        .expect(409);
      expect(res.body.error).toBe(ErrorCode.DUPLICATE_INSURANCE_NUMBER);
    });

    it('optional details can be set and cleared (empty text → null)', async () => {
      const e = await createOk({ bankName: 'CIB', iban: IBAN, major: 'Maths', graduationYear: 2001 });
      const cleared = (
        await http(app)
          .patch(`/hr/employees/${e.id}`)
          .send({ bankName: '', iban: null, major: '  ', graduationYear: null, highestDegree: null })
          .expect(200)
      ).body.data as Employee;
      expect(cleared).toMatchObject({ bankName: null, iban: null, major: null, graduationYear: null });
    });
  });

  describe('photo', () => {
    const upload = (id: string, file: Buffer, filename: string, contentType: string) =>
      http(app).post(`/hr/employees/${id}/photo`).attach('file', file, { filename, contentType });

    it('PNG / WebP accepted, stored and never public; replacing deletes the old file; remove → null', async () => {
      const e = await createOk();
      const first = (await upload(e.id, PNG, 'me.png', 'image/png').expect(200)).body.data as Employee;
      expect(first.photoUrl).toMatch(new RegExp(`^/files/employee-photos/${e.id}-[0-9a-f-]+\\.png$`));
      expect(readFileSync(onDisk(first.photoUrl!)).equals(PNG)).toBe(true);
      // Served like the logo but signed-in only (the files middleware checks the session cookie).
      await http(app).get(first.photoUrl!).set(ANONYMOUS_HEADER, '1').expect(401);

      const second = (await upload(e.id, WEBP, 'me.webp', 'image/webp').expect(200)).body.data as Employee;
      expect(second.photoUrl).toMatch(/\.webp$/);
      expect(existsSync(onDisk(first.photoUrl!))).toBe(false);
      expect(existsSync(onDisk(second.photoUrl!))).toBe(true);
      expect((await http(app).get(`/hr/employees/${e.id}`).expect(200)).body.data.photoUrl).toBe(
        second.photoUrl,
      );
      // The list cards get it too.
      const list = await http(app).get('/hr/employees').query({ search: e.code }).expect(200);
      expect(list.body.data[0].photoUrl).toBe(second.photoUrl);

      const removed = (await http(app).delete(`/hr/employees/${e.id}/photo`).expect(200)).body
        .data as Employee;
      expect(removed.photoUrl).toBeNull();
      expect(existsSync(onDisk(second.photoUrl!))).toBe(false);
      // Removing again changes nothing.
      await http(app).delete(`/hr/employees/${e.id}/photo`).expect(200);
    });

    it('wrong type (SVG, GIF, text, bytes that are not the declared type) → 400; over 2 MB → 413; no file → 400', async () => {
      const e = await createOk();
      const svg = await upload(e.id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg', 'image/svg+xml').expect(400);
      expect(svg.body.error).toBe(ErrorCode.INVALID_FILE_TYPE);
      await upload(e.id, Buffer.from('GIF89a....'), 'a.gif', 'image/gif').expect(400);
      await upload(e.id, Buffer.from('hello'), 'a.txt', 'text/plain').expect(400);
      await upload(e.id, PNG, 'a.jpg', 'image/jpeg').expect(400);
      const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
      const res = await upload(e.id, big, 'big.png', 'image/png').expect(413);
      expect(res.body.error).toBe(ErrorCode.FILE_TOO_LARGE);
      await http(app).post(`/hr/employees/${e.id}/photo`).expect(400);
      expect((await db.employee.findUniqueOrThrow({ where: { id: e.id } })).photoUrl).toBeNull();
    });

    it('unknown employee → 404; without hr.employees.edit → 403', async () => {
      await upload('11111111-1111-4111-8111-111111111111', PNG, 'a.png', 'image/png').expect(404);
      const e = await createOk();
      const id = user.id;
      user.id = roleless;
      try {
        await upload(e.id, PNG, 'a.png', 'image/png').expect(403);
        await http(app).delete(`/hr/employees/${e.id}/photo`).expect(403);
      } finally {
        user.id = id;
      }
    });
  });
});
