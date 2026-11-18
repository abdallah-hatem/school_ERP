import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * One way to send an event (docs/ARCHITECTURE.md → How modules talk to each other):
 * `DomainEvents.publish`. A source scan over apps/api/src and apps/api/test (specs included): no
 * file uses NestJS's EventEmitter (`@nestjs/event-emitter`, `EventEmitter2`, `@OnEvent`) — it is not
 * even a dependency — and nothing outside core/events calls `.emit(` / `.emitAsync(`, which would be
 * an in-memory event that skips the after-commit rule and the outbox.
 */

const API = join(__dirname, '..', '..', '..');
const OWN = join('src', 'core', 'events');
const SELF = relative(API, __filename);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const all = [...files(join(API, 'src')), ...files(join(API, 'test'))]
  .map((path) => ({ path: relative(API, path), text: readFileSync(path, 'utf8') }))
  .filter((f) => f.path !== SELF);

describe('events go through DomainEvents only', () => {
  it('scans the API', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('nothing uses NestJS EventEmitter, and it is not a dependency', () => {
    const users = all
      .filter((f) => /@nestjs\/event-emitter|\bEventEmitter2\b|@OnEvent\(/.test(f.text))
      .map((f) => f.path);
    expect(users).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(API, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('@nestjs/event-emitter');
  });

  it('no .emit( / .emitAsync( outside core/events', () => {
    const emitters = all
      .filter((f) => !f.path.startsWith(OWN) && /\.emit(?:Async)?\(/.test(f.text))
      .map((f) => f.path);
    expect(emitters).toEqual([]);
  });
});
