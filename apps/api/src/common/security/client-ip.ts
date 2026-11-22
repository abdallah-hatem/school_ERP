import { isIP } from 'node:net';
import type { Request } from 'express';

/*
 * Who is calling: the client IP the rate limits count by (docs/ARCHITECTURE.md → Security).
 * Proxy headers are believed only when the deployment says a proxy sits in front (TRUST_PROXY),
 * and Cloudflare's `CF-Connecting-IP` only when TRUST_CLOUDFLARE is on as well.
 */

/**
 * The `TRUST_PROXY` env value as Express's `trust proxy` setting: null when unset, empty, `false`
 * or `0` (trust nobody); a hop count; or the addresses / presets as written
 * (`loopback, uniquelocal`, `10.0.0.0/8`).
 */
export function parseTrustProxy(value: string | undefined): number | string | null {
  const v = value?.trim() ?? '';
  if (v === '' || v.toLowerCase() === 'false') return null;
  if (/^\d+$/.test(v)) return Number(v) === 0 ? null : Number(v);
  return v;
}

/** `::ffff:1.2.3.4` (an IPv4 client on a dual-stack socket) counts as `1.2.3.4`. */
function normalize(ip: string): string {
  const v = ip.trim();
  return v.startsWith('::ffff:') && isIP(v.slice(7)) === 4 ? v.slice(7) : v;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** What `clientIp` reads from a request: plain values, so it is tested without Express. */
export interface ClientIpInput {
  /** Express's `req.ip`: the socket's address, or the forwarded one when `trust proxy` allows it. */
  ip: string | undefined;
  /** The socket's own address (the proxy in front, if any). */
  socketAddress: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  /** Whether the socket's address is a proxy `trust proxy` trusts. */
  peerTrusted: boolean;
}

/**
 * The client's IP: `CF-Connecting-IP` when Cloudflare is trusted and the request came through a
 * trusted proxy (anyone else could send that header), else Express's `req.ip` (which already
 * follows `X-Forwarded-For` as far as `trust proxy` allows, and is the socket's address without it).
 */
export function clientIp(input: ClientIpInput, opts: { trustCloudflare: boolean }): string {
  if (opts.trustCloudflare && input.peerTrusted) {
    const cf = firstHeader(input.headers['cf-connecting-ip'])?.trim();
    if (cf && isIP(cf)) return normalize(cf);
  }
  return normalize(input.ip ?? input.socketAddress ?? 'unknown');
}

type TrustFn = (address: string, hop: number) => boolean;

/** `clientIp` for an Express request, with the app's compiled `trust proxy` rule. */
export function clientIpOf(req: Request, opts: { trustCloudflare: boolean }): string {
  const socketAddress = req.socket?.remoteAddress;
  const trust = req.app?.get('trust proxy fn') as TrustFn | undefined;
  return clientIp(
    {
      ip: req.ip,
      socketAddress,
      headers: req.headers,
      peerTrusted: Boolean(socketAddress && trust?.(socketAddress, 0)),
    },
    opts,
  );
}
