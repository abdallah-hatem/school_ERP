import { EMPLOYEE_SALARY_FIELDS, isSalaryField } from '@school-erp/shared';
import type { EmployeeDetailRow } from '../repositories/employees.repository';
import { employeeAuditSnapshot } from './employee-audit.pure';

const ref = (id: string, nameEn: string, nameAr: string) => ({ id, nameEn, nameAr });

const row = {
  id: 'e1',
  code: 'EMP-0001',
  nameEn: 'Mona',
  nameAr: 'منى',
  dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
  stage: ref('s1', 'Primary', 'ابتدائي'),
  department: ref('d1', 'Science', 'علوم'),
  jobTitle: ref('j1', 'Teacher', 'معلم'),
  manager: {
    id: 'm1',
    code: 'EMP-0002',
    nameEn: 'Omar',
    nameAr: 'عمر',
    photoUrl: null,
    gender: 'MALE',
    jobTitle: { managesPeople: true },
  },
  basicSalary: 1_200_000,
  insuranceRegistrationDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as EmployeeDetailRow;

describe('employeeAuditSnapshot (T28)', () => {
  it('stores the stage, department, job title and manager by their two names under their id fields', () => {
    const snap = employeeAuditSnapshot(row);
    expect(snap).toMatchObject({
      stageId: { nameEn: 'Primary', nameAr: 'ابتدائي' },
      departmentId: { nameEn: 'Science', nameAr: 'علوم' },
      jobTitleId: { nameEn: 'Teacher', nameAr: 'معلم' },
      managerId: { nameEn: 'Omar', nameAr: 'عمر' },
    });
    expect(snap).not.toHaveProperty('department');
    expect(snap).not.toHaveProperty('manager');
  });

  it('no manager is null; dates are YYYY-MM-DD; money stays in piastres; bookkeeping is left out', () => {
    const snap = employeeAuditSnapshot({ ...row, manager: null });
    expect(snap.managerId).toBeNull();
    expect(snap.dateOfBirth).toBe('1990-01-01');
    expect(snap.insuranceRegistrationDate).toBeNull();
    expect(snap.basicSalary).toBe(1_200_000);
    expect(snap).not.toHaveProperty('id');
    expect(snap).not.toHaveProperty('createdAt');
    expect(snap).not.toHaveProperty('updatedAt');
  });

  it('every employee salary field is a salary-type audit field, so it is hidden from viewers without salaries (P4)', () => {
    for (const field of EMPLOYEE_SALARY_FIELDS) expect(isSalaryField(field)).toBe(true);
  });
});
