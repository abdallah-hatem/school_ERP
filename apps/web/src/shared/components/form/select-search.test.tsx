// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { SelectField, type SelectOption, type SelectOptionGroup } from './fields';
import { FilterSelect } from './filter-controls';

/*
 * Pickers above 6 options get a search box by themselves (forms.md → "A picker with many options
 * gets a search"); `searchable` forces either way. One component — the shared Combobox.
 */

const opt = (value: string, label: string, keywords?: string[]): SelectOption => ({ value, label, keywords });
const SIX = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((l) => opt(l.toLowerCase(), l));
const EMPLOYEES: SelectOption[] = [
  opt('mona', 'Mona Khalil · EMP-0001', ['Mona Khalil', 'منى خليل', 'EMP-0001']),
  opt('omar', 'Omar Fathy · EMP-0002', ['Omar Fathy', 'عمر فتحي', 'EMP-0002']),
  opt('ahmed', 'Ahmed Saleh · EMP-0013', ['Ahmed Saleh', 'أحمد صالح', 'EMP-0013']),
  opt('sara', 'Sara Adel · EMP-0004', ['Sara Adel', 'سارة عادل', 'EMP-0004']),
  opt('hany', 'Hany Nabil · EMP-0005', ['Hany Nabil', 'هاني نبيل', 'EMP-0005']),
  opt('laila', 'Laila Samir · EMP-0006', ['Laila Samir', 'ليلى سمير', 'EMP-0006']),
  opt('youssef', 'Youssef Ali · EMP-0007', ['Youssef Ali', 'يوسف علي', 'EMP-0007']),
];

function Picker({
  options,
  groups,
  searchable,
  onChange = vi.fn(),
}: {
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  searchable?: boolean;
  onChange?: (v: string) => void;
}) {
  const form = useForm<{ pick: string }>({ defaultValues: { pick: '' } });
  const pick = useWatch({ control: form.control, name: 'pick' });
  useEffect(() => {
    if (pick) onChange(pick);
  }, [pick, onChange]);
  return (
    <SelectField
      control={form.control}
      name="pick"
      label="Pick"
      placeholder="Choose one"
      options={options}
      groups={groups}
      searchable={searchable}
    />
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox', { name: /Pick/ }));
  return screen.findByRole('listbox');
};
const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

afterEach(cleanup);

describe('SelectField: the search box appears above 6 options', () => {
  it('7 options: a search box, focused on open', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={EMPLOYEES} />);
    await open(user);
    const search = screen.getByRole('searchbox');
    await waitFor(() => expect(document.activeElement).toBe(search));
  });

  it('6 options: a plain select, no search box', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={SIX} />);
    await open(user);
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('`searchable` forces it either way', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithI18n(<Picker options={SIX.slice(0, 2)} searchable />);
    await open(user);
    expect(screen.getByRole('searchbox')).toBeTruthy();
    unmount();
    renderWithI18n(<Picker options={EMPLOYEES} searchable={false} />);
    await open(user);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('filters by name, by code and by an Arabic name typed with a different alef', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={EMPLOYEES} />);
    await open(user);
    const search = screen.getByRole('searchbox');
    await user.type(search, 'omar');
    expect(optionNames()).toEqual(['Omar Fathy · EMP-0002']);
    await user.clear(search);
    await user.type(search, 'emp-0013');
    expect(optionNames()).toEqual(['Ahmed Saleh · EMP-0013']);
    await user.clear(search);
    await user.type(search, 'احمد');
    expect(optionNames()).toEqual(['Ahmed Saleh · EMP-0013']);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(optionNames()).toEqual([]);
    expect(screen.getByText('Nothing matches that search.')).toBeTruthy();
  });

  it('keyboard: arrows move through the matches, Enter picks, Escape closes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Picker options={EMPLOYEES} onChange={onChange} />);
    await open(user);
    await user.type(screen.getByRole('searchbox'), 'a');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('omar');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox', { name: /Pick/ }).textContent).toContain('Omar Fathy');

    await open(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    // Escape picked nothing: the value is still the one Enter chose.
    expect(onChange).toHaveBeenLastCalledWith('omar');
    expect(screen.getByRole('combobox', { name: /Pick/ }).textContent).toContain('Omar Fathy');
  });

  it('grouped options keep their headings while filtering; a group with no match hides', async () => {
    const user = userEvent.setup();
    const groups: SelectOptionGroup[] = [
      {
        key: 'a',
        label: 'General table',
        options: [opt('late', 'Late arrival'), opt('absent', 'Absence'), opt('early', 'Leaving early')],
      },
      { key: 'b', label: 'Classroom', options: [opt('phone', 'Phone in class'), opt('noprep', 'No lesson plan')] },
      { key: 'c', label: 'Conduct', options: [opt('rude', 'Rudeness'), opt('dress', 'Dress code')] },
    ];
    renderWithI18n(<Picker groups={groups} />);
    const list = await open(user);
    expect(within(list).getAllByRole('group')).toHaveLength(3);
    await user.type(screen.getByRole('searchbox'), 'late');
    const left = within(list).getAllByRole('group');
    expect(left).toHaveLength(1);
    expect(
      left[0]!.getAttribute('aria-labelledby') &&
        document.getElementById(left[0]!.getAttribute('aria-labelledby')!)?.textContent,
    ).toBe('General table');
    expect(optionNames()).toEqual(['Late arrival']);
  });

  it('Arabic: the search box and list follow the page direction', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={EMPLOYEES} />, { locale: 'ar' });
    const list = await open(user);
    expect(list.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBeTruthy();
  });
});

describe('FilterSelect: the same switch', () => {
  const departments = EMPLOYEES.map((e) => ({ value: e.value, label: e.label.split(' · ')[0]!, keywords: e.keywords }));

  it('more than 6 choices (counting "All"): searchable, and choosing "All" still reports no filter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(
      <FilterSelect
        label="Department"
        allLabel="All departments"
        value="mona"
        options={departments}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Department' });
    expect(trigger.textContent).toContain('Mona Khalil');
    await user.click(trigger);
    await user.type(screen.getByRole('searchbox'), 'all');
    await user.click(screen.getByRole('option', { name: 'All departments' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('5 choices plus "All": a plain select', async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <FilterSelect
        label="Status"
        allLabel="All statuses"
        value={undefined}
        options={SIX.slice(0, 5)}
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await screen.findByRole('listbox');
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
