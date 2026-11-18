/** Generic demo lists (§3). Keys are seed-only handles the employee rows refer to. */

export interface SeedListItem {
  key: string;
  nameEn: string;
  nameAr: string;
  /** Job titles only: holders can be chosen as a direct manager (§3). */
  managesPeople?: boolean;
}

/** The stage the seed marks as the "no stage" entry (`Stage.isNoStage`); never matched by name. */
export const NO_STAGE_KEY = 'none';

/** §3 DECIDED: the four stages, "None" for staff not tied to a stage. */
export const STAGES = [
  { key: 'kg', nameEn: 'Kindergarten', nameAr: 'رياض الأطفال' },
  { key: 'primary', nameEn: 'Primary', nameAr: 'المرحلة الابتدائية' },
  { key: 'prep', nameEn: 'Preparatory', nameAr: 'المرحلة الإعدادية' },
  { key: NO_STAGE_KEY, nameEn: 'None', nameAr: 'بدون مرحلة' },
] as const satisfies readonly SeedListItem[];

export const DEPARTMENTS = [
  { key: 'admin', nameEn: 'Administration', nameAr: 'الإدارة' },
  { key: 'hr', nameEn: 'Human Resources', nameAr: 'الموارد البشرية' },
  { key: 'finance', nameEn: 'Finance', nameAr: 'الشؤون المالية' },
  { key: 'arabic', nameEn: 'Arabic Language', nameAr: 'اللغة العربية' },
  { key: 'english', nameEn: 'English Language', nameAr: 'اللغة الإنجليزية' },
  { key: 'math', nameEn: 'Mathematics', nameAr: 'الرياضيات' },
  { key: 'science', nameEn: 'Science', nameAr: 'العلوم' },
  { key: 'religion', nameEn: 'Religious Studies', nameAr: 'التربية الدينية' },
  { key: 'students', nameEn: 'Student Affairs', nameAr: 'شؤون الطلاب' },
  { key: 'services', nameEn: 'Maintenance and Services', nameAr: 'الصيانة والخدمات' },
] as const satisfies readonly SeedListItem[];

/** The leading titles manage people (§3 direct managers): principal, vice principals, heads of
 * department and senior teachers (who lead their subject's teachers). */
export const JOB_TITLES = [
  { key: 'principal', nameEn: 'Principal', nameAr: 'مدير المدرسة', managesPeople: true },
  { key: 'vice', nameEn: 'Vice Principal', nameAr: 'وكيل المدرسة', managesPeople: true },
  { key: 'head', nameEn: 'Head of Department', nameAr: 'رئيس القسم', managesPeople: true },
  { key: 'senior', nameEn: 'Senior Teacher', nameAr: 'معلم أول', managesPeople: true },
  { key: 'teacher', nameEn: 'Teacher', nameAr: 'معلم' },
  { key: 'assistant', nameEn: 'Assistant Teacher', nameAr: 'معلم مساعد' },
  { key: 'kgTeacher', nameEn: 'Kindergarten Teacher', nameAr: 'معلمة رياض أطفال' },
  { key: 'social', nameEn: 'Social Worker', nameAr: 'أخصائي اجتماعي' },
  { key: 'psych', nameEn: 'Psychologist', nameAr: 'أخصائي نفسي' },
  { key: 'accountant', nameEn: 'Accountant', nameAr: 'محاسب' },
  { key: 'hrSpecialist', nameEn: 'HR Specialist', nameAr: 'أخصائي موارد بشرية' },
  { key: 'secretary', nameEn: 'Secretary', nameAr: 'سكرتير' },
  { key: 'it', nameEn: 'IT Technician', nameAr: 'فني حاسب آلي' },
  { key: 'nurse', nameEn: 'Nurse', nameAr: 'ممرضة' },
  { key: 'security', nameEn: 'Security Guard', nameAr: 'فرد أمن' },
] as const satisfies readonly SeedListItem[];

export type StageKey = (typeof STAGES)[number]['key'];
export type DepartmentKey = (typeof DEPARTMENTS)[number]['key'];
export type JobTitleKey = (typeof JOB_TITLES)[number]['key'];
