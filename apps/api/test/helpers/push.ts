import { createDecipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * A stand-in push service for e2e (RFC 8030): a local HTTP server that records every push it is
 * sent and answers with the status a test chose per device. Each `browser()` is a fake device with
 * real Web Push keys (P-256 + an auth secret), so a test can decrypt what the API really sent
 * (RFC 8291, aes128gcm) and check the alert's words — the same bytes a phone would get.
 */

export interface FakeBrowser {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The decrypted payloads this device was sent, oldest first. */
  received: () => Record<string, unknown>[];
  /** What the push service answers for this device from now on (201 by default). */
  answer: (status: number) => void;
}

export interface FakePushService {
  url: string;
  browser: (name: string) => FakeBrowser;
  /** Every request, in order (endpoint path, headers). */
  requests: { path: string; headers: Record<string, string | string[] | undefined> }[];
  close: () => Promise<void>;
}

const b64url = (b: Buffer) => b.toString('base64url');

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest()
    .subarray(0, length);
}

/** Decrypts one aes128gcm Web Push body for the device keys (RFC 8291 §3.4, RFC 8188). */
export function decryptPush(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const record = body.subarray(21 + idLength);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  // Padding: the last record ends with 0x02 then zeros.
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  return plain.subarray(0, end).toString('utf8');
}

export async function startFakePushService(): Promise<FakePushService> {
  const devices = new Map<
    string,
    { priv: Buffer; pub: Buffer; auth: Buffer; status: number; received: Record<string, unknown>[] }
  >();
  const requests: FakePushService['requests'] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = req.url ?? '';
      requests.push({ path, headers: req.headers });
      const device = devices.get(path.replace(/^\/push\//, ''));
      if (!device) {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (device.status >= 200 && device.status < 300) {
        device.received.push(
          JSON.parse(decryptPush(Buffer.concat(chunks), device.priv, device.pub, device.auth)) as Record<
            string,
            unknown
          >,
        );
      }
      res.statusCode = device.status;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    browser(name) {
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      const device = {
        priv: ecdh.getPrivateKey(),
        pub: ecdh.getPublicKey(),
        auth: randomBytes(16),
        status: 201,
        received: [] as Record<string, unknown>[],
      };
      const id = `${name}-${randomBytes(4).toString('hex')}`;
      devices.set(id, device);
      return {
        endpoint: `${url}/push/${id}`,
        keys: { p256dh: b64url(device.pub), auth: b64url(device.auth) },
        received: () => device.received,
        answer: (status) => {
          device.status = status;
        },
      };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
