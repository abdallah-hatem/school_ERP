// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImgHTMLAttributes } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('next/image', () => ({
  // A plain image in tests (next/image needs its loader).
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const rest = { ...props };
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt} {...rest} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({
  GET_SIGNED_COPY: vi.fn(),
  GET_EMPLOYEE_CONTRACTS: vi.fn(),
  REMOVE_SIGNED_COPY_PAGE: vi.fn(),
  // Not an action: the page goes to the upload Route Handler (`lib/uploads.ts`).
  ADD_SIGNED_COPY_PAGE: vi.fn(),
}));
vi.mock('../apis', () => api);
vi.mock('../lib/uploads', () => ({ uploadSignedCopyPage: api.ADD_SIGNED_COPY_PAGE, uploadContractFile: vi.fn() }));
// The add-employee form's hook (`EmployeeForm`'s `contractExtra`): what the part registers is kept here.
const extras = vi.hoisted(() => ({ disabled: false, setAfterCreate: vi.fn() }));
vi.mock('../../employees', () => ({ useEmployeeCreateExtras: () => extras }));

import type { ContractSignedCopy, ContractSignedCopyFile } from '@school-erp/shared';
import { sessionWithout } from '@/test/render';
import { contract, ok, renderContracts } from '../test/fixtures';
import { NewEmployeeSignedContract, SignedCopyLink, SignedCopyViewer } from './signed-copy';

/*
 * A contract's signed copy (owner, 2026-11-24) as a timeline: "Signed copy (2)" → the viewer with
 * the pages in order → a page removed with a reason → pages added; who sees which buttons.
 */

const page = (over: Partial<ContractSignedCopyFile>): ContractSignedCopyFile => ({
  id: 'f-1',
  url: '/files/contract-signed-copies/c-1-a.png',
  name: 'IMG_2041.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 2_000_000,
  page: 1,
  uploadedBy: { id: 'u-1', name: 'Laila Hassan' },
  uploadedAt: '2026-11-24T09:00:00.000Z',
  ...over,
});
const photo = page({});
const pdf = page({ id: 'f-2', url: '/files/contract-signed-copies/c-1-b.pdf', name: 'page-2.pdf', mimeType: 'application/pdf', page: 2 });
const copy = (files: ContractSignedCopyFile[]): ContractSignedCopy => ({ contractId: 'c-1', files });

function renderViewer(over: Parameters<typeof contract>[0] = {}, session?: Parameters<typeof renderContracts>[2]) {
  const c = contract({ signedCopyPages: 2, ...over });
  return renderContracts(<SignedCopyViewer contract={c} open onOpenChange={vi.fn()} />, 'en', session);
}

