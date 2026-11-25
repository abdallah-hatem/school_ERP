/*
 * Contract template fields (spec docs/specs/2026-11-24-contract-templates.md → Fields). A field is a
 * chip in a template's text (`{ type: 'field', attrs: { key } }`), never typed text: a template can
 * only name a field listed here. Values are filled by the API when a copy is previewed or printed,
 * in the copy's language (`contractFieldValues`).
 */

/** The Fields panel's four groups, in order. */
export const CONTRACT_FIELD_GROUPS = ['employee', 'contract', 'school', 'general'] as const;
export type ContractFieldGroup = (typeof CONTRACT_FIELD_GROUPS)[number];

export interface ContractFieldDefinition {
  group: ContractFieldGroup;
  /** Whether the field holds a salary-type value (§2: only for whoever may see that salary). */
  salary: boolean;
  /** The Fields panel's sample, per document language (generic demo values, not a real person). */
  sample: { ar: string | null; en: string | null };
}

const f = (group: ContractFieldGroup, sample: ContractFieldDefinition['sample'], salary = false): ContractFieldDefinition => ({
  group,
  salary,
  sample,
});

/**
 * The 19 fields (the mockup's 18 plus "Basic salary in Arabic words"), in the panel's order. Their
 * EN / AR names are `contractTemplates.fields.<key>` in `locales/<lang>/contracts.json`.
 */
export const CONTRACT_FIELDS = {
  'employee.nameAr': f('employee', { ar: 'نادية فؤاد رمضان', en: 'نادية فؤاد رمضان' }),
  'employee.nameEn': f('employee', { ar: 'Nadia Fouad Ramadan', en: 'Nadia Fouad Ramadan' }),
  'employee.code': f('employee', { ar: 'EMP-0006', en: 'EMP-0006' }),
  'employee.nationalId': f('employee', { ar: '28803150104527', en: '28803150104527' }),
  'employee.address': f('employee', { ar: '14 شارع النصر، المعادي، القاهرة', en: '14 El Nasr St, Maadi, Cairo' }),
  'employee.jobTitle': f('employee', { ar: 'محاسبة', en: 'Accountant' }),
  'employee.department': f('employee', { ar: 'الشؤون المالية', en: 'Finance' }),
  'employee.stage': f('employee', { ar: null, en: null }),
  'employee.hireDate': f('employee', { ar: '1 سبتمبر 2021', en: '1 September 2021' }),
  'contract.start': f('contract', { ar: '1 يونيو 2026', en: '1 June 2026' }),
  'contract.end': f('contract', { ar: '31 مايو 2027', en: '31 May 2027' }),
  'contract.salary': f('contract', { ar: '9,500 جنيه', en: 'EGP 9,500' }, true),
  'contract.salaryWords': f(
    'contract',
    { ar: 'تسعة آلاف وخمسمائة جنيه مصري لا غير', en: 'Nine thousand five hundred Egyptian pounds only' },
    true,
  ),
  'contract.salaryWordsAr': f(
    'contract',
    { ar: 'تسعة آلاف وخمسمائة جنيه مصري لا غير', en: 'تسعة آلاف وخمسمائة جنيه مصري لا غير' },
    true,
  ),
  'contract.workSystem': f('contract', { ar: 'دوام كامل', en: 'Full-time' }),
  'school.name': f('school', { ar: 'مدرسة تجريبية', en: 'Sample School' }),
  'school.address': f('school', { ar: '5 شارع المعرفة، مدينة نصر، القاهرة', en: '5 El Maarefa St, Nasr City, Cairo' }),
  'school.representative': f('school', { ar: 'أ. هشام كامل، مدير المدرسة', en: 'Mr Hisham Kamel, Principal' }),
  today: f('general', { ar: '24 نوفمبر 2026', en: '24 November 2026' }),
} as const satisfies Record<string, ContractFieldDefinition>;

export type ContractFieldKey = keyof typeof CONTRACT_FIELDS;
export const CONTRACT_FIELD_KEYS = Object.keys(CONTRACT_FIELDS) as ContractFieldKey[];

export function isContractFieldKey(value: unknown): value is ContractFieldKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONTRACT_FIELDS, value);
}

/** The salary-type fields (§2, spec → Printing → Salary). */
export const CONTRACT_SALARY_FIELDS: readonly ContractFieldKey[] = CONTRACT_FIELD_KEYS.filter(
  (key) => CONTRACT_FIELDS[key].salary,
);

export function isContractSalaryField(key: ContractFieldKey): boolean {
  return CONTRACT_FIELDS[key].salary;
}

/** The language a copy is printed in (its text and its values). */
export const ContractLanguage = { AR: 'AR', EN: 'EN' } as const;
export type ContractLanguage = (typeof ContractLanguage)[keyof typeof ContractLanguage];
export const CONTRACT_LANGUAGES = Object.values(ContractLanguage) as ContractLanguage[];

/** One filled value as printed: the text, or null when its source is empty. */
export type ContractFieldValue = string | null;
export type ContractFieldValues = Record<ContractFieldKey, ContractFieldValue>;
