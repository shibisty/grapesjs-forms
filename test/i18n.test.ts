import { describe, expect, it } from 'vitest';
import { locales } from '../src/i18n';

describe('i18n', () => {
  it('every locale has every key of English, non-empty, with the same %s count', () => {
    const keys = Object.keys(locales.en).sort();
    for (const [lang, l] of Object.entries(locales)) {
      expect(Object.keys(l).sort(), lang).toEqual(keys);
      for (const k of keys) {
        const v = (l as any)[k] as string;
        expect(v, `${lang}.${k}`).toBeTruthy();
        expect((v.match(/%s/g) || []).length, `${lang}.${k}`).toBe(((locales.en as any)[k].match(/%s/g) || []).length);
      }
    }
  });
});
