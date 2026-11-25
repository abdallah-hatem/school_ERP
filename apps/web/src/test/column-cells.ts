import ts from 'typescript';

/*
 * The table-column scan behind `column-skeletons.guard.test.ts`. It finds every column a file
 * builds for a `DataTable` and reports the ones that declare no `skeleton` although their cell is
 * not provably one line of plain text: the only cell DataTable's default skeleton (one
 * `<SkeletonText />` line) traces at the loaded row's height.
 *
 * A column is an object literal with a `cell` beside a `header` (or spread in from shared parts),
 * or a call to a column builder in the same file (`col('net', (line) => …)`, `money('net', {…})`):
 * the builder is evaluated with the call's arguments, spreads and all (`...runColumn('net', t)`,
 * `...RUN_COLUMN_LAYOUT[id]`), so a `skeleton` set in shared parts counts and a cell passed in is
 * the one checked. A spread the scan can't follow (an imported helper) counts as no skeleton: the
 * column then declares its own.
 */

export interface ColumnFinding {
  /** The column's `id`, or `?` when it is computed. */
  id: string;
  line: number;
  /** Why the cell isn't one plain line of text. */
  reason: string;
}

/**
 * Elements a one-line cell may render, each inline text at the table's own size: a `span`, `bdi`,
 * `a` or `Link` around text, `BidiText` (an isolated span), `Money` (one figure; it has no
 * sub-line) and `Days` (one figure and its unit). Anything else — a pill, badge, chip, avatar or
 * avatar stack, button, icon, an identity or any stacked cell, a component of the page's own — is
 * not provably one line, so its column declares a `skeleton`.
 */
export const ONE_LINE_TAGS = new Set([
  'span',
  'bdi',
  'a',
  'Link',
  'BidiText',
  'Money',
  'Days',
  // payroll-bits: one `Money` figure, coloured (a deduction) or signed (+500.00 / -250.00).
  'DeductionAmount',
  'SignedAmount',
]);

/**
 * Functions whose result is text, never an element: the translator, the shared formatters
 * (`formatMoney`, `formatMonth`, `formatCount`…), a record's name in the screen's language
 * (`nameIn`, `localName`), `String`.
 */
export function isTextFunction(name: string): boolean {
  return ['t', 'nameIn', 'localName', 'String'].includes(name) || /^format[A-Z]/.test(name);
}

/**
 * Classes that make an element taller than one text line: a stack or grid, vertical padding or a
 * fixed height, a pill's round box, a border, larger text or line height.
 */
const TALL_CLASS = /(^|\s)!?(flex-col|grid|p[ytb]?-|h-|min-h-|size-|rounded-full|border|leading-|text-(base|lg|xl|[2-9]xl))/;

type Env = Map<string, ts.Expression | undefined>;

function unwrap(e: ts.Expression | undefined): ts.Expression | undefined {
  while (e && (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e))) e = e.expression;
  return e;
}

function nameOf(p: ts.ObjectLiteralElementLike): string | undefined {
  return p.name !== undefined && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined;
}

class FileScan {
  private readonly locals = new Map<string, ts.Node>();

