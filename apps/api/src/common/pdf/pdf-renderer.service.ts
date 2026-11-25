import { readFileSync } from 'node:fs';
import { HttpStatus, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@school-erp/shared';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import { CodedException } from '../errors/coded.exception';
import { pdfPageCount, QueueBusyError, Semaphore, withTimeout } from './pdf.pure';

/** The page the HTML is served at inside the browser: never a real host, nothing else loads. */
const PAGE_URL = 'http://pdf.invalid/';

export interface PdfOptions {
  /** Chromium's footer template (`<span class="pageNumber">`, `totalPages`), escaped by the caller. */
  footerTemplate?: string;
}

export interface RenderedPdf {
  pdf: Buffer;
  pageCount: number;
}

/**
 * HTML → A4 PDF with headless Chromium (contract templates spec → PDF, DECIDED owner 2026-11-24).
 * One browser kept warm; each render gets its own context with **JavaScript off and every request
 * blocked** (the page is ours, served from memory; fonts and the logo are data URLs), at most
 * `PDF_RENDER_CONCURRENCY` at once, at most `PDF_RENDER_QUEUE_SIZE` waiting, each for at most
 * `PDF_RENDER_QUEUE_WAIT_MS` (else 503 `PDF_RENDER_BUSY`), and `PDF_RENDER_TIMEOUT_MS` each — a failure or a slow
 * render is `PDF_RENDER_FAILED` (503) and nothing is kept (edge cases 16, 17).
 */
@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private readonly slots: Semaphore;
  private readonly timeoutMs: number;
  private readonly chromiumPath: string | null;
  private browser: Promise<Browser> | null = null;

  constructor(config: ConfigService) {
    const pdf = config.get<{ chromiumPath: string | null; concurrency: number; timeoutMs: number; queueSize: number; queueWaitMs: number }>('pdf');
    this.slots = new Semaphore(pdf?.concurrency ?? 2, pdf?.queueSize ?? 10, pdf?.queueWaitMs ?? 30_000);
    this.timeoutMs = pdf?.timeoutMs ?? 20_000;
    this.chromiumPath = pdf?.chromiumPath ?? null;
  }

  /**
   * Waits for a slot (refused at once with 503 `PDF_RENDER_BUSY` when the queue is full, or when the
   * wait runs out — before any render starts, so an abandoned request never keeps a copy later),
   * then renders within the time limit. On a timeout the context is closed (aborting `page.pdf`)
   * and only then is the slot freed.
   */
  async render(html: string, options: PdfOptions = {}): Promise<RenderedPdf> {
    let release: () => void;
    try {
      release = await this.slots.acquire();
    } catch (error) {
      if (error instanceof QueueBusyError) {
        this.logger.warn(`PDF render refused: queue ${error.reason}`);
        throw new CodedException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.PDF_RENDER_BUSY);
      }
      throw error;
    }
    try {
      return await this.renderNow(html, options);
    } catch (error) {
      this.logger.error(`PDF render failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new CodedException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.PDF_RENDER_FAILED);
    } finally {
      release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) await (await browser.catch(() => null))?.close().catch(() => undefined);
  }

  private async renderNow(html: string, options: PdfOptions): Promise<RenderedPdf> {
    let context: BrowserContext | null = null;
    const closeContext = async () => {
      await context?.close().catch(() => undefined);
    };
    try {
      return await withTimeout(
        (async () => {
          const browser = await this.launch();
          context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
          const page = await context.newPage();
          // Our page is answered from memory; any other request (a stray URL in a text) is refused.
          await page.route('**/*', (route) =>
            route.request().url() === PAGE_URL
              ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
              : route.abort('blockedbyclient'),
          );
          await page.goto(PAGE_URL, { waitUntil: 'load' });
          const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
            displayHeaderFooter: options.footerTemplate !== undefined,
            headerTemplate: '<span></span>',
            footerTemplate: options.footerTemplate ?? '<span></span>',
          });
          return { pdf, pageCount: pdfPageCount(pdf) };
        })(),
        this.timeoutMs,
        closeContext,
      );
    } finally {
      await closeContext();
    }
  }

  /** The warm browser, launched on first use and again after a crash. */
  private launch(): Promise<Browser> {
    if (!this.browser) {
      const launching = chromium.launch({
        headless: true,
        ...(this.chromiumPath ? { executablePath: this.chromiumPath } : {}),
      });
      this.browser = launching;
      launching
        .then((b) =>
          b.on('disconnected', () => {
            if (this.browser === launching) this.browser = null;
          }),
        )
        .catch(() => {
          if (this.browser === launching) this.browser = null;
        });
    }
    return this.browser;
  }
}

/** A bundled font file as a data URL (OFL fonts from @fontsource, shipped in the image). */
export function fontDataUrl(packageFile: string): string {
  return `data:font/woff2;base64,${readFileSync(require.resolve(packageFile)).toString('base64')}`;
}
