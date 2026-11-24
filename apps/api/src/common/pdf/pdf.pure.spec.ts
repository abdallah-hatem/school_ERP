import { pdfPageCount, Semaphore, withTimeout } from './pdf.pure';

describe('pdfPageCount', () => {
  it('counts /Type /Page objects, not the /Pages tree', () => {
    const pdf = Buffer.from('<< /Type /Pages /Count 2 >>\n<< /Type /Page >>\n<</Type/Page/Parent 1 0 R>>', 'latin1');
    expect(pdfPageCount(pdf)).toBe(2);
  });
});

describe('Semaphore', () => {
  it('edge case 17 — many prints at once: at most two renders at a time, the rest wait in order', async () => {
    const slots = new Semaphore(2);
    let running = 0;
    let most = 0;
    const order: number[] = [];
    const task = (n: number) => async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      order.push(n);
      running -= 1;
      return n;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => slots.run(task(n))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(most).toBe(2);
    expect(slots.load).toEqual({ running: 0, waiting: 0 });
  });

  it('a failing task frees its slot', async () => {
    const slots = new Semaphore(1);
    await expect(slots.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(slots.run(() => Promise.resolve('next'))).resolves.toBe('next');
  });
});

describe('withTimeout', () => {
  it('edge case 16 — a render over the limit fails', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10)).rejects.toThrow('timed out');
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});
