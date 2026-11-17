import path from 'node:path';
import { defineConfig } from 'prisma/config';

// db:* scripts inline DATABASE_URL (never trust an ambient one). Prisma skips .env loading when
// this file exists, which is what we want.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
});
