import type { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  ErrorCode,
  type Contract,
  type ContractCopy,
  type ContractDocument,
  type ContractPrintPreview,
  type ContractPrintTemplateOption,
  type ContractTemplate,
  type ContractTemplateSummary,
  type InlineNode,
  type SaveContractTemplateResponse,
  type UserAccount,
} from '@school-erp/shared';
import { CodedException } from '../src/common/errors/coded.exception';
import { PdfRenderer } from '../src/common/pdf/pdf-renderer.service';
import { StagesService } from '../src/core/school-structure';
import { DatabaseService } from '../src/database/database.service';
import { ContractPrintService } from '../src/modules/hr/contracts/services/contract-print.service';
import { ContractsService } from '../src/modules/hr/contracts/services/contracts.service';
import { sampleContractDocument } from '../prisma/seed/data/contract-template';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { deleteEmployees } from './helpers/employees';
import { historyMark } from './helpers/history';

/*
 * Contract templates and printed copies (spec docs/specs/2026-11-24-contract-templates.md) through
 * the API: the timeline walks A–D and the edge cases that need the database, the PDF renderer
 * (real headless Chromium) or the files route. The school's today is pinned to the start of this
 * suite's contract year. The suite's templates are defaults for part-time systems only, so the
 * seed's "Full-time contract" keeps its full-time mark; its employees work part-time 3 days.
 */

const YEAR = 2047; // 1 Jun 2047 – 31 May 2048
const TODAY = `${YEAR}-06-02`;
const TEMPORARY = 'a-temporary-password-1';
const OWN = 'my-own-password-123';

const t = (text: string): InlineNode => ({ type: 'text', text });
const f = (key: string): InlineNode => ({ type: 'field', attrs: { key } }) as InlineNode;
const doc = (...paragraphs: InlineNode[][]): ContractDocument => ({
  type: 'doc',
  content: paragraphs.map((content) => ({ type: 'paragraph', content })),
});
/** A text with a salary field. */
const withSalary = (words = 'Salary') => doc([t(`${words} `), f('contract.salary'), t(' — '), f('contract.salaryWords')], [t('Name '), f('employee.nameAr')]);
/** A text without any salary field. */
const withoutSalary = (words = 'Hours') => doc([t(`${words} `), f('contract.workSystem')], [t('Name '), f('employee.nameAr')]);

function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list
    .map((c) => c.split(';')[0] ?? '')
    .filter((pair) => pair.startsWith(`${AUTH_COOKIES.access}=`) || pair.startsWith(`${AUTH_COOKIES.refresh}=`))
    .join('; ');
}

