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
    expect((salary as HTMLInputElement).value).toBe('14,000.5');
    await user.tab();
    expect((salary as HTMLInputElement).value).toBe('14,000.50');

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Mona');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Mona', salary: 1400050 });
  });

  describe('money field groups live while typing', () => {
    function salaryInput() {
      return screen.getByRole('textbox', { name: /Basic salary/ }) as HTMLInputElement;
    }

    it('typing 30000 shows 30,000 and blur completes it to 30,000.00', async () => {
      const user = userEvent.setup();
      renderWithI18n(<SalaryForm onSubmit={vi.fn()} />);
      const salary = salaryInput();
      await user.type(salary, '3');
      expect(salary.value).toBe('3');
      await user.type(salary, '000');
      expect(salary.value).toBe('3,000');
      await user.type(salary, '0');
      expect(salary.value).toBe('30,000');
      expect(salary.selectionStart).toBe(6);
      await user.tab();
      expect(salary.value).toBe('30,000.00');
    });

    it('a digit typed between 3 and 0 gives 350,000 with the caret right after the 5', async () => {
      const user = userEvent.setup();
      renderWithI18n(<SalaryForm onSubmit={vi.fn()} />);
      const salary = salaryInput();
      await user.type(salary, '30000');
      await user.type(salary, '5', { initialSelectionStart: 1, initialSelectionEnd: 1 });
      expect(salary.value).toBe('350,000');
      expect(salary.selectionStart).toBe(2);
      expect(salary.selectionEnd).toBe(2);
    });

    it('Backspace right after a comma deletes the digit before it and keeps the caret there', async () => {
      const user = userEvent.setup();
      renderWithI18n(<SalaryForm onSubmit={vi.fn()} />);
      const salary = salaryInput();
      await user.type(salary, '30000');
      // "30,|000" → the 0 before the comma goes: "3,000" with the caret after the 3.
      await user.type(salary, '{Backspace}', { initialSelectionStart: 3, initialSelectionEnd: 3 });
      expect(salary.value).toBe('3,000');
      expect(salary.selectionStart).toBe(1);
      // Removing a digit that drops a comma doesn't move the caret off its digit.
      await user.type(salary, '{Backspace}', { initialSelectionStart: 3, initialSelectionEnd: 3 });
      expect(salary.value).toBe('300');
      expect(salary.selectionStart).toBe(1);
    });

    it('pasting 1234567 groups it to 1,234,567', async () => {
      const user = userEvent.setup();
      renderWithI18n(<SalaryForm onSubmit={vi.fn()} />);
      const salary = salaryInput();
      await user.click(salary);
      await user.paste('1234567');
      expect(salary.value).toBe('1,234,567');
    });

    it('typing 12.5 keeps the dot while typing; a third decimal and a second dot are rejected', async () => {
      const user = userEvent.setup();
      renderWithI18n(<SalaryForm onSubmit={vi.fn()} />);
      const salary = salaryInput();
      await user.type(salary, '12.');
      expect(salary.value).toBe('12.');
      await user.type(salary, '5');
      expect(salary.value).toBe('12.5');
      await user.type(salary, '0.9');
      expect(salary.value).toBe('12.50');
      await user.tab();
      expect(salary.value).toBe('12.50');
    });

    it('letters are ignored and the caret stays where it was', async () => {
      const user = userEvent.setup();
      renderWithI18n(<SalaryForm onSubmit={vi.fn()} />);
      const salary = salaryInput();
      await user.type(salary, '1a2b3c4');
      expect(salary.value).toBe('1,234');
      await user.type(salary, 'x', { initialSelectionStart: 1, initialSelectionEnd: 1 });
      expect(salary.value).toBe('1,234');
      expect(salary.selectionStart).toBe(1);
    });

    it('submits the same integer piastres as before (30,000 → 3,000,000 piastres)', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderWithI18n(<SalaryForm onSubmit={onSubmit} />);
      await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Mona');
      await user.type(salaryInput(), '30000.25');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Mona', salary: 3000025 });
    });

    it('on the Arabic page it groups with Western digits, left to right, and accepts Arabic-Indic digits', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderWithI18n(<SalaryForm onSubmit={onSubmit} />, { locale: 'ar' });
      const salary = salaryInput();
      expect(salary.getAttribute('dir')).toBe('ltr');
      await user.type(salary, '30000');
      expect(salary.value).toBe('30,000');
      await user.clear(salary);
      await user.type(salary, '٤٥٠٠');
      expect(salary.value).toBe('4,500');
      await user.tab();
      expect(salary.value).toBe('4,500.00');
      await user.type(screen.getByRole('textbox', { name: /Name/ }), 'منى');
      await user.click(screen.getByRole('button', { name: /Save/ }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'منى', salary: 450000 });
    });
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
