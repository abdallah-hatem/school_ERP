// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderWithI18n } from '@/test/render';
import { MoneyField, SelectField, TextField } from './fields';
import { Form } from './form';

const schema = z.object({
  name: z.string().trim().min(1, 'ui.form.required'),
  salary: z.number({ error: 'ui.form.required' }).int().positive(),
});
type Values = z.infer<typeof schema>;

function SalaryForm({ onSubmit }: { onSubmit: (v: Values) => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', salary: undefined as unknown as number },
  });
  return (
    <Form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
      <TextField control={form.control} name="name" label="Name" placeholder="Mona Khalil" required />
      <MoneyField control={form.control} name="salary" label="Basic salary" placeholder="14,000.00" required />
      <button type="submit">Save</button>
    </Form>
  );
}

describe('form fields', () => {
  afterEach(cleanup);

  it('money field holds integer piastres, shows grouped EGP on blur and rejects letters', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithI18n(<SalaryForm onSubmit={onSubmit} />);
    const salary = screen.getByRole('textbox', { name: /Basic salary/ });

    await user.type(salary, '14000.5x');
    expect((salary as HTMLInputElement).value).toBe('14000.5');
    await user.tab();
    expect((salary as HTMLInputElement).value).toBe('14,000.50');

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Mona');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Mona', salary: 1400050 });
  });

  it('shows translated inline errors and blocks submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithI18n(<SalaryForm onSubmit={onSubmit} />, { locale: 'ar' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findAllByText('هذا الحقل مطلوب.')).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: /Name/ }).getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

function GroupForm() {
  const form = useForm<{ group: string }>({ defaultValues: { group: '' } });
  return (
    <SelectField
      control={form.control}
      name="group"
      label="Group"
      options={[{ value: 'a', label: 'المجموعة الأولى' }]}
    />
  );
}

describe('select field direction', () => {
  afterEach(cleanup);

  it.each([
    ['ar', 'rtl'],
    ['en', 'ltr'],
  ] as const)('%s: the trigger and its list follow the page direction (%s), never a forced LTR', async (locale, dir) => {
    const user = userEvent.setup();
    renderWithI18n(<GroupForm />, { locale });
    const trigger = screen.getByRole('combobox', { name: /Group/ });
    expect(trigger.getAttribute('dir')).toBe(dir);
    await user.click(trigger);
    expect((await screen.findByRole('listbox')).closest('[dir]')?.getAttribute('dir')).toBe(dir);
  });
});
