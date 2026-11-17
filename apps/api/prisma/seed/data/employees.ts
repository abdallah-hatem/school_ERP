import type { Gender, WorkSystem } from '@school-erp/shared';
import type { DepartmentKey, JobTitleKey, StageKey } from './lists';

/** Fake demo staff (realistic Egyptian names). Nothing here is a real person. */
export interface SeedEmployee {
  /** 1-based seed number; drives the generated national ID, phone, dates and fingerprint. */
  n: number;
  nameEn: string;
  nameAr: string;
  gender: Gender;
  stage: StageKey;
  department: DepartmentKey;
  jobTitle: JobTitleKey;
  workSystem: WorkSystem;
  /** Monthly, EGP (stored × 100 as piastres). */
  salaryEgp: number;
  /** Seed number of the direct manager — always listed earlier. */
  manager?: number;
  inactive?: boolean;
}

type Row = [
  nameEn: string,
  nameAr: string,
  gender: 'M' | 'F',
  stage: StageKey,
  department: DepartmentKey,
  jobTitle: JobTitleKey,
  workSystem: 'FT' | 'PT4' | 'PT3' | 'PT2',
  salaryEgp: number,
  manager?: number,
  inactive?: true,
];

const WORK: Record<Row[6], WorkSystem> = {
  FT: 'FULL_TIME',
  PT4: 'PART_TIME_4',
  PT3: 'PART_TIME_3',
  PT2: 'PART_TIME_2',
};

// prettier-ignore
const ROWS: Row[] = [
  ['Ahmed Mahmoud Abdelrahman', 'أحمد محمود عبد الرحمن', 'M', 'none', 'admin', 'principal', 'FT', 20000],
  ['Mona Ibrahim El-Sayed', 'منى إبراهيم السيد', 'F', 'kg', 'admin', 'vice', 'FT', 16500, 1],
  ['Khaled Mostafa Hassan', 'خالد مصطفى حسن', 'M', 'primary', 'admin', 'vice', 'FT', 17000, 1],
  ['Hoda Abdelaziz Fathy', 'هدى عبد العزيز فتحي', 'F', 'prep', 'admin', 'vice', 'FT', 17000, 1],
  ['Tarek Samir Youssef', 'طارق سمير يوسف', 'M', 'none', 'hr', 'hrSpecialist', 'FT', 9500, 1],
  ['Nadia Fouad Ramadan', 'نادية فؤاد رمضان', 'F', 'none', 'finance', 'accountant', 'FT', 10500, 1],
  ['Mohamed Ali Abdallah', 'محمد علي عبد الله', 'M', 'primary', 'arabic', 'head', 'FT', 14000, 3],
  ['Sara Hesham Kamal', 'سارة هشام كمال', 'F', 'primary', 'english', 'head', 'FT', 14500, 3],
  ['Amr Adel Shawky', 'عمرو عادل شوقي', 'M', 'prep', 'math', 'head', 'FT', 14000, 4],
  ['Rania Magdy Soliman', 'رانيا مجدي سليمان', 'F', 'prep', 'science', 'head', 'FT', 13500, 4],
  ['Mahmoud Gamal Eid', 'محمود جمال عيد', 'M', 'prep', 'religion', 'senior', 'FT', 12000, 4],
  ['Yasmin Ashraf Naguib', 'ياسمين أشرف نجيب', 'F', 'kg', 'english', 'kgTeacher', 'FT', 8000, 2],
  ['Heba Sherif Mansour', 'هبة شريف منصور', 'F', 'kg', 'arabic', 'kgTeacher', 'FT', 7800, 2],
  ['Omar Hany Zaki', 'عمر هاني زكي', 'M', 'primary', 'math', 'teacher', 'FT', 9000, 3],
  ['Dina Wael Farouk', 'دينا وائل فاروق', 'F', 'primary', 'arabic', 'teacher', 'FT', 8800, 7],
  ['Mostafa Reda Salem', 'مصطفى رضا سالم', 'M', 'primary', 'english', 'teacher', 'FT', 9200, 8],
  ['Aya Tamer Shaaban', 'آية تامر شعبان', 'F', 'primary', 'english', 'assistant', 'PT4', 6000, 8],
  ['Islam Nabil Hamdy', 'إسلام نبيل حمدي', 'M', 'primary', 'science', 'teacher', 'FT', 8700],
  ['Marwa Essam Abdelhamid', 'مروة عصام عبد الحميد', 'F', 'primary', 'religion', 'teacher', 'PT3', 5500],
  ['Karim Ayman Lotfy', 'كريم أيمن لطفي', 'M', 'prep', 'math', 'teacher', 'FT', 9500, 9],
  ['Nourhan Khaled Badr', 'نورهان خالد بدر', 'F', 'prep', 'science', 'teacher', 'FT', 9300, 10],
  ['Hassan Mohamed Attia', 'حسن محمد عطية', 'M', 'prep', 'arabic', 'senior', 'FT', 11500],
  ['Salma Ahmed Ezzat', 'سلمى أحمد عزت', 'F', 'prep', 'english', 'teacher', 'PT2', 5000],
  ['Youssef Ibrahim Shehata', 'يوسف إبراهيم شحاتة', 'M', 'prep', 'religion', 'teacher', 'FT', 8900, 11],
  ['Fatma Saeed Morsy', 'فاطمة سعيد مرسي', 'F', 'kg', 'admin', 'secretary', 'FT', 6500, 2],
  ['Ehab Fawzy Ghoneim', 'إيهاب فوزي غنيم', 'M', 'none', 'services', 'security', 'FT', 5200],
  ['Samah Adel Hegazy', 'سماح عادل حجازي', 'F', 'none', 'students', 'social', 'FT', 7500],
  ['Walid Hamed Saber', 'وليد حامد صابر', 'M', 'none', 'students', 'psych', 'PT3', 6800],
  ['Reham Tarek Mahrous', 'ريهام طارق محروس', 'F', 'none', 'services', 'nurse', 'FT', 6200],
  ['Sherif Osama Habib', 'شريف أسامة حبيب', 'M', 'none', 'admin', 'it', 'FT', 8200],
  ['Nesma Medhat Ali', 'نسمة مدحت علي', 'F', 'none', 'finance', 'accountant', 'PT4', 7000, 6],
  ['Ashraf Kamal Darwish', 'أشرف كمال درويش', 'M', 'none', 'services', 'security', 'FT', 5000],
  ['Eman Yasser Abdelmoneim', 'إيمان ياسر عبد المنعم', 'F', 'primary', 'math', 'assistant', 'FT', 6500],
  ['Bassem Atef Rizk', 'باسم عاطف رزق', 'M', 'prep', 'science', 'assistant', 'FT', 6800, 10],
  ['Ghada Mohsen El-Naggar', 'غادة محسن النجار', 'F', 'kg', 'arabic', 'kgTeacher', 'PT2', 5000, 2],
  ['Ali Hussein Abdelfattah', 'علي حسين عبد الفتاح', 'M', 'primary', 'religion', 'senior', 'FT', 11000],
  ['Mai Ahmed Shalaby', 'مي أحمد شلبي', 'F', 'primary', 'science', 'teacher', 'FT', 8600],
  ['Hatem Sayed Gaber', 'حاتم سيد جابر', 'M', 'prep', 'english', 'teacher', 'FT', 9100],
  ['Laila Mostafa Hafez', 'ليلى مصطفى حافظ', 'F', 'primary', 'arabic', 'teacher', 'FT', 8400, undefined, true],
  ['Ramy Ezz Eldin Fahmy', 'رامي عز الدين فهمي', 'M', 'prep', 'math', 'teacher', 'FT', 8800, undefined, true],
];

