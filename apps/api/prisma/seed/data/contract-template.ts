import type { BlockNode, ContractDocument, ContractFieldKey, CreateContractTemplateRequest, FieldNode, InlineNode, TextNode } from '@school-erp/shared';

/*
 * The generic sample contract template the committed seed brings (spec → Settings additions:
 * "One generic sample, 'Full-time contract', default for full-time"). Written for this project, like
 * the mockup's demo text — never a school's real wording, which goes in the git-ignored
 * `seed-data.local/contract-templates.json` (see `load.ts`).
 */

const t = (text: string): TextNode => ({ type: 'text', text });
const b = (text: string): TextNode => ({ type: 'text', text, marks: [{ type: 'bold' }] });
const f = (key: ContractFieldKey): FieldNode => ({ type: 'field', attrs: { key } });
const p = (...content: InlineNode[]): BlockNode => ({ type: 'paragraph', content });
const h = (level: 1 | 2 | 3, text: string, textAlign: 'center' | null = null): BlockNode => ({
  type: 'heading',
  attrs: { level, textAlign },
  content: [t(text)],
});

const ARTICLES: Array<[string, InlineNode[]]> = [
  [
    'البند الأول: موضوع العقد',
    [
      t('يعمل الطرف الثاني لدى الطرف الأول بوظيفة '),
      f('employee.jobTitle'),
      t(' في قسم '),
      f('employee.department'),
      { type: 'optional', content: [t('، بالمرحلة '), f('employee.stage')] },
      t('، ويلتزم بأداء ما يُكلَّف به من أعمال وفق اللوائح الداخلية للمدرسة، علمًا بأنه التحق بالعمل لديها اعتبارًا من '),
      f('employee.hireDate'),
      t('.'),
    ],
  ],
  [
    'البند الثاني: مدة العقد',
    [t('مدة هذا العقد سنة واحدة، تبدأ في '), f('contract.start'), t(' وتنتهي في '), f('contract.end'), t('، ولا يتجدد إلا باتفاق مكتوب بين الطرفين.')],
  ],
  [
    'البند الثالث: الأجر',
    [
      t('يتقاضى الطرف الثاني أجرًا أساسيًا شهريًا قدره '),
      f('contract.salary'),
      t(' ('),
      f('contract.salaryWords'),
      t(')، يُصرف في آخر كل شهر، ويُستقطع منه ما يقرره القانون من ضرائب وتأمينات اجتماعية.'),
    ],
  ],
  [
    'البند الرابع: ساعات العمل',
    [
      t('نظام العمل '),
      f('contract.workSystem'),
      t('، وتُحدَّد أيام العمل وساعاته وفق الجدول الذي تعلنه المدرسة في بداية كل عام دراسي، بما لا يتجاوز الحد الذي يقرره القانون، مع راحة أسبوعية مدفوعة الأجر.'),
    ],
  ],
  [
    'البند الخامس: فترة الاختبار',
    [t('يخضع الطرف الثاني لفترة اختبار مدتها ثلاثة أشهر من تاريخ بدء العقد، يجوز خلالها للطرف الأول إنهاء العقد إذا ثبت عدم صلاحيته للعمل.')],
  ],
  [
    'البند السادس: إنهاء العقد',
    [t('ينتهي هذا العقد بانتهاء مدته. ويجوز لأي من الطرفين إنهاؤه قبل ذلك لسبب مشروع، بشرط إخطار الطرف الآخر كتابةً قبل شهرين على الأقل من تاريخ الإنهاء.')],
  ],
  [
    'البند السابع: أحكام عامة',
    [t('يخضع هذا العقد لأحكام قانون العمل ولوائح المدرسة المعتمدة، وقد حُرر من نسختين بيد كل طرف نسخة للعمل بموجبها.')],
  ],
];

const cell = (...content: InlineNode[][]) => ({ type: 'tableCell' as const, content: content.map((c) => p(...c)) });

/** The sample's Arabic text: a generic fixed-term contract with every kind of field and one optional phrase. */
export function sampleContractDocument(): ContractDocument {
  return {
    type: 'doc',
    content: [
      h(1, 'عقد عمل محدد المدة', 'center'),
      p(t('إنه في يوم '), f('today'), t('، حُرر هذا العقد بين كلٍّ من:')),
      p(
        b('أولًا: '),
        f('school.name'),
        { type: 'optional', content: [t('، ومقرها '), f('school.address')] },
        { type: 'optional', content: [t('، ويمثلها في التوقيع على هذا العقد '), f('school.representative')] },
        t('، ويُشار إليها فيما بعد بـ«الطرف الأول».'),
      ),
      p(
        b('ثانيًا: '),
        t('السيد/السيدة '),
        f('employee.nameAr'),
        t(' (كود الموظف '),
        f('employee.code'),
        t(')، الرقم القومي '),
        f('employee.nationalId'),
        { type: 'optional', content: [t('، والمقيم/ة في '), f('employee.address')] },
        t('، ويُشار إليه/ا فيما بعد بـ«الطرف الثاني».'),
      ),
      p(t('وبعد أن أقرّ الطرفان بأهليتهما للتعاقد، اتفقا على ما يلي:')),
      ...ARTICLES.flatMap(([title, body]) => [h(3, title), p(...body)]),
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [p(t('الطرف الأول'))] },
              { type: 'tableHeader', content: [p(t('الطرف الثاني'))] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell([t('الاسم: '), f('school.representative')], [t('التوقيع:')]),
              cell([t('الاسم: '), f('employee.nameAr')], [t('التوقيع:')]),
            ],
          },
        ],
      },
    ],
  };
}

/** The committed seed's one template: Arabic text only, the default for full-time. */
export const SAMPLE_CONTRACT_TEMPLATE: CreateContractTemplateRequest = {
  nameEn: 'Full-time contract',
  nameAr: 'عقد عمل بدوام كامل',
  defaultForWorkSystem: 'FULL_TIME',
  bodyAr: sampleContractDocument(),
  bodyEn: null,
};
