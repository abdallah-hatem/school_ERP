import express, { type Express } from 'express';
import request from 'supertest';
import { clientIp, clientIpOf, parseTrustProxy } from './client-ip';

/*
 * The client IP the rate limits count by (docs/ARCHITECTURE.md → Security): proxy headers only
 * when TRUST_PROXY names the proxy in front, CF-Connecting-IP only with TRUST_CLOUDFLARE as well
 * and only from a trusted proxy.
 */

describe('parseTrustProxy', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['  ', null],
    ['false', null],
    ['0', null],
    ['1', 1],
    ['2', 2],
    ['loopback', 'loopback'],
    ['loopback, uniquelocal', 'loopback, uniquelocal'],
    ['10.0.0.0/8', '10.0.0.0/8'],
  ])('%p → %p', (value, expected) => {
    expect(parseTrustProxy(value)).toEqual(expected);
  });
});

describe('clientIp', () => {
  const base = { ip: '10.0.0.5', socketAddress: '10.0.0.5', headers: {}, peerTrusted: false };

  it('no trusted proxy: the socket address, whatever headers claim', () => {
    const input = { ...base, headers: { 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '5.6.7.8' } };
    expect(clientIp(input, { trustCloudflare: false })).toBe('10.0.0.5');
    // Cloudflare trusted, but this peer isn't a trusted proxy: anyone could send the header.
    expect(clientIp(input, { trustCloudflare: true })).toBe('10.0.0.5');
  });

  it('CF-Connecting-IP only with Cloudflare trusted and a trusted peer; a value that is not an IP is ignored', () => {
    const through = { ...base, ip: '172.64.0.1', peerTrusted: true, headers: { 'cf-connecting-ip': '41.33.2.1' } };
    expect(clientIp(through, { trustCloudflare: true })).toBe('41.33.2.1');
    expect(clientIp(through, { trustCloudflare: false })).toBe('172.64.0.1');
    expect(clientIp({ ...through, headers: { 'cf-connecting-ip': 'evil, 1.1.1.1' } }, { trustCloudflare: true })).toBe(
      '172.64.0.1',
    );
  });

  it('an IPv4 client on a dual-stack socket counts as its IPv4 address', () => {
    expect(clientIp({ ...base, ip: '::ffff:127.0.0.1' }, { trustCloudflare: false })).toBe('127.0.0.1');
    expect(clientIp({ ...base, ip: '::1' }, { trustCloudflare: false })).toBe('::1');
  });
});

describe('clientIpOf (with Express’s own trust proxy rule)', () => {
  function server(trustProxy: number | string | null, trustCloudflare = false): Express {
    const app = express();
    if (trustProxy !== null) app.set('trust proxy', trustProxy);
    app.get('/ip', (req, res) => {
      res.json({ ip: clientIpOf(req, { trustCloudflare }) });
    });
    return app;
  }
  const ipOf = async (app: Express, headers: Record<string, string> = {}) =>
    ((await request(app).get('/ip').set(headers)).body as { ip: string }).ip;

  it('trust proxy off (the default): X-Forwarded-For is ignored', async () => {
    expect(await ipOf(server(null), { 'X-Forwarded-For': '1.2.3.4' })).toBe('127.0.0.1');
  });

  it('trusting loopback: the forwarded client, read from the right past trusted hops only', async () => {
    const app = server('loopback');
    expect(await ipOf(app, { 'X-Forwarded-For': '1.2.3.4' })).toBe('1.2.3.4');
    // A client that sends its own X-Forwarded-For can't pick its IP: the proxy appends the real one.
    expect(await ipOf(app, { 'X-Forwarded-For': '6.6.6.6, 1.2.3.4' })).toBe('1.2.3.4');
  });

  it('behind Cloudflare with TRUST_CLOUDFLARE: CF-Connecting-IP; without it, the Cloudflare edge', async () => {
    const headers = { 'X-Forwarded-For': '172.64.0.1', 'CF-Connecting-IP': '41.33.2.1' };
    expect(await ipOf(server('loopback', true), headers)).toBe('41.33.2.1');
    expect(await ipOf(server('loopback', false), headers)).toBe('172.64.0.1');
    // No trusted proxy in front: the header is ignored even with Cloudflare trusted.
    expect(await ipOf(server(null, true), headers)).toBe('127.0.0.1');
  });
});
