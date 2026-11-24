'use client';

import { FormActionBar } from '@/shared/components/form/form-action-bar';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEGREES,
  GENDERS,
  INSURANCE_STATUSES,
  InsuranceStatus,
  oneYearContractEnd,
  WORK_SYSTEMS,
  type Employee,
  type EmployeeSummary,
  type Gender,
} from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useCan } from '@/core/auth';
import { Form } from '@/shared/components/form/form';
import {
  DateField,
  MoneyField,
  PhoneField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from '@/shared/components/form/fields';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ErrorIcon } from '@/shared/components/ui/icons';
import { callApi } from '@/lib/callApi';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { PICKER_PAGE, useServerOptions } from '@/shared/hooks/use-server-options';
import { CREATE_EMPLOYEE, GET_DEPARTMENTS, GET_JOB_TITLES, GET_MANAGER_OPTIONS, GET_STAGES, UPDATE_EMPLOYEE } from '../apis';
import { useListItemOptions } from '../lib/list-item-options';
import {
  CLEARED_INSURANCE,
  emptyEmployeeForm,
  employeeFormSchemaFor,
  employeeToForm,
  fieldForError,
  formToRequest,
  formToUpdate,
  graduationYears,
  managerChoice,
  NO_MANAGER,
  todayIso,
  type EmployeeFormValues,
} from '../lib/employee-form';
import { EmployeePhotoField, uploadEmployeePhoto } from './employee-photo-field';
import { OtherStagesField } from './other-stages-field';

export interface EmployeeFormProps {
  /** `/ar/employees`. */
  basePath: string;
  /** The employee being edited; omit to add a new one. */
  employee?: Employee;
  /**
   * The employee's own stage / department / job title has since been hidden (§3: they keep it on
   * edit; a new choice must be visible). The pickers' choices are searched by the API.
   */
  currentHidden?: { stage?: boolean; department?: boolean; jobTitle?: boolean };
  /** Whether any active employee manages people (the manager picker's "none yet" note). */
  hasManagerCandidates?: boolean;
  /** Replaces the page header: the form's skeleton draws one without the employee's name. */
  header?: ReactNode;
  /** The edit page's skeleton (no employee yet): the form in its edit shape. */
  editing?: boolean;
}

