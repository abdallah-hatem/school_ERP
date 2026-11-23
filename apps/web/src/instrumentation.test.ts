import { describe, expect, it } from 'vitest';
import { errorLogLine } from './instrumentation';

describe('errorLogLine (onRequestError)', () => {
  const context = { routePath: '/[locale]/(dashboard)/payroll/[id]', routeType: 'render' };

  it('carries the digest the error screen shows, so support can find the error from the code', () => {
    const err = Object.assign(new Error('db down'), { digest: '2338785109' });
    const line = JSON.parse(errorLogLine(err, { path: '/en/payroll/5', method: 'GET' }, context)) as Record<string, string>;
    expect(line).toMatchObject({
      level: 'error',
      digest: '2338785109',
      method: 'GET',
      path: '/en/payroll/5',
      route: '/[locale]/(dashboard)/payroll/[id]',
      type: 'render',
    });
    // The message is Next's own log line's business (with the same digest), not repeated here.
    expect(line).not.toHaveProperty('error');
  });

  it('logs the path without its query (it can hold search terms)', () => {
    const line = JSON.parse(errorLogLine(new Error('x'), { path: '/en/employees?q=Mona', method: 'GET' }, context)) as Record<string, unknown>;
    expect(line.path).toBe('/en/employees');
    expect(line.digest).toBeUndefined();
  });
});
