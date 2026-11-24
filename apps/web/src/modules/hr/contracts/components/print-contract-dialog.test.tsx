// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { ContractPrintPreview, ContractPrintTemplateOption, CreatedContractCopy } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; prefetch?: boolean }) => {
    const anchor = { ...props };
    delete anchor.prefetch;
    return <a {...anchor} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// "Edit text" loads TipTap with next/dynamic: a stand-in editor that "types" one word.
vi.mock('next/dynamic', () => ({
  default: () =>
    function StubEditor(props: { onReady?: (json: unknown) => void; onChange: (json: unknown) => void; initial: unknown }) {
      return (
        <button
          type="button"
          onClick={() =>
            props.onChange({
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited wording ' }, { type: 'field', attrs: { key: 'employee.nameEn' } }] }],
            })
          }
        >
          Type in the editor
        </button>
      );
    },
}));
const api = vi.hoisted(() => ({
  GET_PRINT_TEMPLATES: vi.fn(),
  GET_CONTRACT_PRINT: vi.fn(),
  CREATE_CONTRACT_COPY: vi.fn(),
}));
vi.mock('../apis', () => api);
const output = vi.hoisted(() => ({ printPdf: vi.fn(), sharePdf: vi.fn(), pdfBlob: vi.fn(() => new Blob(['%PDF'])) }));
vi.mock('../lib/pdf-output', () => output);

import { contract, failure, ok, renderContracts } from '../test/fixtures';
import { PrintContractDialog } from './print-contract-dialog';

const option = (overrides: Partial<ContractPrintTemplateOption> = {}): ContractPrintTemplateOption => ({
  id: 't-full',
  nameEn: 'Full-time contract',
  nameAr: 'عقد عمل بدوام كامل',
  version: 3,
  hasEnglish: false,
  usesSalary: true,
  isDefault: true,
  salaryBlocked: false,
  ...overrides,
});

const annex = option({ id: 't-annex', nameEn: 'Renewal annex', nameAr: 'ملحق تجديد', isDefault: false, hasEnglish: true });
const fullTime = option();

function preview(overrides: Partial<ContractPrintPreview> = {}): ContractPrintPreview {
  return {
    contract: { id: 'c-1', startsOn: '2026-06-01', endsOn: '2027-05-31', status: 'ACTIVE', phase: 'CURRENT', year: 2026, endedOn: null },
    employee: { id: 'e-mona', code: 'EMP-0012', nameEn: 'Mona Khalil', nameAr: 'منى خليل' },
    template: { id: 't-full', nameEn: 'Full-time contract', nameAr: 'عقد عمل بدوام كامل', version: 3, hasEnglish: false },
    language: 'AR',
    document: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'الرقم القومي ' }, { type: 'field', attrs: { key: 'employee.nationalId' } }] }],
    },
    values: { 'employee.nationalId': null } as ContractPrintPreview['values'],
    emptyFields: ['employee.nationalId'],
    phrasesLeftOut: [],
    logoUrl: null,
    valuesHash: 'hash-1',
    copies: [],
    copiesTotal: 0,
    ...overrides,
  };
}

const copy: CreatedContractCopy = {
  pdfBase64: 'JVBERg==',
  id: 'cp-1',
  contractId: 'c-1',
  templateId: 't-full',
  templateNameEn: 'Full-time contract',
  templateNameAr: 'عقد عمل بدوام كامل',
  templateVersion: 3,
  language: 'AR',
  textEdited: true,
  containsSalary: true,
  output: 'PRINT',
  pageCount: 2,
  fileUrl: '/files/contract-copies/abc.pdf',
  downloadName: 'EMP-0012-2026-27-full-time-contract.pdf',
  printedBy: { id: 'u-1', name: 'Test Admin' },
  printedAt: '2026-11-25T10:00:00.000Z',
  signed: false,
};

/** Waits until the preview is in and Print is enabled. */
async function printable() {
  await waitFor(() => expect((screen.getByRole('button', { name: 'Print' }) as HTMLButtonElement).disabled).toBe(false));
}

function open() {
  return renderContracts(<PrintContractDialog contract={contract()} open onOpenChange={vi.fn()} />);
}

/** Opens Edit text, types through the stand-in editor, and presses Done. */
async function editCopy(user: ReturnType<typeof userEvent.setup>) {
  await printable();
  await user.click(screen.getAllByRole('button', { name: 'Edit text' })[0]!);
  await user.click(await screen.findByRole('button', { name: 'Type in the editor' }));
  await user.click(screen.getAllByRole('button', { name: 'Done' })[0]!);
}

