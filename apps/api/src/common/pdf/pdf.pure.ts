/** The number of pages in a PDF Chromium made: its `/Type /Page` objects (not `/Pages`). */
export function pdfPageCount(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/** Runs at most `size` tasks at once; the rest wait in order (edge case 17). */
export class Semaphore {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly size: number) {}

  /** Tasks running or waiting now (for tests and logs). */
  get load(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.waiting.length };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.size) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }
}

/** `promise`, or a rejection after `ms` (the render is abandoned; its context is closed by the caller's finally). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