describe('Signed copy', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('the Documents line: "Signed copy (2)" opens it; none reads "No signed copy"', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { unmount } = renderContracts(<SignedCopyLink contract={contract({ signedCopyPages: 2 })} onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'Open the signed copy of Mona Khalil' }));
    expect(screen.getByTestId('signed-copy-count').textContent).toBe('Signed copy (2)');
    expect(onOpen).toHaveBeenCalled();
    unmount();
    renderContracts(<SignedCopyLink contract={contract()} onOpen={onOpen} />, 'ar');
    expect(screen.getByTestId('signed-copy-none').textContent).toBe('لا توجد نسخة موقّعة');
  });

  it('the viewer: loading, then the pages in order — the photo inline and zoomable, the PDF in a new tab, each downloadable', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => undefined;
    api.GET_SIGNED_COPY.mockReturnValue(new Promise((r) => (answer = r)));
    renderViewer();
    const dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    expect(dialog.querySelector('[data-skeleton-block="signed-copy-pages"]')).not.toBeNull();
    answer(ok(copy([photo, pdf])));
    const list = await within(dialog).findByRole('list', { name: 'Pages of the signed copy' });
    const pages = within(list).getAllByTestId('signed-copy-page');
    expect(pages.map((p) => within(p).getByText(/^Page \d$/).textContent)).toEqual(['Page 1', 'Page 2']);
    expect(api.GET_SIGNED_COPY).toHaveBeenCalledWith('c-1');
    const image = within(pages[0]!).getByRole('img', { name: 'Page 1' });
    expect(image.getAttribute('src')).toBe(photo.url);
    await user.click(within(pages[0]!).getByRole('button', { name: 'Zoom in' }));
    expect(within(pages[0]!).getByRole('button', { name: 'Zoom out' }).getAttribute('aria-pressed')).toBe('true');
    const openPdf = within(pages[1]!).getByRole('link', { name: 'Open PDF' });
    expect([openPdf.getAttribute('href'), openPdf.getAttribute('target')]).toEqual([pdf.url, '_blank']);
    expect(within(pages[1]!).getByRole('link', { name: 'Download' }).getAttribute('download')).toBe('page-2.pdf');
  });

  it('removing a page needs a reason; the copy reads again without it', async () => {
    const user = userEvent.setup();
    api.GET_SIGNED_COPY.mockResolvedValue(ok(copy([photo, pdf])));
    api.REMOVE_SIGNED_COPY_PAGE.mockResolvedValue(ok(copy([pdf])));
    renderViewer();
    const dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    const [first] = await within(dialog).findAllByTestId('signed-copy-page');
    await user.click(within(first!).getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove page 1?' });
    const removeButton = within(confirm).getByRole('button', { name: 'Remove page' });
    expect(removeButton).toHaveProperty('disabled', true);
    await user.type(within(confirm).getByRole('textbox'), 'Blurry photo');
    await user.click(removeButton);
    await waitFor(() => expect(api.REMOVE_SIGNED_COPY_PAGE).toHaveBeenCalledWith('c-1', 'f-1', 'Blurry photo'));
    await waitFor(() => expect(within(dialog).getAllByTestId('signed-copy-page')).toHaveLength(1));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('"Add pages" sends each picked file in order; a wrong type is refused before anything is sent', async () => {
    const user = userEvent.setup({ applyAccept: false });
    api.GET_SIGNED_COPY.mockResolvedValue(ok(copy([])));
    api.ADD_SIGNED_COPY_PAGE.mockResolvedValueOnce(ok(copy([photo])));
    api.ADD_SIGNED_COPY_PAGE.mockResolvedValueOnce(ok(copy([photo, pdf])));
    renderViewer({ signedCopyPages: 0 });
    const dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    expect(await within(dialog).findByText('No signed copy yet')).toBeTruthy();
    const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.accept).toBe('image/*,application/pdf');

    await user.upload(input, [new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(within(dialog).getByRole('alert').textContent).toBe('Choose a PDF, PNG, JPG or WebP file.');
    expect(api.ADD_SIGNED_COPY_PAGE).not.toHaveBeenCalled();

    await user.upload(input, [
      new File([new Uint8Array(10)], 'p1.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(10)], 'p2.pdf', { type: 'application/pdf' }),
    ]);
    await waitFor(() => expect(within(dialog).getAllByTestId('signed-copy-page')).toHaveLength(2));
    expect(api.ADD_SIGNED_COPY_PAGE.mock.calls.map(([id, file]) => [id, (file as File).name])).toEqual([
      ['c-1', 'p1.jpg'],
      ['c-1', 'p2.pdf'],
    ]);
  });

  it('too many uploads at once: the page waits as long as the API says and goes again; a page refused for good is named', async () => {
    const user = userEvent.setup({ applyAccept: false });
    api.GET_SIGNED_COPY.mockResolvedValue(ok(copy([])));
    const tooMany = { success: false, status: 429, error: 'TOO_MANY_REQUESTS', message: 'x', params: { count: 0.01 } };
    const refused = { success: false, status: 400, error: 'INVALID_FILE_TYPE', message: 'x' };
    api.ADD_SIGNED_COPY_PAGE.mockResolvedValueOnce(tooMany).mockResolvedValueOnce(ok(copy([photo]))).mockResolvedValueOnce(refused);
    renderViewer({ signedCopyPages: 0 });
    const dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    await within(dialog).findByText('No signed copy yet');
    await user.upload(dialog.querySelector<HTMLInputElement>('input[type=file]')!, [
      new File([new Uint8Array(10)], 'p1.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(10)], 'renamed.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(within(dialog).getAllByTestId('signed-copy-page')).toHaveLength(1));
    // p1 twice (the 429, then accepted), renamed.jpg once.
    expect(api.ADD_SIGNED_COPY_PAGE.mock.calls.map(([, file]) => (file as File).name)).toEqual(['p1.jpg', 'p1.jpg', 'renamed.jpg']);
    expect(within(dialog).getByRole('alert').textContent).toBe(
      "1 page couldn't be uploaded. Add it from the signed copy. Not uploaded: renamed.jpg.",
    );
  });

  describe('"Add employee" → the signed contract', () => {
    const lastAfterCreate = () => {
      const calls = extras.setAfterCreate.mock.calls;
      return calls[calls.length - 1]![0] as ((id: string) => Promise<boolean>) | null;
    };

    it('pages picked on the form go to the first contract after the save, in order', async () => {
      const user = userEvent.setup({ applyAccept: false });
      api.GET_EMPLOYEE_CONTRACTS.mockResolvedValue(ok([contract({ id: 'c-first' })]));
      api.ADD_SIGNED_COPY_PAGE.mockResolvedValue(ok(copy([photo])));
      renderContracts(<NewEmployeeSignedContract />);
      const group = screen.getByRole('group', { name: 'Signed contract (optional)' });
      const input = group.querySelector<HTMLInputElement>('input[type=file]')!;
      // A phone offers the camera and the photos (no forced capture), or a PDF.
      expect([input.accept, input.multiple, input.hasAttribute('capture')]).toEqual(['image/*,application/pdf', true, false]);
      expect(group.textContent).toContain('if you manage contracts for the stage you chose');
      expect(lastAfterCreate()).toBeNull();
      await user.upload(input, [
        new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }),
        new File([new Uint8Array(10)], 'b.jpg', { type: 'image/jpeg' }),
      ]);
      await waitFor(() => expect(lastAfterCreate()).not.toBeNull());
      expect(await lastAfterCreate()!('e-new')).toBe(true);
      expect(api.GET_EMPLOYEE_CONTRACTS).toHaveBeenCalledWith('e-new', { page: 1, limit: 1 });
      expect(api.ADD_SIGNED_COPY_PAGE.mock.calls.map(([id, file]) => [id, (file as File).name])).toEqual([
        ['c-first', 'a.jpg'],
        ['c-first', 'b.jpg'],
      ]);
    });

    it('a manager whose scope doesn’t cover the stage: the employee stays saved, the step reports it', async () => {
      const user = userEvent.setup({ applyAccept: false });
      api.GET_EMPLOYEE_CONTRACTS.mockResolvedValue(ok([contract({ id: 'c-first' })]));
      api.ADD_SIGNED_COPY_PAGE.mockResolvedValue({ success: false, status: 404, error: 'NOT_FOUND', message: 'x' });
      renderContracts(<NewEmployeeSignedContract />);
      const input = screen.getByRole('group', { name: 'Signed contract (optional)' }).querySelector<HTMLInputElement>('input[type=file]')!;
      await user.upload(input, [new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' })]);
      await waitFor(() => expect(lastAfterCreate()).not.toBeNull());
      expect(await lastAfterCreate()!('e-new')).toBe(false);
    });

    it('not shown without hr.contracts.manage', () => {
      renderContracts(<NewEmployeeSignedContract />, 'en', sessionWithout('hr.contracts.manage'));
      expect(screen.queryByRole('group', { name: 'Signed contract (optional)' })).toBeNull();
    });
  });

  it('30 pages at most: picking past it uploads only what fits and says why', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const many = Array.from({ length: 29 }, (_, i) => page({ id: `f-${i}`, page: i + 1 }));
    api.GET_SIGNED_COPY.mockResolvedValue(ok(copy(many)));
    api.ADD_SIGNED_COPY_PAGE.mockResolvedValue(ok(copy([...many, photo])));
    renderViewer({ signedCopyPages: 29 });
    const dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    await within(dialog).findAllByTestId('signed-copy-page');
    await user.upload(dialog.querySelector<HTMLInputElement>('input[type=file]')!, [
      new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(10)], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(api.ADD_SIGNED_COPY_PAGE).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('alert').textContent).toBe('A signed copy holds at most 30 pages. Remove one first.');
  });

  it('own contract or no hr.contracts.manage: view and download only', async () => {
    api.GET_SIGNED_COPY.mockResolvedValue(ok(copy([photo])));
    const { unmount } = renderViewer({ ownContract: true });
    let dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    await within(dialog).findAllByTestId('signed-copy-page');
    expect(within(dialog).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Add pages' })).toBeNull();
    expect(dialog.textContent).toContain('Your own contract: someone else uploads its signed copy.');
    unmount();
    renderViewer({}, sessionWithout('hr.contracts.manage'));
    dialog = await screen.findByRole('dialog', { name: 'Signed copy' });
    await within(dialog).findAllByTestId('signed-copy-page');
    expect(within(dialog).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Add pages' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Download' })).toBeTruthy();
  });

  it('Arabic: the viewer reads in Arabic', async () => {
    api.GET_SIGNED_COPY.mockResolvedValue(ok(copy([photo])));
    renderContracts(<SignedCopyViewer contract={contract({ signedCopyPages: 1 })} open onOpenChange={vi.fn()} />, 'ar');
    const dialog = await screen.findByRole('dialog', { name: 'النسخة الموقّعة' });
    expect(await within(dialog).findByText('صفحة 1')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'إضافة صفحات' })).toBeTruthy();
  });
});