describe('Print contract dialog', () => {
  beforeEach(() => {
    api.GET_PRINT_TEMPLATES.mockImplementation(() => ok([annex, fullTime]));
    api.GET_CONTRACT_PRINT.mockImplementation(() => ok(preview()));
    output.printPdf.mockResolvedValue('printed');
    output.sharePdf.mockResolvedValue('shared');
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("preselects the employee's work-system default and previews it", async () => {
    open();
    await waitFor(() => expect(api.GET_CONTRACT_PRINT).toHaveBeenCalledWith('c-1', 't-full', 'AR'));
    expect(screen.getByRole('combobox', { name: 'Template' }).textContent).toContain('Full-time contract · Default');
  });

  it('edge case 9: no English text → the language switch offers Arabic only', async () => {
    open();
    await waitFor(() => expect(api.GET_CONTRACT_PRINT).toHaveBeenCalled());
    const group = screen.getByRole('radiogroup', { name: 'Language of the copy' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['العربية']);
    expect(screen.getByText('This template has no English text: the copy prints in Arabic.')).toBeTruthy();
  });

  it('edge case 4: a template with salary fields the printer may not see is greyed "Needs access to salaries"', async () => {
    api.GET_PRINT_TEMPLATES.mockImplementation(() => ok([option({ isDefault: false, salaryBlocked: true }), annex]));
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('combobox', { name: 'Template' }));
    const blocked = await screen.findByRole('option', { name: /Needs access to salaries/ });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    // No default to preselect: the dialog asks to pick one.
    expect(screen.getByText('No template is the default for this work system — pick one.')).toBeTruthy();
  });

  it('edge case 6: an empty field is named, with Open file to the employee', async () => {
    open();
    expect(await screen.findByText('1 field is empty: National ID')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open file' }).getAttribute('href')).toBe('/en/employees/e-mona');
  });

  it('edge case 15: VALUES_CHANGED → the message, the preview reloads, and the copy keeps its text edits', async () => {
    const user = userEvent.setup();
    open();
    await editCopy(user);
    expect(await screen.findByText("This copy's text was changed.")).toBeTruthy();
    await printable();
    api.CREATE_CONTRACT_COPY.mockImplementationOnce(() => failure(409, 'VALUES_CHANGED'));
    const before = api.GET_CONTRACT_PRINT.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(await screen.findByText("The contract's details changed — check the preview again.")).toBeTruthy();
    await waitFor(() => expect(api.GET_CONTRACT_PRINT.mock.calls.length).toBeGreaterThan(before));
    // Printing again sends the same edits.
    api.CREATE_CONTRACT_COPY.mockImplementationOnce(() => ok(copy));
    await printable();
    await user.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(api.CREATE_CONTRACT_COPY).toHaveBeenCalledTimes(2));
    const body = api.CREATE_CONTRACT_COPY.mock.calls[1]![1] as { bodyEdited?: unknown; output: string };
    expect(JSON.stringify(body.bodyEdited)).toContain('Edited wording');
    expect(body.output).toBe('PRINT');
  });

  it('edge case 15: TEMPLATE_CHANGED with this copy edited asks "Start from the new text" or "Close"', async () => {
    const user = userEvent.setup();
    open();
    await editCopy(user);
    await printable();
    api.CREATE_CONTRACT_COPY.mockImplementationOnce(() => failure(409, 'TEMPLATE_CHANGED'));
    await user.click(screen.getByRole('button', { name: 'Print' }));
    const dialog = await screen.findByRole('dialog', { name: 'The template changed' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Start from the new text' }));
    await waitFor(() => expect(screen.queryByText("This copy's text was changed.")).toBeNull());
  });

  it('Print makes the copy and prints its PDF from a hidden frame', async () => {
    api.CREATE_CONTRACT_COPY.mockImplementation(() => ok(copy));
    const user = userEvent.setup();
    open();
    await printable();
    await user.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(output.printPdf).toHaveBeenCalled());
    expect(api.CREATE_CONTRACT_COPY).toHaveBeenCalledWith('c-1', {
      templateId: 't-full',
      templateVersion: 3,
      language: 'AR',
      valuesHash: 'hash-1',
      output: 'PRINT',
    });
    // The PDF comes with the answer: no second fetch, so no extra "opened" entry.
    expect(output.printPdf.mock.calls[0]![1]).toBe('/files/contract-copies/abc.pdf');
  });
});
