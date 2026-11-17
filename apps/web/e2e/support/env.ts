/**
 * What the smoke specs need from their environment. `pnpm smoke` (scripts/smoke.sh) sets all of
 * it; pointing the specs at another environment only changes these variables.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`smoke: ${name} is not set — run the specs through \`pnpm smoke\``);
  return value;
}

export const env = {
  /** The web app the browser opens. */
  get baseUrl(): string {
    return process.env.BASE_URL ?? 'http://localhost:4181';
  },
  /** The API, called directly by the specs to read the state they meet. */
  get apiUrl(): string {
    return process.env.API_URL ?? 'http://localhost:4180';
  },
  /** The seeded HR admin's password (generated per run by the smoke script). */
  get adminPassword(): string {
    return required('SEED_ADMIN_PASSWORD');
  },
};
