// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({ GET_FIRST_CONTRACT_ID: vi.fn(), UPLOAD_SIGNED_CONTRACT_PAGE: vi.fn() }));
vi.mock('../apis', () => api);

import { renderEmployees } from '../test/fixtures';
import { EmployeeSignedContractField, uploadSignedContract } from './employee-signed-contract-field';

/*
 * "Add employee" → the optional signed contract (owner, 2026-11-24): pages picked on the form, then
 * attached in order to the new employee's first contract once they are saved.
 */

const png = (name: string, size = 2048) => new File([new Uint8Array(size)], name, { type: 'image/png' });

function Field() {
  const [files, setFiles] = useState<File[]>([]);
  return <EmployeeSignedContractField files={files} onChange={setFiles} />;
}

describe('EmployeeSignedContractField', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists the pages picked in order; a wrong type or a file over 10 MB is refused with its reason; a page can be taken out', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderEmployees(<Field />);
    const group = screen.getByRole('group', { name: 'Signed contract (optional)' });
    const input = group.querySelector<HTMLInputElement>('input[type=file]')!;
    // A phone offers the camera and the photos (no forced capture), or a PDF.
    expect(input.accept).toBe('image/*,application/pdf');
    expect(input.multiple).toBe(true);
    expect(input.hasAttribute('capture')).toBe(false);

    await user.upload(input, [png('page-1.png'), png('page-2.png')]);
    expect(within(screen.getByTestId('pending-files')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1page-1.png', '2page-2.png']);

    await user.upload(input, [new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(screen.getByRole('alert').textContent).toBe('Choose a PDF, PNG, JPG or WebP file.');
    await user.upload(input, [png('huge.png', 10 * 1024 * 1024 + 1)]);
    expect(screen.getByRole('alert').textContent).toBe('huge.png is larger than 10 MB.');
    expect(screen.getByTestId('pending-files').querySelectorAll('li')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Remove page-1.png' }));
    expect(within(screen.getByTestId('pending-files')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1page-2.png']);
  });

  it('after the save: finds the first contract, then sends each page in order', async () => {
    api.GET_FIRST_CONTRACT_ID.mockResolvedValue({ success: true, status: 200, data: [{ id: 'c-first' }] });
    api.UPLOAD_SIGNED_CONTRACT_PAGE.mockResolvedValue({ success: true, status: 200, data: { contractId: 'c-first', files: [] } });
    const pages = [png('a.png'), png('b.png')];
    expect(await uploadSignedContract('e-new', pages)).toBe(true);
    expect(api.GET_FIRST_CONTRACT_ID).toHaveBeenCalledWith('e-new');
    expect(api.UPLOAD_SIGNED_CONTRACT_PAGE.mock.calls.map(([id, form]) => [id, ((form as FormData).get('file') as File).name])).toEqual([
      ['c-first', 'a.png'],
      ['c-first', 'b.png'],
    ]);
  });

  it('a page that fails is reported (the employee is saved either way); nothing picked sends nothing', async () => {
    api.GET_FIRST_CONTRACT_ID.mockResolvedValue({ success: true, status: 200, data: [{ id: 'c-first' }] });
    api.UPLOAD_SIGNED_CONTRACT_PAGE.mockResolvedValueOnce({ success: false, status: 413, error: 'FILE_TOO_LARGE', message: 'x' });
    api.UPLOAD_SIGNED_CONTRACT_PAGE.mockResolvedValueOnce({ success: true, status: 200, data: { contractId: 'c-first', files: [] } });
    expect(await uploadSignedContract('e-new', [png('a.png'), png('b.png')])).toBe(false);
    expect(api.UPLOAD_SIGNED_CONTRACT_PAGE).toHaveBeenCalledTimes(2);
    vi.clearAllMocks();
    expect(await uploadSignedContract('e-new', [])).toBe(true);
    expect(api.GET_FIRST_CONTRACT_ID).not.toHaveBeenCalled();
  });
});
