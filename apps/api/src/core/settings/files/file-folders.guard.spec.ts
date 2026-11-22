import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * Guard: every folder the app stores files in has an owner who decides who may open them
 * (docs/ARCHITECTURE.md → Security → Files follow their record; docs/CONVENTIONS.md → Security).
 * It scans the source for `files.save(<FOLDER>, …)` and fails on a folder that is neither public
 * (`PUBLIC_FILE_FOLDERS`: the logo, the app icons) nor registered with `FileFolders.register`.
 * (At run time `FileStorageService.save` refuses such a folder too; this catches it before.)
 */

const SRC = join(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The public folders' constants (`PUBLIC_FILE_FOLDERS = [LOGO_FOLDER, APP_ICON_FOLDER]`). */
const PUBLIC_CONSTANTS = ['LOGO_FOLDER', 'APP_ICON_FOLDER'];

/** Saves whose folder is a variable, each with why it is safe. */
const VARIABLE_FOLDER_SAVES: Record<string, string> = {
  'core/settings/files/svg-logo.ts': 'the logo folder, passed in by the public logo route',
};

describe('file folders guard', () => {
  const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));
  const registered = new Set(files.flatMap((f) => [...f.text.matchAll(/\.register\(\s*([A-Z][A-Z0-9_]*)\s*,/g)].map((m) => m[1])));
  const saves = files.flatMap((f) =>
    [...f.text.matchAll(/\bfiles\.save\(\s*([^,\s]+)\s*,/g)].map((m) => ({ file: f.path, folder: m[1] ?? '' })),
  );

  it('finds the saves it guards (the scan works)', () => {
    expect(saves.map((s) => s.folder)).toEqual(expect.arrayContaining(['LOGO_FOLDER', 'EMPLOYEE_PHOTO_FOLDER']));
    expect(registered.has('EMPLOYEE_PHOTO_FOLDER')).toBe(true);
  });

  it('every folder stored into is public or has a registered owner', () => {
    const unowned = saves.filter(({ file, folder }) => {
      if (PUBLIC_CONSTANTS.includes(folder) || registered.has(folder)) return false;
      if (/^[a-z]\w*$/.test(folder) && VARIABLE_FOLDER_SAVES[file]) return false;
      return true;
    });
    expect(unowned).toEqual([]);
  });
});
