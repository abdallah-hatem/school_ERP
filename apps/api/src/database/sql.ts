import { Prisma } from '@prisma/client';

/**
 * A UTC instant as a `timestamp(3)` literal — the columns hold UTC without a zone (as Prisma
 * writes them), so a raw statement never depends on the connection's TimeZone.
 */
export const utcTimestamp = (d: Date): Prisma.Sql =>
  Prisma.sql`${d.toISOString().replace('Z', '')}::timestamp(3)`;
