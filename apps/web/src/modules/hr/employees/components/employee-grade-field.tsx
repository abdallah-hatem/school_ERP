'use client';

import type { NamedRef } from '@school-erp/shared';
import { useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { SelectField } from '@/shared/components/form/fields';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_EMPLOYEE_GRADES } from '../apis';
import { NO_GRADE, type EmployeeFormValues } from '../lib/employee-form';
import { useListItemOptions } from '../lib/list-item-options';

/**
 * The employee's grade (§3, owner 2026-11-24): optional, picked from the school's Grades list
 * (Settings), which the API searches as the person types. "No grade" heads the list until they
 * search, so a grade can be cleared again. The employee's own grade stays the choice even after it
 * was hidden (`currentHidden`, with the same note as the other lists); a new choice must be shown.
 */
export function EmployeeGradeField({
  control,
  selected,
  currentHidden = false,
}: {
  control: Control<EmployeeFormValues>;
  selected?: NamedRef | null;
  currentHidden?: boolean;
}) {
  const { t, locale } = useTranslation();
  const grades = useListItemOptions(GET_EMPLOYEE_GRADES, locale, { selected });
  const [query, setQuery] = useState('');
  const employeeGradeId = useWatch({ control, name: 'employeeGradeId' });
  const none = { value: NO_GRADE, label: t('employees.noGrade') };
  const server = {
    ...grades,
    options: query.trim() ? grades.options : [none, ...grades.options],
    onQueryChange: (next: string) => {
      setQuery(next);
      grades.onQueryChange(next);
    },
    selected: employeeGradeId === NO_GRADE ? none : grades.selected,
  };
  return (
    <SelectField
      server={server}
      control={control}
      name="employeeGradeId"
      label={t('employees.fields.grade')}
      placeholder={t('employees.placeholders.grade')}
      emptyText={t('employees.noGrades')}
      hint={currentHidden && selected && employeeGradeId === selected.id ? t('employees.hints.hiddenItem') : undefined}
    />
  );
}
