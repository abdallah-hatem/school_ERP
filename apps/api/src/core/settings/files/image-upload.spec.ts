import { CONTRACT_DOCUMENT_UPLOAD, EMPLOYEE_PHOTO_UPLOAD, ErrorCode, LOGO_UPLOAD } from '@school-erp/shared';
import { checkDocumentUpload, checkImageUpload, type UploadedFileLike } from './image-upload';

/*
 * Uploads are checked by their bytes (magic numbers), never by the name or the type the browser
 * declares (docs/ARCHITECTURE.md → Security). A file renamed to look like an image is refused
 * with the same 400 INVALID_FILE_TYPE as any other wrong file.
 */

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(32, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]);
const HTML = Buffer.from('<!doctype html><html><script>alert(1)</script></html>');
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');

const file = (buffer: Buffer, mimetype: string): UploadedFileLike => ({ buffer, mimetype, size: buffer.length });

function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return (e as { code?: unknown }).code ?? (e as Error).name;
  }
  return 'accepted';
}

describe('checkImageUpload', () => {
  it.each([
    ['PNG', PNG, 'image/png', 'png'],
    ['JPG', JPG, 'image/jpeg', 'jpg'],
    ['SVG', SVG, 'image/svg+xml', 'svg'],
  ])('a real %s logo is accepted with its type from the bytes', (_, buffer, mimetype, type) => {
    expect(checkImageUpload(file(buffer, mimetype), LOGO_UPLOAD)).toEqual({ type, buffer });
  });

  it('a real WebP photo is accepted', () => {
    expect(checkImageUpload(file(WEBP, 'image/webp'), EMPLOYEE_PHOTO_UPLOAD).type).toBe('webp');
  });

  it.each([
    ['a program renamed photo.png', EXE, 'image/png'],
    ['an HTML page renamed logo.png', HTML, 'image/png'],
    ['a PDF renamed logo.jpg', PDF, 'image/jpeg'],
    ['an HTML page renamed logo.svg', HTML, 'image/svg+xml'],
    ['plain text', Buffer.from('hello'), 'text/plain'],
    ['an empty file', Buffer.alloc(0), 'image/png'],
  ])('%s → 400 INVALID_FILE_TYPE', (_, buffer, mimetype) => {
    expect(codeOf(() => checkImageUpload(file(buffer, mimetype), LOGO_UPLOAD))).toBe(ErrorCode.INVALID_FILE_TYPE);
  });

  it('real image bytes under another image type (a JPG sent as image/png) → refused: name and bytes must agree', () => {
    expect(codeOf(() => checkImageUpload(file(JPG, 'image/png'), LOGO_UPLOAD))).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(codeOf(() => checkImageUpload(file(PNG, 'application/octet-stream'), LOGO_UPLOAD))).toBe(
      ErrorCode.INVALID_FILE_TYPE,
    );
  });

  it('an image type the upload does not take → refused (WebP logo, SVG photo)', () => {
    expect(codeOf(() => checkImageUpload(file(WEBP, 'image/webp'), LOGO_UPLOAD))).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(codeOf(() => checkImageUpload(file(SVG, 'image/svg+xml'), EMPLOYEE_PHOTO_UPLOAD))).toBe(
      ErrorCode.INVALID_FILE_TYPE,
    );
  });

  it('too large → 413 FILE_TOO_LARGE; no file → 400', () => {
    const big = { ...file(PNG, 'image/png'), size: LOGO_UPLOAD.maxBytes + 1 };
    expect(codeOf(() => checkImageUpload(big, LOGO_UPLOAD))).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(codeOf(() => checkImageUpload(undefined, LOGO_UPLOAD))).toBe('BadRequestException');
  });
});

describe('checkDocumentUpload (contract documents, spec 2026-11-24)', () => {
  it.each([
    ['PDF', PDF, 'application/pdf', 'pdf'],
    ['PNG', PNG, 'image/png', 'png'],
    ['JPG', JPG, 'image/jpeg', 'jpg'],
    ['WebP', WEBP, 'image/webp', 'webp'],
  ])('a real %s letter is accepted with its type from the bytes', (_, buffer, mimetype, type) => {
    expect(checkDocumentUpload(file(buffer, mimetype), CONTRACT_DOCUMENT_UPLOAD)).toEqual({ type, buffer });
  });

  it.each([
    ['an executable renamed to .pdf', EXE, 'application/pdf'],
    ['an HTML page renamed to .pdf', HTML, 'application/pdf'],
    ['an SVG (a browser runs it)', SVG, 'image/svg+xml'],
    ['a PDF declared as an image', PDF, 'image/png'],
    ['a PNG declared as a PDF', PNG, 'application/pdf'],
  ])('%s → 400 INVALID_FILE_TYPE', (_, buffer, mimetype) => {
    expect(codeOf(() => checkDocumentUpload(file(buffer, mimetype), CONTRACT_DOCUMENT_UPLOAD))).toBe(
      ErrorCode.INVALID_FILE_TYPE,
    );
  });

  it('over 5 MB → 413 FILE_TOO_LARGE; none → 400', () => {
    const big = { buffer: PDF, mimetype: 'application/pdf', size: CONTRACT_DOCUMENT_UPLOAD.maxBytes + 1 };
    expect(codeOf(() => checkDocumentUpload(big, CONTRACT_DOCUMENT_UPLOAD))).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(codeOf(() => checkDocumentUpload(undefined, CONTRACT_DOCUMENT_UPLOAD))).toBe('BadRequestException');
  });
});
