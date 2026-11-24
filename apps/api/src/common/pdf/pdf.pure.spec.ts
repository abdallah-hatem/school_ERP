import { pdfPageCount, QueueBusyError, Semaphore, withTimeout } from './pdf.pure';

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
    const task = (n: number) => async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return n;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => slots.run(task(n))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(most).toBe(2);
    expect(slots.load).toEqual({ running: 0, waiting: 0 });
  });

  it('a freed slot passes straight to the waiter: a newcomer can’t start a third render', async () => {
    const slots = new Semaphore(1);
    const first = await slots.acquire();
    const waiter = slots.acquire();
    first();
    // The slot is the waiter's now; a newcomer must wait.
    let newcomerGotIn = false;
    const newcomer = slots.acquire().then((release) => {
      newcomerGotIn = true;
      return release;
    });
    const second = await waiter;
    await Promise.resolve();
    expect(newcomerGotIn).toBe(false);
    expect(slots.load).toEqual({ running: 1, waiting: 1 });
    second();
    (await newcomer)();
    expect(slots.load).toEqual({ running: 0, waiting: 0 });
  });

  it('edge case 17 — a full queue is refused at once, and a wait that runs out is refused too', async () => {
    const slots = new Semaphore(1, 1, 20);
    const held = await slots.acquire();
    const waiting = slots.acquire();
    await expect(slots.acquire()).rejects.toEqual(new QueueBusyError('full'));
    await expect(waiting).rejects.toEqual(new QueueBusyError('timeout'));
    expect(slots.load).toEqual({ running: 1, waiting: 0 });
    held();
    expect(slots.load).toEqual({ running: 0, waiting: 0 });
  });

  it('a failing task frees its slot; releasing twice frees it once', async () => {
    const slots = new Semaphore(1);
    await expect(slots.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    const release = await slots.acquire();
    release();
    release();
    expect(slots.load).toEqual({ running: 0, waiting: 0 });
  });
});

describe('withTimeout', () => {
  it('edge case 16 — a render over the limit is stopped first (the context closed), then fails', async () => {
    const order: string[] = [];
    const work = new Promise<string>(() => undefined);
    await expect(
      withTimeout(work, 10, () => {
        order.push('closed');
        return Promise.resolve();
      }).catch((e: Error) => {
        order.push('failed');
        throw e;
      }),
    ).rejects.toThrow('timed out');
    expect(order).toEqual(['closed', 'failed']);
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});
