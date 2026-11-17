/**
 * Module rules (docs/ARCHITECTURE.md → Enforcing the module rules), checked on every PR.
 * A second line of defence behind the ESLint boundary rules, in case one is disabled locally.
 *
 * Module order: common ← core ← hr ← academics ← students ← the rest. Changing it is a reviewed PR.
 * What never changes: no cycles, front doors (index.ts) only, only the owner writes.
 *
 * Run per app so each uses its own tsconfig path aliases: `pnpm deps:check`.
 */
const API = '^apps/api/src/';
const WEB = '^apps/web/src/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular dependencies, between modules or inside one.',
      from: {},
      to: { circular: true },
    },

    // ── api ──────────────────────────────────────────────────────────────
    {
      name: 'api-core-not-to-modules',
      severity: 'error',
      comment: 'core never imports modules — emit an event and let the module react.',
      from: { path: `${API}core/` },
      to: { path: `${API}modules/` },
    },
    {
      name: 'api-common-is-technical',
      severity: 'error',
      comment: 'common has no business meaning: it imports neither core nor modules.',
      from: { path: `${API}common/` },
      to: { path: `${API}(core|modules)/` },
    },
    {
      name: 'api-module-front-door-only',
      severity: 'error',
      comment: "A module imports another module only through its index.ts — never its services, repositories or domain.",
      from: { path: `${API}modules/([^/]+)/` },
      to: {
        path: `${API}modules/[^/]+/`,
        pathNot: [`${API}modules/$1/`, `${API}modules/[^/]+/index\\.ts$`],
      },
    },
    {
      name: 'api-core-front-door-only',
      severity: 'error',
      comment: 'Inside core, one area imports another only through its index.ts.',
      from: { path: `${API}core/([^/]+)/` },
      to: {
        path: `${API}core/[^/]+/`,
        pathNot: [`${API}core/$1/`, `${API}core/[^/]+/index\\.ts$`],
      },
    },
    {
      name: 'api-outside-into-core-front-door-only',
      severity: 'error',
      comment: 'Modules reach core only through each core area’s index.ts.',
      from: { path: `${API}modules/` },
      to: { path: `${API}core/[^/]+/`, pathNot: `${API}core/[^/]+/index\\.ts$` },
    },

    // ── web ──────────────────────────────────────────────────────────────
    {
      name: 'web-core-shared-not-to-modules',
      severity: 'error',
      comment: 'src/core and src/shared never import src/modules.',
      from: { path: `${WEB}(core|shared|lib|store)/` },
      to: { path: `${WEB}modules/` },
    },
    {
      name: 'web-module-front-door-only',
      severity: 'error',
      comment: 'A frontend module imports another only through its index.ts.',
      from: { path: `${WEB}modules/([^/]+)/` },
      to: {
        path: `${WEB}modules/[^/]+/`,
        pathNot: [`${WEB}modules/$1/`, `${WEB}modules/[^/]+/index\\.tsx?$`],
      },
    },

    // ── packages/shared ─────────────────────────────────────────────────
    {
      name: 'shared-no-framework',
      severity: 'error',
      comment: 'packages/shared is plain TypeScript: no NestJS, React, Next.js or Prisma.',
      from: { path: '^packages/shared/' },
      to: { path: 'node_modules/(@nestjs|react|react-dom|next|@prisma|prisma)(/|$)' },
    },
    {
      name: 'shared-no-unresolved-packages',
      severity: 'error',
      comment: 'packages/shared must not import packages it does not declare (e.g. a framework).',
      from: { path: '^packages/shared/src/' },
      to: { couldNotResolve: true },
    },
    {
      name: 'shared-not-into-apps',
      severity: 'error',
      comment: 'packages/shared never imports from the apps.',
      from: { path: '^packages/shared/' },
      to: { path: '^apps/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|\\.next|coverage)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)' },
    },
  },
};
