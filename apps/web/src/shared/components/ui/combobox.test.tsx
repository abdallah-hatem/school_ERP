// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchKey } from '@/shared/lib/search';
import { renderWithI18n } from '@/test/render';
import { Combobox, type ComboboxOption } from './combobox';

const OPTIONS: ComboboxOption[] = [
  {
    value: 'mona',
    label: 'Mona Khalil · EMP-0001',
    keywords: ['Mona Khalil', 'منى خليل', 'EMP-0001'],
  },
  {
    value: 'omar',
    label: 'Omar Fathy · EMP-0002',
    keywords: ['Omar Fathy', 'عمر فتحي', 'EMP-0002'],
  },
  {
    value: 'ahmed',
    label: 'Ahmed Saleh · EMP-0013',
    keywords: ['Ahmed Saleh', 'أحمد صالح', 'EMP-0013'],
  },
];

function Picker({
  onChange = vi.fn(),
  options = OPTIONS,
}: {
  onChange?: (v: string) => void;
  options?: ComboboxOption[];
}) {
  const [value, setValue] = useState('');
  return (
    <Combobox
      aria-label="Employee"
      options={options}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      placeholder="Choose an employee"
      searchPlaceholder="Type a name or code"
      emptyText="No employees yet."
      noMatchesText="No employee matches."
    />
  );
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('Combobox', () => {
  afterEach(cleanup);

  it('typing filters by the Arabic name (ignoring hamza variants) and by the code', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    const search = screen.getByRole('searchbox', {
      name: 'Type a name or code',
    });
    expect(document.activeElement).toBe(search);
    expect(optionNames()).toHaveLength(3);

    await user.type(search, 'احمد');
    expect(optionNames()).toEqual(['Ahmed Saleh · EMP-0013']);
    await user.clear(search);
    await user.type(search, '0002');
    expect(optionNames()).toEqual(['Omar Fathy · EMP-0002']);
    await user.clear(search);
    await user.type(search, 'mona KHA');
    expect(optionNames()).toEqual(['Mona Khalil · EMP-0001']);
  });

  it('keyboard: arrows move through the matches, Enter picks and closes, the trigger shows it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Picker onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Employee' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}');
    const search = screen.getByRole('searchbox');
    const active = search.getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)?.textContent).toBe('Ahmed Saleh · EMP-0013');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('ahmed');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toBe('Ahmed Saleh · EMP-0013');
  });

  it('a search that matches nothing says so, and Enter picks nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Picker onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    await user.type(screen.getByRole('searchbox'), 'zzz{Enter}');
    expect(screen.getByText('No employee matches.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('no options at all: the empty text, not "no matches"', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={[]} />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    expect(screen.getByText('No employees yet.')).toBeTruthy();
  });

  it('RTL: picks by click with the Arabic UI', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Picker onChange={onChange} />, { locale: 'ar' });
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    await user.type(screen.getByRole('searchbox'), 'عمر');
    await user.click(screen.getByRole('option', { name: 'Omar Fathy · EMP-0002' }));
    expect(onChange).toHaveBeenCalledWith('omar');
  });
});

describe('searchKey', () => {
  it('folds case, accents, Arabic marks and letter variants', () => {
    expect(searchKey('  Moná  KHALIL ')).toBe('mona khalil');
    expect(searchKey('أحمد')).toBe(searchKey('احمد'));
    expect(searchKey('مُنَى')).toBe(searchKey('مني'));
    expect(searchKey('فاطمة')).toBe(searchKey('فاطمه'));
  });
});
