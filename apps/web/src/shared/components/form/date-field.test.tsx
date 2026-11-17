// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toIsoDate } from '@/shared/lib/format';
import { renderWithI18n } from '@/test/render';
import { DateField } from './fields';
import { Form } from './form';

interface Values {
  born: string | null;
}

function BirthForm({ onSubmit, max }: { onSubmit: (v: Values) => void; max?: string }) {
  const form = useForm<Values>({ defaultValues: { born: null } });
  return (
    <Form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
      <DateField control={form.control} name="born" label="Date of birth" max={max} />
      <button type="submit">Save</button>
    </Form>
  );
}

const today = toIsoDate(new Date());
const thisYear = new Date().getFullYear();

describe('DateField month / year pickers', () => {
  afterEach(cleanup);

  it('picking a year decades back takes one selection', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithI18n(<BirthForm onSubmit={onSubmit} max={today} />);

    await user.click(screen.getByRole('button', { name: /Date of birth/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Year' }));
    await user.click(await screen.findByRole('option', { name: '1965' }));

    // The grid now shows the same month in 1965; pick a day.
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Year' }).textContent).toContain('1965'));
    await user.click(within(screen.getByRole('grid')).getByRole('button', { name: /\b15\b/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const picked = (onSubmit.mock.calls[0]?.[0] as Values).born;
    expect(picked).toMatch(/^1965-\d{2}-15$/);
  });

  it('with max = today, no later year is offered and future days are disabled (Arabic, RTL)', async () => {
    const user = userEvent.setup();
    renderWithI18n(<BirthForm onSubmit={vi.fn()} max={today} />, { locale: 'ar' });

    await user.click(screen.getByRole('button', { name: /Date of birth/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'السنة' }));
    const years = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(years[0]).toBe(String(thisYear));
    expect(years).not.toContain(String(thisYear + 1));
    expect(years).toContain('1940');
    await user.keyboard('{Escape}');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === new Date().getMonth()) {
      const day = within(screen.getByRole('grid'))
        .getAllByRole('button')
        .find((b) => b.textContent === String(tomorrow.getDate()));
      expect(day?.hasAttribute('disabled')).toBe(true);
    }
  });

  it('without bounds the years run from 1940 to two years ahead', async () => {
    const user = userEvent.setup();
    renderWithI18n(<BirthForm onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Date of birth/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('combobox', { name: 'Year' }));
    const years = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(years[0]).toBe(String(thisYear + 2));
    expect(years.at(-1)).toBe('1940');
  });
});