export const EMPLOYEES: SeedEmployee[] = ROWS.map(
  ([nameEn, nameAr, g, stage, department, jobTitle, ws, salaryEgp, manager, inactive], i) => ({
    n: i + 1,
    nameEn,
    nameAr,
    gender: g === 'M' ? 'MALE' : 'FEMALE',
    stage,
    department,
    jobTitle,
    workSystem: WORK[ws],
    salaryEgp,
    ...(manager ? { manager } : {}),
    ...(inactive ? { inactive } : {}),
  }),
);

const pad = (v: number, len: number) => String(v).padStart(len, '0');

/** Deterministic personal fields from the seed number, so re-runs match the same rows. */
export function generatedFields(e: SeedEmployee) {
  const birthYear = 1972 + ((e.n * 5) % 26); // 1972–1997
  const birthMonth = ((e.n * 7) % 12) + 1;
  const birthDay = ((e.n * 11) % 27) + 1;
  const hireYear = Math.min(2025, Math.max(birthYear + 23, 2008 + ((e.n * 3) % 17)));
  const hireMonth = ((e.n * 5) % 12) + 1;
  const hireDay = ((e.n * 13) % 27) + 1;
  // Egyptian national ID shape: century digit, yymmdd, governorate, serial, gender digit (odd = male).
  const genderDigit = e.gender === 'MALE' ? 1 : 2;
  const nationalId = `2${pad(birthYear % 100, 2)}${pad(birthMonth, 2)}${pad(birthDay, 2)}01${pad(
    e.n,
    4,
  )}${genderDigit}`;
  return {
    nationalId,
    dateOfBirth: `${birthYear}-${pad(birthMonth, 2)}-${pad(birthDay, 2)}`,
    hireDate: `${hireYear}-${pad(hireMonth, 2)}-${pad(hireDay, 2)}`,
    phone: `010${pad(20_000_000 + e.n * 137_911, 8)}`,
    fingerprintId: `FP-${pad(1000 + e.n, 4)}`,
    basicSalary: e.salaryEgp * 100,
  };
}