  constructor(file: ts.SourceFile) {
    const visit = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) this.locals.set(n.name.text, n.initializer);
      if (ts.isFunctionDeclaration(n) && n.name) this.locals.set(n.name.text, n);
      ts.forEachChild(n, visit);
    };
    visit(file);
  }

  /** A local function's parameters and every expression it returns (its expression body, or each `return`). */
  private fn(name: string): { params: ts.NodeArray<ts.ParameterDeclaration>; returns: ts.Expression[] } | undefined {
    let node = this.locals.get(name);
    if (node && ts.isExpression(node)) node = unwrap(node);
    if (!node || !(ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) || !node.body) return undefined;
    if (!ts.isBlock(node.body)) return { params: node.parameters, returns: [node.body] };
    const returns: ts.Expression[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isReturnStatement(n) && n.expression) returns.push(n.expression);
      // A nested function's returns are its own.
      else if (!ts.isFunctionLike(n)) ts.forEachChild(n, visit);
    };
    ts.forEachChild(node.body, visit);
    return returns.length ? { params: node.parameters, returns } : undefined;
  }

  private bind(params: ts.NodeArray<ts.ParameterDeclaration>, args: readonly ts.Expression[]): Env {
    const env: Env = new Map();
    params.forEach((p, i) => {
      if (ts.isIdentifier(p.name)) env.set(p.name.text, args[i] ?? p.initializer);
    });
    return env;
  }

  /** A string an expression stands for (`'net'`, or a parameter bound to one). */
  private literal(e: ts.Expression, env: Env): string | undefined {
    const u = unwrap(e);
    if (!u) return undefined;
    if (ts.isStringLiteralLike(u)) return u.text;
    if (ts.isIdentifier(u) && env.has(u.text)) {
      const bound = env.get(u.text);
      return bound ? this.literal(bound, new Map()) : undefined;
    }
    return undefined;
  }

  /**
   * The properties an expression spreads into a column, each with the expression and environment it
   * came from; `unresolved` when some part of it couldn't be followed.
   */
  props(expr: ts.Expression | undefined, env: Env, depth = 0): { props: Map<string, { value: ts.Expression; env: Env }>; unresolved: boolean } {
    const out = { props: new Map<string, { value: ts.Expression; env: Env }>(), unresolved: false };
    const e = unwrap(expr);
    if (!e || depth > 8) return { ...out, unresolved: true };
    const merge = (r: ReturnType<FileScan['props']>) => {
      for (const [k, v] of r.props) out.props.set(k, v);
      out.unresolved ||= r.unresolved;
    };
    if (ts.isObjectLiteralExpression(e)) {
      for (const p of e.properties) {
        if (ts.isSpreadAssignment(p)) merge(this.props(p.expression, env, depth + 1));
        else if (ts.isPropertyAssignment(p) && nameOf(p)) out.props.set(nameOf(p)!, { value: p.initializer, env });
        else if (ts.isShorthandPropertyAssignment(p)) out.props.set(p.name.text, { value: p.name, env });
        else if (ts.isMethodDeclaration(p) && nameOf(p)) out.props.set(nameOf(p)!, { value: p as unknown as ts.Expression, env });
      }
      return out;
    }
    if (ts.isConditionalExpression(e)) {
      merge(this.props(e.whenTrue, env, depth + 1));
      merge(this.props(e.whenFalse, env, depth + 1));
      return out;
    }
    if (ts.isIdentifier(e)) {
      if (env.has(e.text)) return this.props(env.get(e.text), new Map(), depth + 1);
      const init = this.locals.get(e.text);
      return init && ts.isExpression(init) ? this.props(init, new Map(), depth + 1) : { ...out, unresolved: true };
    }
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
      const key = ts.isPropertyAccessExpression(e) ? e.name.text : this.literal(e.argumentExpression, env);
      const owner = this.props(e.expression, env, depth + 1);
      const hit = key === undefined ? undefined : owner.props.get(key);
      return hit ? this.props(hit.value, hit.env, depth + 1) : { ...out, unresolved: true };
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const f = this.fn(e.expression.text);
      if (!f || f.returns.length !== 1) return { ...out, unresolved: true };
      return this.props(f.returns[0], this.bind(f.params, e.arguments), depth + 1);
    }
    return { ...out, unresolved: true };
  }

  /** `null` when `node` renders one plain line of text; otherwise why not. */
  notOneLine(node: ts.Node, env: Env, depth = 0): string | null {
    if (depth > 8) return 'it is too deep to follow';
    const each = (nodes: readonly ts.Node[]) => {
      for (const n of nodes) {
        const r = this.notOneLine(n, env, depth + 1);
        if (r) return r;
      }
      return null;
    };
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      ts.isJsxText(node)
    ) {
      return null;
    }
    if (ts.isIdentifier(node)) return null;
    if (ts.isTemplateExpression(node)) return each(node.templateSpans.map((s) => s.expression));
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node)) return this.notOneLine(node.expression, env, depth + 1);
    if (ts.isConditionalExpression(node)) return each([node.whenTrue, node.whenFalse]);
    if (ts.isBinaryExpression(node)) return each([node.left, node.right]);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
      if (name !== undefined && isTextFunction(name)) return null;
      // A helper of the file's own (`money(value)`): what it returns.
      const f = ts.isIdentifier(callee) ? this.fn(callee.text) : undefined;
      if (f) {
        const env = this.bind(f.params, node.arguments);
        for (const r of f.returns) {
          const why = this.notOneLine(r, env, depth + 1);
          if (why) return `${name}(…) returns what isn't one line: ${why}`;
        }
        return null;
      }
      return `it calls ${name ?? 'a function'}(…), which may return an element`;
    }
    if (ts.isJsxExpression(node)) return node.expression ? this.notOneLine(node.expression, env, depth + 1) : null;
    if (ts.isJsxFragment(node)) return each(node.children);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText();
      if (!ONE_LINE_TAGS.has(tag)) return `it renders <${tag}>`;
      for (const attr of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) return `<${tag} {...spread}>`;
        if (attr.name.getText() !== 'className' || !attr.initializer) continue;
        const init = attr.initializer;
        const text = ts.isStringLiteral(init)
          ? init.text
          : ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
            ? init.expression.text
            : undefined;
        // `className={bold ? 'font-bold' : undefined}`: each branch a plain string.
        const branches =
          text === undefined && ts.isJsxExpression(init) && init.expression && ts.isConditionalExpression(init.expression)
            ? [init.expression.whenTrue, init.expression.whenFalse].map((b) => (ts.isStringLiteralLike(b) ? b.text : b.kind === ts.SyntaxKind.Identifier && b.getText() === 'undefined' ? '' : undefined))
            : [text];
        for (const cls of branches) {
          if (cls === undefined) return `<${tag}> has a computed className (cn(…)), whose shape can be anything`;
          const m = TALL_CLASS.exec(cls);
          if (m) return `<${tag} className="${cls}"> has "${m[2]}", not one text line`;
        }
      }
      return ts.isJsxElement(node) ? each(node.children) : null;
    }
    return `it renders a ${ts.SyntaxKind[node.kind]}`;
  }

  /** Why a column's cell (as the column holds it) isn't one plain line; `null` when it is. */
  cellReason(cell: { value: ts.Expression; env: Env }): string | null {
    let fn = unwrap(cell.value);
    if (fn && ts.isIdentifier(fn) && cell.env.has(fn.text)) fn = unwrap(cell.env.get(fn.text));
    if (!fn) return 'its cell is passed in from elsewhere, so its shape is unknown here';
    if (ts.isMethodDeclaration(fn as ts.Node)) return 'its cell is a method with a body';
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return 'its cell is passed in from elsewhere, so its shape is unknown here';
    if (ts.isBlock(fn.body)) return 'its cell has a function body (its branches can render anything)';
    return this.notOneLine(fn.body, cell.env);
  }
}