/** Add or edit an employee (§3). Server rule errors land on their field. */
export function EmployeeForm({
  basePath,
  employee,
  currentHidden = {},
  hasManagerCandidates = true,
  header,
  editing = false,
}: EmployeeFormProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const isEdit = Boolean(employee) || editing;
  const initial = useMemo(() => (employee ? employeeToForm(employee, locale) : emptyEmployeeForm()), [employee, locale]);
  // Salary-type fields (R7): editing, only when the API sent them; adding, with the salary key.
  const canSeeSalary = useCan()('hr.employees.view_salary');
  const salary = employee ? employee.salaryVisible : canSeeSalary;
  const schema = useMemo(() => employeeFormSchemaFor({ salary }), [salary]);
  const form = useForm<EmployeeFormValues>({ resolver: zodResolver(schema), defaultValues: initial });
  // Editing: Save stays disabled until something differs from the saved employee (back to the
  // original value counts as unchanged). Adding: always enabled — submitting shows what's missing.
  const { isDirty } = form.formState;
  const nothingToSave = Boolean(employee) && !isDirty;
  const { control, setError, setValue, getFieldState, clearErrors } = form;
  // Adding: a chosen photo is uploaded right after the employee is saved.
  const pendingPhoto = useRef<File | null>(null);

  // One request at a time, and the button stays busy through the navigation after a save.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // §3: a start given without an end gets a one-year contract — until the end is set by hand.
  const contractStart = useWatch({ control, name: 'contractStart' });
  const previousStart = useRef(contractStart);
  useEffect(() => {
    if (isEdit || contractStart === previousStart.current) return;
    previousStart.current = contractStart;
    if (contractStart && !getFieldState('contractEnd').isDirty) {
      setValue('contractEnd', oneYearContractEnd(contractStart), { shouldValidate: getFieldState('contractEnd').isTouched });
    }
  }, [isEdit, contractStart, getFieldState, setValue]);

  // §3: "Not insured" hides the three insurance details and clears them.
  const insuranceStatus = useWatch({ control, name: 'insuranceStatus' });
  const insured = insuranceStatus === InsuranceStatus.INSURED;
  const previousInsurance = useRef(insuranceStatus);
  useEffect(() => {
    if (insuranceStatus === previousInsurance.current) return;
    previousInsurance.current = insuranceStatus;
    if (insuranceStatus === InsuranceStatus.INSURED) return;
    for (const [name, value] of Object.entries(CLEARED_INSURANCE)) {
      setValue(name as keyof typeof CLEARED_INSURANCE, value, { shouldDirty: true });
    }
    clearErrors(Object.keys(CLEARED_INSURANCE) as (keyof typeof CLEARED_INSURANCE)[]);
  }, [insuranceStatus, setValue, clearErrors]);

  // The choices are visible items only, searched by the API; the employee's own (even hidden) item
  // stays the choice until changed.
  const stage = useListItemOptions(GET_STAGES, locale, { selected: employee?.stage });
  const otherStages = useListItemOptions(GET_STAGES, locale);
  const department = useListItemOptions(GET_DEPARTMENTS, locale, { selected: employee?.department });
  const jobTitle = useListItemOptions(GET_JOB_TITLES, locale, { selected: employee?.jobTitle });
  const hiddenHint = t('employees.hints.hiddenItem');
  // §3: a manager who no longer manages people is kept — noted while they are still the choice.
  const managerId = useWatch({ control, name: 'managerId' });
  const noManager = { value: NO_MANAGER, label: t('employees.noManager') };
  const [managerQuery, setManagerQuery] = useState('');
  const managerSearch = useServerOptions<EmployeeSummary>({
    load: (search) => GET_MANAGER_OPTIONS(employee?.id, { search, limit: PICKER_PAGE }),
    toOption: (e) => managerChoice(e, locale),
    selected: employee?.manager ? managerChoice(employee.manager, locale) : null,
  });
  const managers = {
    server: {
      ...managerSearch,
      // "No direct manager" heads the list, until the person searches for someone.
      options: managerQuery.trim() ? managerSearch.options : [noManager, ...managerSearch.options],
      onQueryChange: (query: string) => {
        setManagerQuery(query);
        managerSearch.onQueryChange(query);
      },
      selected: managerId === NO_MANAGER ? noManager : managerSearch.selected,
    },
    currentNotManaging: employee?.manager?.managesPeople === false,
    hasCandidates: hasManagerCandidates,
  };
  const gender = useWatch({ control, name: 'gender' });
  const hireDate = useWatch({ control, name: 'hireDate' });
  const managerHint =
    managers.currentNotManaging && managerId === employee?.manager?.id
      ? t('employees.hints.managerNotManaging')
      : managers.hasCandidates
        ? undefined
        : t('employees.hints.noManagers');
  // Date of birth and hire date can't be in the future (§3).
  const today = todayIso();
  const years = useMemo(() => graduationYears(today).map((y) => ({ value: String(y), label: String(y) })), [today]);

  async function onSubmit(values: EmployeeFormValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    let saved = false;
    try {
      // The toast names them in the screen's language (the API's message is generic English).
      const name = localName(values, locale);
      const res = employee
        ? await callApi(UPDATE_EMPLOYEE(employee.id, formToUpdate(values, initial)), {
            showErrorToast: false,
            showSuccessToast: true,
            successMessage: t('employees.edit.done', { name }),
          })
        : await callApi(CREATE_EMPLOYEE(formToRequest(values)), {
            showErrorToast: false,
            showSuccessToast: true,
            successMessage: t('employees.create.done', { name }),
          });
      if (res.unauthorized) return;
      if (res.success) {
        saved = true;
        const id = res.data?.id ?? employee?.id;
        let target = id ? `${basePath}/${id}` : basePath;
        if (!employee && id && pendingPhoto.current) {
          // The employee is saved either way; a failed photo (its error toast shows) is retried
          // from their edit page.
          const photo = await uploadEmployeePhoto(id, pendingPhoto.current);
          if (!photo.success && !photo.unauthorized) target = `${basePath}/${id}/edit`;
        }
        router.push(target);
        router.refresh();
        return;
      }
      const field = fieldForError(res.error);
      if (field) {
        const key = `errors.${String(res.error)}`;
        setError(field, { message: has(key) ? key : res.message }, { shouldFocus: true });
      } else {
        setFormError(res.message || t('employees.errors.saveFailed'));
      }
    } finally {
      if (!saved) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  const cancelHref = employee ? `${basePath}/${employee.id}` : basePath;
  const title = employee ? t('employees.edit.title') : t('employees.create.title');

  return (
    <div className="flex flex-col gap-6">
      {header ?? (
      <PageHeader
        title={title}
        description={employee ? `${localName(employee, locale)} · ${employee.code}` : t('employees.create.description')}
        breadcrumbs={[
          { label: t('employees.title'), href: basePath },
          ...(employee ? [{ label: localName(employee, locale), href: `${basePath}/${employee.id}` }] : []),
          { label: title },
        ]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
      />
      )}
      <Form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} aria-label={title}>
        <Section title={t('employees.sections.photo')}>
          <EmployeePhotoField employee={employee} gender={(gender || null) as Gender | null} onPendingChange={(file) => (pendingPhoto.current = file)} />
        </Section>

        <Section title={t('employees.sections.personal')}>
          <TextField control={control} name="nameEn" label={t('employees.fields.nameEn')} placeholder={t('employees.placeholders.nameEn')} required dir="ltr" maxLength={200} />
          <TextField control={control} name="nameAr" label={t('employees.fields.nameAr')} placeholder={t('employees.placeholders.nameAr')} required dir="rtl" maxLength={200} />
          <TextField
            control={control}
            name="nationalId"
            label={t('employees.fields.nationalId')}
            placeholder={t('employees.placeholders.nationalId')}
            hint={t('employees.hints.nationalId')}
            inputMode="numeric"
            dir="ltr"
          />
          <SelectField
            control={control}
            name="gender"
            label={t('employees.fields.gender')}
            placeholder={t('employees.placeholders.gender')}
            options={GENDERS.map((g) => ({ value: g, label: t(`common.enums.gender.${g}`) }))}
            required
          />
          <DateField control={control} name="dateOfBirth" label={t('employees.fields.dateOfBirth')} max={today} required />
          <PhoneField control={control} name="phone" label={t('employees.fields.phone')} placeholder={t('employees.placeholders.phone')} hint={t('employees.hints.phone')} required />
          <TextField control={control} name="email" type="email" inputMode="email" autoComplete="off" dir="ltr" label={t('employees.fields.email')} placeholder={t('employees.placeholders.email')} />
          <TextareaField control={control} name="address" rows={3} maxLength={500} label={t('employees.fields.address')} placeholder={t('employees.placeholders.address')} className="sm:col-span-2" />
        </Section>

        <Section title={t('employees.sections.job')}>
          <DateField control={control} name="hireDate" label={t('employees.fields.hireDate')} max={today} required />
          {/* §3 (N0): left empty on a new employee, the API fills it from the hire date + the school's length. */}
          <DateField
            control={control}
            name="probationEnd"
            label={t('employees.fields.probationEnd')}
            hint={t('employees.hints.probationEnd')}
            min={hireDate ?? undefined}
            clearable
          />
          <SelectField
            control={control}
            name="workSystem"
            label={t('employees.fields.workSystem')}
            placeholder={t('employees.placeholders.workSystem')}
            options={WORK_SYSTEMS.map((w) => ({ value: w, label: t(`common.enums.workSystem.${w}`) }))}
            required
          />
          <SelectField server={stage} control={control} name="stageId" label={t('employees.fields.stage')} placeholder={t('employees.placeholders.stage')} emptyText={t('employees.noStages')} hint={currentHidden.stage ? hiddenHint : undefined} required />
          <OtherStagesField control={control} server={otherStages} />
          <SelectField server={department} control={control} name="departmentId" label={t('employees.fields.department')} placeholder={t('employees.placeholders.department')} emptyText={t('employees.noDepartments')} hint={currentHidden.department ? hiddenHint : undefined} required />
          <SelectField server={jobTitle} control={control} name="jobTitleId" label={t('employees.fields.jobTitle')} placeholder={t('employees.placeholders.jobTitle')} emptyText={t('employees.noJobTitles')} hint={currentHidden.jobTitle ? hiddenHint : undefined} required />
          <SelectField server={managers.server} control={control} name="managerId" label={t('employees.fields.manager')} placeholder={t('employees.placeholders.manager')} hint={managerHint} />
          <TextField control={control} name="grade" label={t('employees.fields.grade')} placeholder={t('employees.placeholders.grade')} maxLength={50} />
          <TextField control={control} name="fingerprintId" label={t('employees.fields.fingerprintId')} placeholder={t('employees.placeholders.fingerprintId')} dir="ltr" maxLength={50} />
        </Section>

        <Section title={t('employees.sections.contract')}>
          {salary ? (
            <>
              <MoneyField control={control} name="basicSalary" label={t('employees.fields.basicSalary')} placeholder={t('employees.placeholders.basicSalary')} hint={t('employees.hints.basicSalary')} required />
              <div aria-hidden="true" className="hidden sm:block" />
            </>
          ) : null}
          {/* The first contract's dates, on create only: afterwards they change only through Contracts (renew, end). */}
          {isEdit ? null : (
            <>
              <DateField control={control} name="contractStart" label={t('employees.fields.contractStart')} hint={t('employees.hints.contract')} required />
              <DateField control={control} name="contractEnd" label={t('employees.fields.contractEnd')} required />
            </>
          )}
          <SwitchField control={control} name="usesBus" label={t('employees.fields.usesBus')} hint={t('employees.hints.usesBus')} className="sm:col-span-2" />
        </Section>

        <Section title={t('employees.sections.insurance')}>
          <SelectField
            control={control}
            name="insuranceStatus"
            label={t('employees.fields.insuranceStatus')}
            placeholder={t('employees.placeholders.insuranceStatus')}
            options={INSURANCE_STATUSES.map((s) => ({ value: s, label: t(`common.enums.insuranceStatus.${s}`) }))}
            hint={t('employees.hints.insuranceStatus')}
            required
          />
          {insured ? (
            <>
              <TextField
                control={control}
                name="insuranceNumber"
                label={t('employees.fields.insuranceNumber')}
                placeholder={t('employees.placeholders.insuranceNumber')}
                hint={t('employees.hints.insuranceNumber')}
                inputMode="numeric"
                dir="ltr"
                maxLength={20}
                required
              />
              <DateField control={control} name="insuranceRegistrationDate" label={t('employees.fields.insuranceRegistrationDate')} max={today} required />
              {salary ? (
                <MoneyField control={control} name="insuredSalary" label={t('employees.fields.insuredSalary')} placeholder={t('employees.placeholders.insuredSalary')} hint={t('employees.hints.insuredSalary')} required />
              ) : null}
            </>
          ) : null}
        </Section>

        {salary ? (
        <Section title={t('employees.sections.bank')}>
          <TextField control={control} name="bankName" label={t('employees.fields.bankName')} placeholder={t('employees.placeholders.bankName')} maxLength={100} />
          <TextField control={control} name="bankAccountNumber" label={t('employees.fields.bankAccountNumber')} placeholder={t('employees.placeholders.bankAccountNumber')} inputMode="numeric" dir="ltr" maxLength={50} />
          <TextField
            control={control}
            name="iban"
            label={t('employees.fields.iban')}
            placeholder={t('employees.placeholders.iban')}
            hint={t('employees.hints.iban')}
            dir="ltr"
            autoComplete="off"
            maxLength={40}
            className="sm:col-span-2"
          />
        </Section>
        ) : null}

        <Section title={t('employees.sections.emergency')}>
          <TextField control={control} name="emergencyContactName" label={t('employees.fields.emergencyContactName')} placeholder={t('employees.placeholders.emergencyContactName')} maxLength={200} />
          <TextField control={control} name="emergencyContactRelationship" label={t('employees.fields.emergencyContactRelationship')} placeholder={t('employees.placeholders.emergencyContactRelationship')} maxLength={100} />
          <PhoneField control={control} name="emergencyContactPhone" label={t('employees.fields.emergencyContactPhone')} placeholder={t('employees.placeholders.emergencyContactPhone')} hint={t('employees.hints.phone')} />
        </Section>

        <Section title={t('employees.sections.qualification')}>
          <SelectField
            control={control}
            name="highestDegree"
            label={t('employees.fields.highestDegree')}
            placeholder={t('employees.placeholders.highestDegree')}
            options={DEGREES.map((d) => ({ value: d, label: t(`common.enums.degree.${d}`) }))}
          />
          <SelectField
            searchable
            control={control}
            name="graduationYear"
            label={t('employees.fields.graduationYear')}
            placeholder={t('employees.placeholders.graduationYear')}
            options={years}
          />
          <TextField control={control} name="major" label={t('employees.fields.major')} placeholder={t('employees.placeholders.major')} maxLength={200} />
          <TextField control={control} name="university" label={t('employees.fields.university')} placeholder={t('employees.placeholders.university')} maxLength={200} />
        </Section>

        {formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive-ink">
            <ErrorIcon className="mt-0.5 size-5 shrink-0" />
            {formError}
          </p>
        ) : null}

        <FormActionBar
          status={
            isEdit ? (
              <p role="status" className="text-muted-foreground">
                {isDirty ? t('employees.edit.unsaved') : t('employees.edit.noChanges')}
              </p>
            ) : undefined
          }
        >
          <Button asChild variant="secondary" aria-disabled={busy || undefined}>
            <Link href={cancelHref}>{t('common.actions.cancel')}</Link>
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={nothingToSave}>
            {employee ? t('employees.edit.submit') : t('employees.create.submit')}
          </Button>
        </FormActionBar>
      </Form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-skeleton-block="form-section" className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-card md:p-6">
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