describe('Contract templates and printed copies (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let admin: string;
  let user: { id: string; name: string };
  let mark: bigint;
  let stageA: string;
  let stageB: string;
  let noStage: string;
  let departmentId: string;
  let jobTitleId: string;
  const employees: string[] = [];
  const users: string[] = [];
  const roles: string[] = [];
  const templates: string[] = [];
  const extraStages: string[] = [];

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = admin;
    }
  }

  const employee = async (over: Record<string, unknown> = {}) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Nadia'),
          nameAr: unique('نادية'),
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2021-09-01',
          stageId: stageA,
          departmentId,
          jobTitleId,
          workSystem: 'PART_TIME_3',
          basicSalary: 950_000,
          contractStart: `${YEAR}-06-01`,
          contractEnd: `${YEAR + 1}-05-31`,
          ...over,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };
  const contractsOf = async (employeeId: string) =>
    (await http(app).get(`/hr/employees/${employeeId}/contracts`).expect(200)).body.data as Contract[];
  const currentOf = async (employeeId: string) => (await contractsOf(employeeId))[0];

  const createTemplate = async (over: Record<string, unknown> = {}) => {
    const res = await http(app)
      .post('/hr/contract-templates')
      .send({ nameEn: unique('Template'), nameAr: unique('نموذج'), defaultForWorkSystem: null, bodyAr: withSalary(), bodyEn: null, ...over })
      .expect(201);
    const saved = res.body.data as SaveContractTemplateResponse;
    templates.push(saved.template.id);
    return saved.template;
  };
  const update = (template: ContractTemplate, over: Record<string, unknown>) =>
    http(app)
      .put(`/hr/contract-templates/${template.id}`)
      .send({
        nameEn: template.nameEn,
        nameAr: template.nameAr,
        defaultForWorkSystem: template.defaultForWorkSystem,
        bodyAr: template.bodyAr,
        bodyEn: template.bodyEn,
        baseVersion: template.version,
        ...over,
      });
  const preview = async (contractId: string, templateId: string, language = 'AR', expected = 200) =>
    (await http(app).get(`/hr/contracts/${contractId}/print?templateId=${templateId}&language=${language}`).expect(expected)).body;
  const print = (contractId: string, p: ContractPrintPreview, over: Record<string, unknown> = {}) =>
    http(app)
      .post(`/hr/contracts/${contractId}/copies`)
      .send({ templateId: p.template.id, templateVersion: p.template.version, language: p.language, valuesHash: p.valuesHash, output: 'PDF', ...over });
  const printOk = async (contractId: string, templateId: string, language = 'AR', over: Record<string, unknown> = {}) => {
    const p = (await preview(contractId, templateId, language)).data as ContractPrintPreview;
    return (await print(contractId, p, over).expect(201)).body.data as ContractCopy;
  };
  const entries = (action: string, entityId: string) =>
    db.auditEntry.findMany({ where: { seq: { gt: mark }, action, entityId }, select: { action: true, changes: true }, orderBy: { seq: 'asc' } });

  const newUser = async (label: string, roleKeys: string[], employeeId: string | null = null) => {
    const id = (
      await db.user.create({ data: { email: `${unique(label)}@example.test`.toLowerCase(), name: label, passwordHash: 'x', employeeId }, select: { id: true } })
    ).id;
    users.push(id);
    await giveRoles(db, id, roleKeys);
    return id;
  };
  const customRole = async (grants: Array<[string, 'all' | 'own_stage']>) => {
    const role = await db.role.create({
      data: {
        key: unique('templates_role'),
        nameEn: unique('Role'),
        nameAr: unique('دور'),
        permissions: { create: grants.map(([permissionKey, scope]) => ({ permissionKey, scope })) },
      },
      select: { id: true, key: true },
    });
    roles.push(role.id);
    return role.key;
  };
  /** A real session (files are opened with the session cookie, through the real auth). */
  const readerSession = async (roleKeys: string[], employeeId: string | null = null) => {
    const roleIds = (await db.role.findMany({ where: { key: { in: roleKeys } }, select: { id: true } })).map((r) => r.id);
    const email = `${unique('templates')}@school.test`.toLowerCase();
    const u = (await http(app).post('/users').send({ name: unique('Reader'), email, password: TEMPORARY, roleIds, employeeId }).expect(201)).body
      .data as UserAccount;
    users.push(u.id);
    const first = await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: TEMPORARY }).expect(200);
    await http(app).post('/account/password').set(ANONYMOUS_HEADER, '1').set('Cookie', sessionCookie(first)).send({ newPassword: OWN }).expect(204);
    return sessionCookie(await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: OWN }).expect(200));
  };
  const open = (cookie: string, url: string) => http(app).get(url).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie);

  beforeAll(async () => {
    const made = await createAppAsTestUser();
    app = made.app;
    user = made.user;
    admin = user.id;
    db = app.get(DatabaseService);
    jest.spyOn(app.get(ContractPrintService), 'today').mockReturnValue(TODAY);
    jest.spyOn(app.get(ContractsService), 'today').mockReturnValue(TODAY);
    mark = await historyMark(db);
    [stageA, stageB] = [
      (await db.stage.create({ data: { nameEn: unique('Stage A'), nameAr: unique('مرحلة أ') } })).id,
      (await db.stage.create({ data: { nameEn: unique('Stage B'), nameAr: unique('مرحلة ب') } })).id,
    ];
    // The school's "no stage" entry: the seed's when it ran first, else one made here (through the service).
    const spare = (await db.stage.create({ data: { nameEn: unique('No stage'), nameAr: unique('بلا مرحلة') } })).id;
    noStage = (await app.get(StagesService).ensureNoStage(spare)).id;
    extraStages.push(spare);
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await deleteEmployees(db, { where: { id: { in: employees } } });
    // Test cleanup only: templates are never deleted in the app.
    await db.contractCopy.deleteMany({ where: { templateId: { in: templates } } });
    await db.contractTemplateVersion.deleteMany({ where: { templateId: { in: templates } } });
    await db.contractTemplate.deleteMany({ where: { id: { in: templates } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: { in: [stageA, stageB, ...extraStages] } } });
    await app.close();
  });

  describe('timeline walk A — a template’s life', () => {
    it('create v1 → print → v2 with English → print in English → a new default, hide, show', async () => {
      // 1. Arabic text only, the default for its work system; v1; an entry.
      const tpl = await createTemplate({ defaultForWorkSystem: 'PART_TIME_3' });
      expect(tpl).toMatchObject({ version: 1, hasEnglish: false, defaultForWorkSystem: 'PART_TIME_3', hidden: false, usesSalary: true });
      expect(await entries('hr.contract_template.create', tpl.id)).toHaveLength(1);
      // 2. Copy #1 on the contract: v1, Arabic, PDF kept.
      const id = await employee();
      const c = await currentOf(id);
      const copy1 = await printOk(c.id, tpl.id);
      expect(copy1).toMatchObject({ templateVersion: 1, language: 'AR', containsSalary: true, textEdited: false, output: 'PDF' });
      const firstPdf = await db.contractCopy.findUniqueOrThrow({ where: { id: copy1.id }, select: { fileUrl: true } });
      // 3. Clause changed + English added → v2; the entry reads version 1 → 2, languages AR → AR+EN.
      const v2 = (await update(tpl, { bodyAr: withSalary('Changed hours'), bodyEn: withoutSalary('Hours') }).expect(200)).body.data
        .template as ContractTemplate;
      expect(v2).toMatchObject({ version: 2, hasEnglish: true });
      const [updated] = await entries('hr.contract_template.update', tpl.id);
      expect(updated.changes).toEqual(
        expect.arrayContaining([
          { field: 'version', before: 1, after: 2 },
          { field: 'languages', before: 'AR', after: 'AR+EN' },
        ]),
      );
      // Copy #1 still says v1 and keeps its file.
      const listed = (await http(app).get(`/hr/contracts/${c.id}/copies`).expect(200)).body.data as ContractCopy[];
      expect(listed.find((x) => x.id === copy1.id)).toMatchObject({ templateVersion: 1, fileUrl: firstPdf.fileUrl });
      // 4. Copy #2 in English, v2; two copies, newest first.
      const copy2 = await printOk(c.id, tpl.id, 'EN');
      expect(copy2).toMatchObject({ templateVersion: 2, language: 'EN' });
      expect((await http(app).get(`/hr/contracts/${c.id}/copies`).expect(200)).body.data.map((x: ContractCopy) => x.id)).toEqual([copy2.id, copy1.id]);
      // 5. A new template takes the default; the first is hidden: out of the picker, copies kept.
      const tpl2 = await createTemplate({ defaultForWorkSystem: 'PART_TIME_3' });
      const took = (await http(app).get(`/hr/contract-templates/${tpl.id}`).expect(200)).body.data as ContractTemplate;
      expect(took.defaultForWorkSystem).toBeNull();
      expect(tpl2.defaultForWorkSystem).toBe('PART_TIME_3');
      await http(app).post(`/hr/contract-templates/${tpl.id}/hide`).expect(200);
      const picker = (await http(app).get(`/hr/contracts/${c.id}/print-templates?limit=100`).expect(200)).body.data as ContractPrintTemplateOption[];
      expect(picker.map((o) => o.id)).not.toContain(tpl.id);
      expect(picker.find((o) => o.id === tpl2.id)?.isDefault).toBe(true);
      expect((await http(app).get(`/hr/contracts/${c.id}/copies`).expect(200)).body.data).toHaveLength(2);
      // 6. Shown again: in the picker, not a default.
      const shown = (await http(app).post(`/hr/contract-templates/${tpl.id}/show`).expect(200)).body.data as ContractTemplate;
      expect(shown).toMatchObject({ hidden: false, defaultForWorkSystem: null });
      expect(await entries('hr.contract_template.hide', tpl.id)).toHaveLength(1);
      expect(await entries('hr.contract_template.show', tpl.id)).toHaveLength(1);
    });
  });

  describe('timeline walk B — printed, renewed, printed again', () => {
    it('the upcoming contract prints with its own dates; each contract keeps its copies', async () => {
      const tpl = await createTemplate({ bodyAr: doc([t('From '), f('contract.start'), t(' to '), f('contract.end')]) });
      const id = await employee();
      const c = await currentOf(id);
      await printOk(c.id, tpl.id);
      await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      const [next, current] = await contractsOf(id);
      expect(next.phase).toBe('UPCOMING');
      // Printing isn't a decision: an upcoming contract prints (CONTRACT_NOT_STARTED doesn't apply).
      const p = (await preview(next.id, tpl.id)).data as ContractPrintPreview;
      expect(p.values['contract.start']).toBe(`1 يونيو ${YEAR + 1}`);
      expect(p.values['contract.end']).toBe(`31 مايو ${YEAR + 2}`);
      await print(next.id, p).expect(201);
      const history = await contractsOf(id);
      expect(history.find((x) => x.id === current.id)?.copies).toHaveLength(1);
      expect(history.find((x) => x.id === next.id)?.copies).toHaveLength(1);
    });
  });

  describe('timeline walk C — a source changes after printing', () => {
    it('the copy keeps 9,500; a raise prints anew; a raise between preview and Print → 409, no copy', async () => {
      const tpl = await createTemplate();
      const id = await employee();
      const c = await currentOf(id);
      const copy1 = await printOk(c.id, tpl.id);
      const kept = await db.contractCopy.findUniqueOrThrow({ where: { id: copy1.id }, select: { values: true } });
      expect((kept.values as Record<string, string>)['contract.salary']).toBe('9,500 جنيه');
      await http(app).patch(`/hr/employees/${id}`).send({ basicSalary: 1_000_000 }).expect(200);
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      expect(p.values['contract.salary']).toBe('10,000 جنيه');
      // Edge case 15 — someone edits the salary between the preview and Print.
      await http(app).patch(`/hr/employees/${id}`).send({ basicSalary: 1_050_000 }).expect(200);
      const before = await db.contractCopy.count({ where: { contractId: c.id } });
      const res = await print(c.id, p).expect(409);
      expect(res.body.error).toBe(ErrorCode.VALUES_CHANGED);
      expect(await db.contractCopy.count({ where: { contractId: c.id } })).toBe(before);
      const again = await db.contractCopy.findUniqueOrThrow({ where: { id: copy1.id }, select: { values: true } });
      expect((again.values as Record<string, string>)['contract.salary']).toBe('9,500 جنيه');
    });

    it('edge case 15 — the template saved between preview and Print → 409 TEMPLATE_CHANGED, no copy', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee());
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      await update(tpl, { bodyAr: withSalary('Saved meanwhile') }).expect(200);
      const res = await print(c.id, p).expect(409);
      expect(res.body.error).toBe(ErrorCode.TEMPLATE_CHANGED);
      expect(await db.contractCopy.count({ where: { contractId: c.id } })).toBe(0);
    });
  });

  describe('timeline walk D — reopening an old copy', () => {
    it('Open serves the kept PDF byte for byte, records copy_open, makes no copy; a viewer without salary sees no Open', async () => {
      const tpl = await createTemplate();
      const plain = await createTemplate({ bodyAr: withoutSalary() });
      const id = await employee();
      const c = await currentOf(id);
      const copy = await printOk(c.id, tpl.id);
      const plainCopy = await printOk(c.id, plain.id);
      const hr = await readerSession(['hr_manager']);
      const first = await open(hr, copy.fileUrl!).expect(200);
      const second = await open(hr, copy.fileUrl!).expect(200);
      expect(first.headers['content-type']).toContain('application/pdf');
      expect(Buffer.compare(first.body as Buffer, second.body as Buffer)).toBe(0);
      expect(await db.contractCopy.count({ where: { contractId: c.id } })).toBe(2);
      expect(await entries('hr.contract.copy_open', c.id)).toHaveLength(2);
      // Sara — the principal: views contracts, no salary.
      const sara = await readerSession(['principal']);
      await open(sara, copy.fileUrl!).expect(404);
      await open(sara, plainCopy.fileUrl!).expect(200);
      const principal = await newUser('Principal', ['principal']);
      const listed = await as(principal, async () => (await http(app).get(`/hr/contracts/${c.id}/copies`).expect(200)).body.data as ContractCopy[]);
      expect(listed.find((x) => x.id === copy.id)).toMatchObject({ containsSalary: true, fileUrl: null });
      expect(listed.find((x) => x.id === plainCopy.id)?.fileUrl).toBe(plainCopy.fileUrl);
    });
  });

  describe('edge cases', () => {
    it('edge case 1 — printing your own contract → OWN_CONTRACT, a System admin too', async () => {
      const tpl = await createTemplate();
      const self = await employee();
      const c = await currentOf(self);
      const manager = await newUser('HR manager own', ['hr_manager'], self);
      const res = await as(manager, () => http(app).get(`/hr/contracts/${c.id}/print?templateId=${tpl.id}&language=AR`).expect(403));
      expect(res.body.error).toBe(ErrorCode.OWN_CONTRACT);
      // A System admin too, on their own (another employee: one account per employee).
      const adminSelf = await employee();
      const own = await currentOf(adminSelf);
      const sysAdmin = await newUser('Admin own', ['system_admin'], adminSelf);
      const res2 = await as(sysAdmin, () =>
        http(app).post(`/hr/contracts/${own.id}/copies`).send({ templateId: tpl.id, templateVersion: 1, language: 'AR', valuesHash: '0'.repeat(64), output: 'PDF' }).expect(403),
      );
      expect(res2.body.error).toBe(ErrorCode.OWN_CONTRACT);
    });

    it('edge case 2 — only hr.contracts.view → 403 on printing; the copies still list', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee());
      const officer = await newUser('Officer', ['hr_officer']);
      await as(officer, async () => {
        await http(app).get(`/hr/contracts/${c.id}/print?templateId=${tpl.id}&language=AR`).expect(403);
        await http(app).get(`/hr/contracts/${c.id}/print-templates`).expect(403);
        await http(app).get(`/hr/contracts/${c.id}/copies`).expect(200);
      });
    });

    it('edge case 3 — manage, but view only for one’s stage: another stage’s employee is not found (404)', async () => {
      const tpl = await createTemplate();
      const head = await employee({ stageId: stageA });
      const other = await currentOf(await employee({ stageId: stageB }));
      const role = await customRole([
        ['hr.contracts.view', 'own_stage'],
        ['hr.contracts.manage', 'all'],
        ['hr.employees.view_salary', 'all'],
      ]);
      const u = await newUser('Stage manager', [role], head);
      await as(u, () => http(app).get(`/hr/contracts/${other.id}/print?templateId=${tpl.id}&language=AR`).expect(404));
    });

    it('edge case 4 — a salary template without salary access → SALARY_NOT_VISIBLE, greyed in the picker; adding a salary field in Edit text → refused', async () => {
      const tpl = await createTemplate();
      const plain = await createTemplate({ bodyAr: withoutSalary() });
      const linked = await employee();
      const c = await currentOf(await employee());
      const role = await customRole([
        ['hr.contracts.view', 'all'],
        ['hr.contracts.manage', 'all'],
      ]);
      const u = await newUser('No salary', [role], linked);
      await as(u, async () => {
        const picker = (await http(app).get(`/hr/contracts/${c.id}/print-templates?limit=100`).expect(200)).body.data as ContractPrintTemplateOption[];
        expect(picker.find((o) => o.id === tpl.id)).toMatchObject({ usesSalary: true, salaryBlocked: true });
        expect(picker.find((o) => o.id === plain.id)).toMatchObject({ usesSalary: false, salaryBlocked: false });
        const res = await http(app).get(`/hr/contracts/${c.id}/print?templateId=${tpl.id}&language=AR`).expect(403);
        expect(res.body.error).toBe(ErrorCode.SALARY_NOT_VISIBLE);
        const p = (await preview(c.id, plain.id)).data as ContractPrintPreview;
        expect(p.values['contract.salary']).toBeNull();
        const edited = await print(c.id, p, { bodyEdited: withSalary() }).expect(403);
        expect(edited.body.error).toBe(ErrorCode.SALARY_NOT_VISIBLE);
      });
    });

    it('edge case 5 — a template without salary, printer without salary access → prints, contains_salary false', async () => {
      const plain = await createTemplate({ bodyAr: withoutSalary() });
      const linked = await employee();
      const c = await currentOf(await employee());
      const role = await customRole([
        ['hr.contracts.view', 'all'],
        ['hr.contracts.manage', 'all'],
      ]);
      const u = await newUser('No salary printer', [role], linked);
      const copy = await as(u, () => printOk(c.id, plain.id));
      expect(copy.containsSalary).toBe(false);
    });

    it('edge cases 6, 7, 19, 20 — empty fields print dotted, phrases are left out, school address and signatory empty, "no stage" empty', async () => {
      const tpl = await createTemplate({
        bodyAr: doc(
          [t('ID '), f('employee.nationalId')],
          [t('Works'), { type: 'optional', content: [t(' in '), f('employee.stage'), t(' / '), f('employee.department')] } as InlineNode],
          [f('school.name'), { type: 'optional', content: [t(', '), f('school.address')] } as InlineNode, t(' by '), f('school.representative')],
        ),
      });
      await http(app).patch('/settings/school').send({ addressAr: '', signatoryNameAr: '', signatoryTitleAr: '' }).expect(200);
      const c = await currentOf(await employee({ stageId: noStage }));
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      expect(p.values['employee.stage']).toBeNull();
      expect(p.emptyFields).toEqual(expect.arrayContaining(['employee.nationalId', 'school.representative']));
      expect(p.phrasesLeftOut).toEqual([['employee.stage'], ['school.address']]);
      // Printing isn't blocked.
      await print(c.id, p).expect(201);
    });

    it('edge case 8 — saving an optional phrase with no field → OPTIONAL_PHRASE_NEEDS_FIELD', async () => {
      const res = await http(app)
        .post('/hr/contract-templates')
        .send({ nameEn: unique('Bad'), nameAr: unique('سيئ'), defaultForWorkSystem: null, bodyAr: doc([{ type: 'optional', content: [t('x')] } as InlineNode]), bodyEn: null })
        .expect(400);
      expect(res.body.error).toBe(ErrorCode.OPTIONAL_PHRASE_NEEDS_FIELD);
    });

    it('edge case 9 — an English copy from a template with no English text → NO_ENGLISH_TEXT', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee());
      const picker = (await http(app).get(`/hr/contracts/${c.id}/print-templates?limit=100`).expect(200)).body.data as ContractPrintTemplateOption[];
      expect(picker.find((o) => o.id === tpl.id)?.hasEnglish).toBe(false);
      expect((await preview(c.id, tpl.id, 'EN', 409)).error).toBe(ErrorCode.NO_ENGLISH_TEXT);
    });

    it('edge case 10 — a hidden template can’t be made the default; hiding the default drops the mark', async () => {
      const tpl = await createTemplate({ defaultForWorkSystem: 'PART_TIME_2' });
      const hidden = (await http(app).post(`/hr/contract-templates/${tpl.id}/hide`).expect(200)).body.data as ContractTemplate;
      expect(hidden.defaultForWorkSystem).toBeNull();
      const res = await update(hidden, { defaultForWorkSystem: 'PART_TIME_2' }).expect(409);
      expect(res.body.error).toBe(ErrorCode.TEMPLATE_HIDDEN);
      const c = await currentOf(await employee());
      expect((await preview(c.id, tpl.id, 'AR', 409)).error).toBe(ErrorCode.TEMPLATE_HIDDEN);
    });

    it('edge case 11 — two templates claiming one work system’s default at once → one wins, the other TEMPLATE_DEFAULT_TAKEN', async () => {
      const a = await createTemplate();
      const b = await createTemplate();
      // Neither holds it yet; whoever had it loses it to one of them.
      await db.contractTemplate.updateMany({ where: { defaultForWorkSystem: 'PART_TIME_4', id: { in: templates } }, data: { defaultForWorkSystem: null } });
      const results = await Promise.all([update(a, { defaultForWorkSystem: 'PART_TIME_4' }), update(b, { defaultForWorkSystem: 'PART_TIME_4' })]);
      const statuses = results.map((r) => r.status).sort();
      if (statuses[0] === 200 && statuses[1] === 200) {
        // Serialised by the database: the second took it from the first, as a normal save does.
        expect(await db.contractTemplate.count({ where: { defaultForWorkSystem: 'PART_TIME_4', hiddenAt: null } })).toBe(1);
      } else {
        expect(statuses).toEqual([200, 409]);
        expect(results.find((r) => r.status === 409)!.body.error).toBe(ErrorCode.TEMPLATE_DEFAULT_TAKEN);
      }
      expect(await db.contractTemplate.count({ where: { defaultForWorkSystem: 'PART_TIME_4', hiddenAt: null } })).toBe(1);
    });

    it('edge case 12 — two people saving the same template → the second gets TEMPLATE_CHANGED', async () => {
      const tpl = await createTemplate();
      const [r1, r2] = await Promise.all([update(tpl, { bodyAr: withSalary('First') }), update(tpl, { bodyAr: withSalary('Second') })]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      expect([r1, r2].find((r) => r.status === 409)!.body.error).toBe(ErrorCode.TEMPLATE_CHANGED);
      expect(((await http(app).get(`/hr/contract-templates/${tpl.id}`).expect(200)).body.data as ContractTemplate).version).toBe(2);
    });

    it('edge case 13 — a cancelled contract → CONTRACT_CANCELLED; an ended one prints with "values are today’s"', async () => {
      const tpl = await createTemplate();
      const id = await employee({ contractStart: `${YEAR}-07-01`, contractEnd: `${YEAR + 1}-06-30` });
      const upcoming = await currentOf(id);
      await http(app).post(`/hr/contracts/${upcoming.id}/cancel`).send({ reason: 'Never started' }).expect(200);
      expect((await preview(upcoming.id, tpl.id, 'AR', 409)).error).toBe(ErrorCode.CONTRACT_CANCELLED);
      const ended = await currentOf(await employee({ contractStart: `${YEAR - 1}-06-01`, contractEnd: `${YEAR}-05-31` }));
      const p = (await preview(ended.id, tpl.id)).data as ContractPrintPreview;
      expect(p.contract.endedOn).toBe(`${YEAR}-05-31`);
    });

    it('edge case 14 — the employee is inactive → printing allowed', async () => {
      const tpl = await createTemplate();
      const id = await employee();
      const c = await currentOf(id);
      await http(app).post(`/hr/employees/${id}/deactivate`).send({}).expect(200);
      await printOk(c.id, tpl.id);
    });

    it('edge case 16 — the PDF render fails → 503 PDF_RENDER_FAILED, no copy, no entry, no file', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee());
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      const spy = jest.spyOn(app.get(PdfRenderer), 'render').mockRejectedValueOnce(new CodedException(503, ErrorCode.PDF_RENDER_FAILED));
      const res = await print(c.id, p).expect(503);
      spy.mockRestore();
      expect(res.body.error).toBe(ErrorCode.PDF_RENDER_FAILED);
      expect(await db.contractCopy.count({ where: { contractId: c.id } })).toBe(0);
      expect(await entries('hr.contract.copy_print', c.id)).toHaveLength(0);
    });

    it('edge case 17 — many prints at once: all made, at most two renders at a time', async () => {
      const tpl = await createTemplate({ bodyAr: withoutSalary() });
      const c = await currentOf(await employee());
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      const results = await Promise.all(Array.from({ length: 4 }, () => print(c.id, p)));
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(await db.contractCopy.count({ where: { contractId: c.id } })).toBe(4);
    });

    it('edge case 21 — salary with piastres prints 9,500.50 and its words', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee({ basicSalary: 950_050 }));
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      expect(p.values['contract.salary']).toBe('9,500.50 جنيه');
      expect(p.values['contract.salaryWords']).toBe('تسعة آلاف وخمسمائة جنيه مصري وخمسون قرشًا لا غير');
    });

    it('edge case 22 — a pasted node outside the schema (an image) is refused by the API', async () => {
      const res = await http(app)
        .post('/hr/contract-templates')
        .send({ nameEn: unique('Img'), nameAr: unique('صورة'), defaultForWorkSystem: null, bodyAr: { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }, bodyEn: null })
        .expect(400);
      expect(res.body.error).toBe(ErrorCode.CONTRACT_DOCUMENT_INVALID);
    });

    it('edge case 23 — a template over 200 KB → TEMPLATE_TOO_LONG', async () => {
      const res = await http(app)
        .post('/hr/contract-templates')
        .send({ nameEn: unique('Long'), nameAr: unique('طويل'), defaultForWorkSystem: null, bodyAr: doc([t('x'.repeat(210 * 1024))]), bodyEn: null })
        .expect(400);
      expect(res.body.error).toBe(ErrorCode.TEMPLATE_TOO_LONG);
    });

    it('edge case 24 — opening a copy without the right → 404, never 403; signed out → 401', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee({ stageId: stageB }));
      const copy = await printOk(c.id, tpl.id);
      const accountant = await readerSession(['accountant']);
      await open(accountant, copy.fileUrl!).expect(404);
      await open(accountant, '/files/contract-copies/00000000-0000-0000-0000-000000000000.pdf').expect(404);
      await http(app).get(copy.fileUrl!).set(ANONYMOUS_HEADER, '1').expect(401);
    });

    it('edge case 25 — the stored name is random; the download name is code, year and template', async () => {
      const tpl = await createTemplate({ nameEn: unique('Full-time <contract>') });
      const id = await employee();
      const code = ((await http(app).get(`/hr/employees/${id}`).expect(200)).body.data as { code: string }).code;
      const copy = await printOk((await currentOf(id)).id, tpl.id);
      expect(copy.fileUrl).toMatch(/^\/files\/contract-copies\/[0-9a-f-]{36}\.pdf$/);
      expect(copy.downloadName).toMatch(new RegExp(`^${code}-${YEAR}-${(YEAR + 1) % 100}-full-time-contract-[a-z0-9-]+\\.pdf$`));
    });

    it('edge case 26 — the seed’s sample text (Latin codes, a table) prints on two A4 pages; a manual page break adds one', async () => {
      const sample = await createTemplate({ bodyAr: sampleContractDocument() });
      const c = await currentOf(await employee());
      const sampleCopy = await printOk(c.id, sample.id);
      expect(sampleCopy.pageCount).toBe(2);
      const short = await createTemplate({ bodyAr: withoutSalary() });
      const one = await printOk(c.id, short.id);
      expect(one.pageCount).toBe(1);
      const broken = withoutSalary();
      broken.content.splice(1, 0, { type: 'pageBreak' });
      const two = await printOk(c.id, short.id, 'AR', { bodyEdited: broken });
      expect(two.textEdited).toBe(true);
      expect(two.pageCount).toBe(2);
    });
  });

  describe('templates, versions and the audit log', () => {
    it('lists server-paged and searched; versions are kept; a rename is not a version', async () => {
      const name = unique('Searchable');
      const tpl = await createTemplate({ nameEn: name });
      const found = (await http(app).get(`/hr/contract-templates?search=${encodeURIComponent(name)}`).expect(200)).body;
      expect((found.data as ContractTemplateSummary[]).map((x) => x.id)).toEqual([tpl.id]);
      expect(found.meta).toMatchObject({ total: 1, page: 1 });
      const renamed = (await update(tpl, { nameEn: unique('Renamed') }).expect(200)).body.data.template as ContractTemplate;
      expect(renamed.version).toBe(1);
      const v2 = (await update(renamed, { bodyAr: withSalary('v2') }).expect(200)).body.data.template as ContractTemplate;
      const versions = (await http(app).get(`/hr/contract-templates/${tpl.id}/versions`).expect(200)).body.data;
      expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
      const v1 = (await http(app).get(`/hr/contract-templates/${tpl.id}/versions/1`).expect(200)).body.data;
      expect(v1.bodyAr).toEqual(withSalary());
      expect(v2.version).toBe(2);
    });

    it('a duplicate name in either language → TEMPLATE_NAME_TAKEN', async () => {
      const tpl = await createTemplate();
      const res = await http(app)
        .post('/hr/contract-templates')
        .send({ nameEn: tpl.nameEn.toUpperCase(), nameAr: unique('آخر'), defaultForWorkSystem: null, bodyAr: withSalary(), bodyEn: null })
        .expect(409);
      expect(res.body.error).toBe(ErrorCode.TEMPLATE_NAME_TAKEN);
    });

    it('only hr.contract_templates.manage manages templates; "Preview with an employee" hides the salary without salary access', async () => {
      const officer = await newUser('Officer templates', ['hr_officer']);
      await as(officer, () => http(app).get('/hr/contract-templates').expect(403));
      const id = await employee();
      const full = (await http(app).get(`/hr/contract-templates/preview?employeeId=${id}&language=EN`).expect(200)).body.data;
      expect(full.values['contract.salary']).toBe('EGP 9,500');
      expect(full.hidden).toEqual([]);
      const role = await customRole([
        ['hr.contract_templates.manage', 'all'],
        ['hr.contracts.view', 'all'],
      ]);
      const u = await newUser('Templates only', [role]);
      const limited = await as(u, async () => (await http(app).get(`/hr/contract-templates/preview?employeeId=${id}&language=AR`).expect(200)).body.data);
      expect(limited.values['contract.salary']).toBeNull();
      expect(limited.hidden).toEqual(expect.arrayContaining(['contract.salary', 'contract.salaryWords', 'contract.salaryWordsAr']));
    });

    it('the copy_print entry keeps template, version, language, edited and output — no amounts', async () => {
      const tpl = await createTemplate();
      const c = await currentOf(await employee());
      await printOk(c.id, tpl.id);
      const [entry] = await entries('hr.contract.copy_print', c.id);
      const fields = (entry.changes as Array<{ field: string }>).map((x) => x.field).sort();
      expect(fields).toEqual(['language', 'output', 'template', 'templateVersion', 'textEdited']);
      expect(JSON.stringify(entry.changes)).not.toContain('9,500');
      // The answer carries the PDF itself: printing is one copy_print, never also a copy_open.
      expect(await entries('hr.contract.copy_open', c.id)).toHaveLength(0);
    });

    it('the POST answer carries the PDF; the work-system default leads the picker’s first page; copies page past the newest five', async () => {
      const def = await createTemplate({ nameEn: unique('Zzz last by name'), defaultForWorkSystem: 'PART_TIME_3', bodyAr: withoutSalary() });
      await createTemplate({ nameEn: unique('Aaa first by name') });
      const c = await currentOf(await employee());
      const page1 = (await http(app).get(`/hr/contracts/${c.id}/print-templates?limit=1`).expect(200)).body;
      expect(page1.data.map((o: ContractPrintTemplateOption) => o.id)).toEqual([def.id]);
      const page2 = (await http(app).get(`/hr/contracts/${c.id}/print-templates?limit=1&page=2`).expect(200)).body;
      expect(page2.data.map((o: ContractPrintTemplateOption) => o.id)).not.toContain(def.id);
      const p = (await preview(c.id, def.id)).data as ContractPrintPreview;
      const made = (await print(c.id, p).expect(201)).body.data as ContractCopy & { pdfBase64: string };
      expect(Buffer.from(made.pdfBase64, 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');
      for (let i = 0; i < 6; i += 1) await print(c.id, p).expect(201);
      const row = (await contractsOf(c.employee.id)).find((x) => x.id === c.id);
      expect(row?.copies).toHaveLength(5);
      expect(row?.copiesTotal).toBe(7);
      const second = (await http(app).get(`/hr/contracts/${c.id}/copies?page=2&limit=5`).expect(200)).body;
      expect(second.data).toHaveLength(2);
      expect(second.meta).toMatchObject({ total: 7 });
    });

    it('school address and signatory are school settings, recorded with core.settings.update', async () => {
      const res = await http(app).patch('/settings/school').send({ addressAr: '5 شارع المعرفة', signatoryNameAr: 'أ. هشام', signatoryTitleAr: 'المدير' }).expect(200);
      expect(res.body.data).toMatchObject({ addressAr: '5 شارع المعرفة', signatoryNameAr: 'أ. هشام' });
      const tpl = await createTemplate({ bodyAr: doc([f('school.address'), t(' — '), f('school.representative')]) });
      const c = await currentOf(await employee());
      const p = (await preview(c.id, tpl.id)).data as ContractPrintPreview;
      expect(p.values['school.representative']).toBe('أ. هشام، المدير');
      await http(app).patch('/settings/school').send({ addressAr: '', signatoryNameAr: '', signatoryTitleAr: '' }).expect(200);
    });
  });
});