/** The function `node` is the returned object of (a column builder's template, checked at its calls), if any. */
function builderOf(node: ts.Node): ts.SignatureDeclaration | undefined {
  let p = node.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p))) p = p.parent;
  if (p && ts.isArrowFunction(p)) return p;
  if (p && ts.isReturnStatement(p)) {
    let f: ts.Node | undefined = p.parent;
    while (f && !ts.isFunctionLike(f)) f = f.parent;
    return f;
  }
  return undefined;
}

function isExported(fn: ts.SignatureDeclaration): boolean {
  const holder = ts.isFunctionDeclaration(fn) ? fn : fn.parent && ts.isVariableDeclaration(fn.parent) ? fn.parent.parent?.parent : undefined;
  return !!holder && ts.canHaveModifiers(holder) && !!ts.getModifiers(holder)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

export interface ColumnScan {
  /** How many columns the file builds (literals and calls to its own builders). */
  columns: number;
  /** The columns with no `skeleton` whose cell isn't one plain text line. */
  missing: ColumnFinding[];
}

/** Scans a `.tsx` file's text for its table columns. */
export function scanColumns(fileName: string, source: string): ColumnScan {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scan = new FileScan(file);
  const missing: ColumnFinding[] = [];
  let columns = 0;
  const lineOf = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const idOf = (idProp: { value: ts.Expression; env: Env } | undefined) => {
    let id = idProp ? unwrap(idProp.value) : undefined;
    if (id && ts.isIdentifier(id) && idProp!.env.has(id.text)) id = unwrap(idProp!.env.get(id.text));
    return id && ts.isStringLiteralLike(id) ? id.text : '?';
  };
  const check = (node: ts.Expression) => {
    const { props } = scan.props(node, new Map());
    const cell = props.get('cell');
    if (!cell || !props.has('header')) return;
    columns++;
    if (props.has('skeleton')) return;
    const reason = scan.cellReason(cell);
    if (reason) missing.push({ id: idOf(props.get('id')), line: lineOf(node), reason });
  };
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node) && node.properties.some((p) => nameOf(p) === 'cell')) {
      const builder = builderOf(node);
      if (builder) {
        // A builder other files call (`rowActionsColumn`): the cells its callers pass are checked
        // nowhere else, so it carries the skeleton itself.
        const { props } = scan.props(node, new Map());
        if (isExported(builder) && props.has('header') && !props.has('skeleton')) {
          missing.push({
            id: idOf(props.get('id')),
            line: lineOf(node),
            reason: 'an exported column builder declares its own skeleton (the cells its callers pass are checked nowhere else)',
          });
        }
      } else if (node.properties.some((p) => nameOf(p) === 'header' || ts.isSpreadAssignment(p))) {
        // A column literal (a `cell` with its header or shared parts), not a builder's `extra` overrides.
        check(node);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && !(node.parent && ts.isSpreadAssignment(node.parent))) {
      // A call to the file's own column builder: the column it returns, with these arguments.
      check(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { columns, missing };
}
