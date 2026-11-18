import { StreamableFile } from '@nestjs/common';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** An `.xlsx` download: the body of a controller handler that returns a spreadsheet. */
export function xlsxFile({ fileName, content }: { fileName: string; content: Buffer }): StreamableFile {
  return new StreamableFile(content, {
    type: XLSX_CONTENT_TYPE,
    disposition: `attachment; filename="${fileName}"`,
    length: content.length,
  });
}
