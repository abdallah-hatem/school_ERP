// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchKey } from '@/shared/lib/search';
import { renderWithI18n } from '@/test/render';
import { Combobox, type ComboboxOption, type ServerOptions } from './combobox';

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
  initial = '',
}: {
  onChange?: (v: string) => void;
  options?: ComboboxOption[];
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
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

/** The row the search box points at (what Enter would pick), checked from both sides. */
function highlighted(): string | null | undefined {
  const id = screen.getByRole('searchbox').getAttribute('aria-activedescendant');
  const marked = screen.queryAllByRole('option').filter((o) => o.hasAttribute('data-active'));
  expect(marked.map((o) => o.id)).toEqual(id ? [id] : []);
  return id ? document.getElementById(id)?.textContent : null;
}

/**
 * A server-searched picker like the Direct manager one: "No direct manager" heads the list, and the
 * API answers a moment after the list opens (the answer is empty until then).
 */
const MANAGERS: ComboboxOption[] = [
  { value: 'none', label: 'No direct manager' },
  { value: 'mona', label: 'Mona Khalil', hint: 'Science' },
  { value: 'omar', label: 'Omar Fathy', hint: 'Mathematics' },
  { value: 'ahmed', label: 'Ahmed Saleh', hint: 'Arabic' },
];

function ServerPicker({ onChange = vi.fn(), initial }: { onChange?: (v: string) => void; initial: string }) {
  const [value, setValue] = useState(initial);
  const [query, setQuery] = useState<string | null>(null);
  const [answer, setAnswer] = useState<ComboboxOption[]>([]);
  useEffect(() => {
    if (query === null) return;
    const timer = setTimeout(
      () => setAnswer(MANAGERS.filter((o) => !query || `${o.label} ${o.hint ?? ''}`.includes(query))),
      20,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const server: ServerOptions = {
    options: answer,
    onQueryChange: setQuery,
    loading: false,
    selected: MANAGERS.find((o) => o.value === value) ?? null,
  };
  return (
    <Combobox
      aria-label="Direct manager"
      server={server}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      placeholder="Choose a manager"
      searchPlaceholder="Type a name or code"
      emptyText="No managers yet."
      noMatchesText="No manager matches."
    />
  );
}

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

describe('Combobox highlight on open', () => {
  afterEach(cleanup);

  it('opens on the chosen option, and Enter keeps the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Picker initial="ahmed" onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Employee' });
    await user.click(trigger);
    expect(highlighted()).toBe('Ahmed Saleh · EMP-0013');
    expect(screen.getByRole('option', { name: 'Ahmed Saleh · EMP-0013' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('ahmed');
    expect(trigger.textContent).toBe('Ahmed Saleh · EMP-0013');
    // Arrows continue from the chosen option.
    await user.click(trigger);
    await user.keyboard('{ArrowUp}');
    expect(highlighted()).toBe('Omar Fathy · EMP-0002');
  });

  it('nothing chosen: the first row is highlighted', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    expect(highlighted()).toBe('Mona Khalil · EMP-0001');
  });

  it('typing highlights the first match, even with an option chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Picker initial="ahmed" onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    expect(highlighted()).toBe('Ahmed Saleh · EMP-0013');
    // "EMP-00" matches all three: the first match, not the chosen one, is highlighted.
    await user.type(screen.getByRole('searchbox'), 'EMP-00');
    expect(highlighted()).toBe('Mona Khalil · EMP-0001');
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'mar');
    expect(highlighted()).toBe('Omar Fathy · EMP-0002');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('omar');
  });

  it('server list: the highlight lands on the chosen option when the answer arrives, and Enter keeps it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<ServerPicker initial="omar" onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Direct manager' });
    expect(trigger.textContent).toBe('Omar Fathy · Mathematics');
    await user.click(trigger);
    await waitFor(() => expect(optionNames()).toHaveLength(4));
    expect(highlighted()).toBe('Omar Fathy · Mathematics');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('omar');
    expect(onChange).not.toHaveBeenCalledWith('none');
  });

  it('server list, nothing chosen yet: the first row ("No direct manager") is highlighted', async () => {
    const user = userEvent.setup();
    renderWithI18n(<ServerPicker initial="" />);
    await user.click(screen.getByRole('combobox', { name: 'Direct manager' }));
    await waitFor(() => expect(optionNames()).toHaveLength(4));
    expect(highlighted()).toBe('No direct manager');
  });

  it('server list: a search highlights its first match once the answer arrives', async () => {
    const user = userEvent.setup();
    renderWithI18n(<ServerPicker initial="mona" />);
    await user.click(screen.getByRole('combobox', { name: 'Direct manager' }));
    await waitFor(() => expect(optionNames()).toHaveLength(4));
    await user.type(screen.getByRole('searchbox'), 'Ahmed');
    await waitFor(() => expect(optionNames()).toEqual(['Ahmed Saleh · Arabic']));
    expect(highlighted()).toBe('Ahmed Saleh · Arabic');
  });
});

describe('Combobox option hint', () => {
  afterEach(cleanup);

  const WITH_HINTS: ComboboxOption[] = [
    { value: 'mona', label: 'Mona Khalil', hint: 'Science', keywords: ['EMP-0001'] },
    { value: 'omar', label: 'Omar Fathy', hint: 'Mathematics', keywords: ['EMP-0002'] },
  ];

  it('shows the hint muted after the label, in the list and on the trigger; the name reads "Name · Hint"', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={WITH_HINTS} initial="omar" />);
    const trigger = screen.getByRole('combobox', { name: 'Employee' });
    expect(trigger.textContent).toBe('Omar Fathy · Mathematics');
    expect(within(trigger).getByText('Mathematics').closest('.text-muted-foreground')).toBeTruthy();
    await user.click(trigger);
    const row = screen.getByRole('option', { name: 'Omar Fathy · Mathematics' });
    expect(within(row).getByText('Mathematics').closest('.text-muted-foreground')).toBeTruthy();
    expect(within(row).getByText('Omar Fathy').closest('.text-muted-foreground')).toBeNull();
  });

  it('the search matches the hint and the keywords', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Picker options={WITH_HINTS} />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    const search = screen.getByRole('searchbox');
    await user.type(search, 'math');
    expect(optionNames()).toEqual(['Omar Fathy · Mathematics']);
    await user.clear(search);
    await user.type(search, '0001');
    expect(optionNames()).toEqual(['Mona Khalil · Science']);
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
