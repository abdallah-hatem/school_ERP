// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTemplates } from '../test/fixtures';
import { FieldsPanel } from './fields-panel';

describe('the Fields panel', () => {
  afterEach(() => cleanup());

  it('lists the 19 fields in their four groups, each with the other language and a sample', () => {
    renderTemplates(<FieldsPanel documentLanguage="AR" onInsert={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /^Insert / })).toHaveLength(19);
    for (const group of ['From the employee file', 'From the contract', 'From school settings', 'Other']) {
      expect(screen.getByRole('heading', { name: group })).toBeTruthy();
    }
    // The other language's name and the Arabic document's sample.
    const nationalId = screen.getByRole('button', { name: 'Insert National ID' });
    expect(nationalId.textContent).toContain('الرقم القومي');
    expect(nationalId.textContent).toContain('28803150104527');
    // Stage has no sample: it is empty for some employees.
    expect(screen.getByRole('button', { name: 'Insert Stage' }).textContent).toContain('empty for some employees');
  });

  it('a click inserts that field (the chip goes where the cursor is)', async () => {
    const onInsert = vi.fn();
    const user = userEvent.setup();
    renderTemplates(<FieldsPanel documentLanguage="AR" onInsert={onInsert} />);
    await user.click(screen.getByRole('button', { name: 'Insert National ID' }));
    expect(onInsert).toHaveBeenCalledWith('employee.nationalId');
  });

  it('the search narrows the fixed list by either language', async () => {
    const user = userEvent.setup();
    renderTemplates(<FieldsPanel documentLanguage="AR" onInsert={vi.fn()} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'الأجر');
    const left = screen.getAllByRole('button', { name: /^Insert / }).map((b) => b.getAttribute('aria-label'));
    expect(left).toEqual(['Insert Basic salary', 'Insert Basic salary in words', 'Insert Basic salary in Arabic words']);
  });
});
