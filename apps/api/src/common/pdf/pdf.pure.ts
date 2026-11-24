/** The number of pages in a PDF Chromium made: its `/Type /Page` objects (not `/Pages`). */
export function pdfPageCount(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/** The queue is full, or the wait for a slot ran out: refused before any work starts. */
export class QueueBusyError extends Error {
  constructor(readonly reason: 'full' | 'timeout') {
    super(`render queue ${reason}`);
  }
}

interface Waiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | undefined;
}

/**
 * At most `size` tasks at once (edge case 17); up to `maxWaiting` wait in order, each at most
 * `waitMs`. A freed slot passes **straight to the next waiter** (the count never dips, so a newcomer
 * can't slip in ahead and run a third task).
 */
export class Semaphore {
  private running = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly size: number,
    private readonly maxWaiting = Number.POSITIVE_INFINITY,
    private readonly waitMs = 0,
  ) {}

  /** Tasks running or waiting now (for tests and logs). */
  get load(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.waiting.length };
  }

  /** A slot: resolves with its `release` (call it once). Rejects `QueueBusyError` when full or after the wait. */
  acquire(): Promise<() => void> {
    if (this.running < this.size) {
      this.running += 1;
      return Promise.resolve(this.releaser());
    }
    if (this.waiting.length >= this.maxWaiting) return Promise.reject(new QueueBusyError('full'));
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: undefined };
      if (this.waitMs > 0) {
        waiter.timer = setTimeout(() => {
          const at = this.waiting.indexOf(waiter);
          if (at >= 0) this.waiting.splice(at, 1);
          reject(new QueueBusyError('timeout'));
        }, this.waitMs);
      }
      this.waiting.push(waiter);
    });
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        // The slot changes hands: `running` stays as it is.
        next.resolve(this.releaser());
      } else {
        this.running -= 1;
      }
    };
  }
}

/**
 * `work`, or a rejection after `ms` — and on the timeout `onTimeout` runs first (closing the
 * browser context aborts the render), so the caller frees its slot only once the work is stopped.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => Promise<void> = () => Promise.resolve()): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void onTimeout()
        .catch(() => undefined)
        .then(() => reject(new Error(`timed out after ${ms} ms`)));
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
