import { describe, expect, it } from 'vitest';
import {
  apiOrigin,
  clientAddressHeaders,
  contentSecurityPolicy,
  createNonce,
  STATIC_SECURITY_HEADERS,
} from './security-headers';

/** The policy as directive → values, to check one directive at a time. */
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  const prod = directives(contentSecurityPolicy({ nonce: 'abc123==', dev: false, apiOrigin: 'https://api.school.test' }));

  it('scripts: only this response’s nonce and what it loads; no eval in production', () => {
    expect(prod['script-src']).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(prod['script-src']).not.toContain("'unsafe-inline'");
  });

  it('development adds unsafe-eval to scripts, nothing else', () => {
    const dev = directives(contentSecurityPolicy({ nonce: 'n', dev: true, apiOrigin: null }));
    expect(dev['script-src']).toContain("'unsafe-eval'");
    expect(dev['style-src']).toEqual(prod['style-src']);
  });

  it('the rest of the policy', () => {
    expect(prod).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'nonce-abc123=='", "'strict-dynamic'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https://api.school.test'],
      'font-src': ["'self'"],
      'connect-src': ["'self'", 'https://api.school.test'],
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
    });
  });

  it('no API origin known → images and connections from this app only', () => {
    const none = directives(contentSecurityPolicy({ nonce: 'n', dev: false, apiOrigin: null }));
    expect(none['img-src']).toEqual(["'self'", 'data:', 'blob:']);
    expect(none['connect-src']).toEqual(["'self'"]);
  });
});

describe('createNonce', () => {
  it('128 random bits, base64, new every time', () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const n of nonces) {
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(atob(n)).toHaveLength(16);
    }
  });
});

describe('apiOrigin', () => {
  it('API_PUBLIC_ORIGIN first, else BASE_URL’s origin, else none', () => {
    expect(apiOrigin({ API_PUBLIC_ORIGIN: 'https://api.school.test/x', BASE_URL: 'http://api:3001' })).toBe(
      'https://api.school.test',
    );
    expect(apiOrigin({ BASE_URL: 'http://localhost:3001/' })).toBe('http://localhost:3001');
    expect(apiOrigin({ BASE_URL: 'not a url' })).toBeNull();
    expect(apiOrigin({})).toBeNull();
  });
});

describe('static headers', () => {
  it('nosniff, referrer policy, no framing, camera / microphone / geolocation off', () => {
    expect(Object.fromEntries(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]))).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });
});

describe('clientAddressHeaders', () => {
  it('passes on the client-address headers only', () => {
    const from = new Headers({
      'x-forwarded-for': '41.33.2.1, 172.64.0.1',
      'cf-connecting-ip': '41.33.2.1',
      cookie: 'auth_token=secret',
      authorization: 'Bearer x',
    });
    expect(clientAddressHeaders(from)).toEqual({
      'x-forwarded-for': '41.33.2.1, 172.64.0.1',
      'cf-connecting-ip': '41.33.2.1',
    });
    expect(clientAddressHeaders(new Headers())).toEqual({});
  });
});
