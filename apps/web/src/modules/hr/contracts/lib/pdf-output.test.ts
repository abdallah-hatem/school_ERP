// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharePdf } from './pdf-output';

const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
const nav = navigator as unknown as { canShare?: unknown; share?: unknown };

describe('a phone\'s "Print or PDF"', () => {
  afterEach(() => {
    delete nav.canShare;
    delete nav.share;
    vi.restoreAllMocks();
  });

  it('hands the PDF file to the share sheet when the browser can share files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(nav, { canShare: () => true, share });
    const open = vi.spyOn(window, 'open');
    await expect(sharePdf(blob, 'EMP-0006-2026-27-full-time-contract.pdf', '/files/contract-copies/a.pdf')).resolves.toBe('shared');
    const files = (share.mock.calls[0]![0] as { files: File[] }).files;
    expect(files[0]!.name).toBe('EMP-0006-2026-27-full-time-contract.pdf');
    expect(files[0]!.type).toBe('application/pdf');
    expect(open).not.toHaveBeenCalled();
  });

  it("edge case 18: the browser can't share files (canShare false) → the PDF opens in the browser's viewer", async () => {
    Object.assign(nav, { canShare: () => false, share: vi.fn() });
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: window } as unknown as Window);
    await expect(sharePdf(blob, 'copy.pdf', '/files/contract-copies/a.pdf')).resolves.toBe('opened');
    expect(open).toHaveBeenCalledWith('/files/contract-copies/a.pdf', '_blank');
    expect(nav.share).not.toHaveBeenCalled();
  });

  it('edge case 18: no Web Share at all → the viewer too; a blocked tab is reported so a link is offered', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(sharePdf(blob, 'copy.pdf', '/files/contract-copies/a.pdf')).resolves.toBe('blocked');
  });

  it('cancelling the share sheet is not an error (the copy is kept either way)', async () => {
    Object.assign(nav, { canShare: () => true, share: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })) });
    await expect(sharePdf(blob, 'copy.pdf', '/files/contract-copies/a.pdf')).resolves.toBe('cancelled');
  });
});
