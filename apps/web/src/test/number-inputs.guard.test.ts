import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * Guard: money and grouped figures go through the shared engine — `MoneyField` / `MoneyInput` /
 * `NumberField` in `shared/components/form/fields.tsx`, or `GroupedNumberInput` — which groups
 * thousands live while typing and completes on blur. A raw `<Input>` / `<input>` with
 * `inputMode="decimal"` / `"numeric"` or `type="number"` is a hand-rolled number box that doesn't,
 * so it fails here. Codes typed as digits (national ID, insurance number) use `TextField`, which
 * this doesn't flag.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED = ['shared/components/form/', 'shared/components/ui/grouped-number-input.tsx'];
const RAW_TAGS = new Set(['Input', 'input']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

function attrText(attr: ts.JsxAttribute): string | null {
  const init = attr.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text;
  return null;
}

/** `file:line <tag ...>` for each raw number input in the file. */
function rawNumberInputs(fileName: string, code: string): string[] {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && RAW_TAGS.has(node.tagName.getText(sf))) {
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText(sf);
        const value = attrText(prop);
        if ((name === 'inputMode' && (value === 'decimal' || value === 'numeric')) || (name === 'type' && value === 'number')) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          hits.push(`${fileName}:${line} <${node.tagName.getText(sf)} ${name}="${value}">`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe('number inputs go through the shared engine', () => {
  it('flags a raw Input with inputMode="decimal", and leaves the shared fields alone', () => {
    expect(rawNumberInputs('x.tsx', '<Input inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} />')).toHaveLength(1);
    expect(rawNumberInputs('x.tsx', "<input type={'number'} />")).toHaveLength(1);
    expect(rawNumberInputs('x.tsx', '<Input inputMode="numeric">x</Input>')).toHaveLength(1);
    expect(rawNumberInputs('x.tsx', '<MoneyInput value={v} onChange={set} />')).toEqual([]);
    expect(rawNumberInputs('x.tsx', '<TextField inputMode="numeric" name="nationalId" />')).toEqual([]);
    expect(rawNumberInputs('x.tsx', '<Input inputMode="email" />')).toEqual([]);
  });

  it('no raw <Input>/<input> takes a number anywhere in apps/web/src outside shared/components/form', () => {
    const hits = sourceFiles(SRC)
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((rel) => !ALLOWED.some((allowed) => rel.startsWith(allowed)))
      .flatMap((rel) => rawNumberInputs(rel, readFileSync(join(SRC, rel), 'utf8')));
    expect(
      hits,
      `Raw number inputs don't group thousands while typing. Use MoneyField (in a form) or MoneyInput (outside one) from ` +
        `@/shared/components/form/fields for money, NumberField or GroupedNumberInput for other figures:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
