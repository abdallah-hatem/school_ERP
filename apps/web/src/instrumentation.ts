import type { Instrumentation } from 'next';

/**
 * One line per server error, carrying the `digest` the error screen shows as its reference code, so
 * support finds the error from the code a person quotes: `docker logs <web> | grep <code>`
 * (docs/ARCHITECTURE.md → Error pages). Next also prints the error itself with its stack and the
 * same `digest`. The path is logged without its query (it can hold search terms).
 */
export function errorLogLine(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): string {
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  return JSON.stringify({
    level: 'error',
    msg: 'web request error',
    digest,
    method: request.method,
    path: request.path.split('?')[0],
    route: context.routePath,
    type: context.routeType,
    error: err instanceof Error ? err.message : String(err),
  });
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  console.error(errorLogLine(err, request, context));
};
