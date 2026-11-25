import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';

describe('canonicalJson', () => {
  it('ignores key order at every level', () => {
    const a = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center', dir: 'rtl' } }] };
    const b = { content: [{ attrs: { dir: 'rtl', textAlign: 'center' }, type: 'paragraph' }], type: 'doc' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('keeps array order and tells different content apart', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ text: 'a' })).not.toBe(canonicalJson({ text: 'b' }));
    expect(canonicalJson(null)).toBe('null');
  });
});
