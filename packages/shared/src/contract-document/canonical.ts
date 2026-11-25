/**
 * JSON with object keys sorted at every level, so two documents compare by their content, not by
 * the order their keys happen to be in: the stored text comes back from `jsonb` with its keys
 * reordered, and the editor writes them in its own order. The API uses it to tell whether a save
 * changed a text (a new version) and whether a printed copy's text was edited; the web editor to
 * tell whether there are unsaved changes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
