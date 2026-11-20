import { describe, expect, it } from 'vitest';
import { cleanAttrs, fieldName, normalizeForm, normalizeOptions, validateSubmission, type FormDef } from '../src/schema';

const form = (fields: any[]): FormDef => normalizeForm({ id: 'f1', name: 'Test', fields });

describe('schema', () => {
  it('names from labels, unique, content fields without names', () => {
    const f = form([
      { type: 'email', label: 'Your e-mail' },
      { type: 'email', label: 'Your e-mail' },
      { type: 'heading', label: 'Contacts' },
      { type: 'nonsense', name: '1bad' },
    ]);
    expect(f.fields.map((x) => x.name)).toEqual(['your_e_mail', 'your_e_mail_2', '', 'f_1bad']);
    expect(f.fields[2]).toMatchObject({ type: 'heading', text: 'Contacts' });
    expect(f.fields[3].type).toBe('text');
    expect(fieldName('Привет')).toBe('');
    expect(new Set(f.fields.map((x) => x.id)).size).toBe(4);
  });

  it('options from strings, objects and "value|Label" lines', () => {
    expect(normalizeOptions('a\nb|Bee\n\na')).toEqual([
      { label: 'a', value: 'a' },
      { label: 'Bee', value: 'b' },
    ]);
    expect(normalizeOptions([{ text: 'One', value: 1 }, 'two'])).toEqual([
      { label: 'One', value: '1' },
      { label: 'two', value: 'two' },
    ]);
  });

  it('attributes: on* handlers, reserved names and javascript: dropped', () => {
    expect(cleanAttrs({ 'data-x': '1', onclick: 'alert(1)', id: 'x', name: 'n', href: 'javascript:alert(1)', 'aria-label': 'L', 'bad attr': 1 })).toEqual({ 'data-x': '1', 'aria-label': 'L' });
    expect(cleanAttrs({ onClick: 'x' })).toBeUndefined();
  });

  it('settings: unsafe URLs dropped, booleans kept only when off', () => {
    const f = normalizeForm({ settings: { endpoint: 'javascript:alert(1)', redirect: '/thanks', reset: true, honeypot: false, successMessage: '  ok ' } });
    expect(f.settings).toEqual({ redirect: '/thanks', honeypot: false, successMessage: 'ok' });
  });

  it('hidden fields: no required, no placeholder', () => {
    const f = form([{ type: 'hidden', name: 'src', required: true, placeholder: 'x', value: '{{query.utm_source}}' }]);
    expect(f.fields[0]).toEqual({ id: f.fields[0].id, type: 'hidden', name: 'src', value: '{{query.utm_source}}' });
  });

  describe('validateSubmission', () => {
    const f = form([
      { type: 'text', name: 'name', required: true, minLength: 2, maxLength: 5 },
      { type: 'email', name: 'email', required: true },
      { type: 'url', name: 'site' },
      { type: 'number', name: 'age', min: '18', max: '99' },
      { type: 'select', name: 'plan', options: ['a', 'b'] },
      { type: 'checkboxes', name: 'tags', options: ['x', 'y'], required: true },
      { type: 'checkbox', name: 'agree', required: true },
      { type: 'date', name: 'day', min: '2026-01-01' },
      { type: 'time', name: 'at' },
      { type: 'tel', name: 'zip', pattern: '[0-9]{5}' },
      { type: 'hidden', name: 'src' },
      { type: 'heading', text: 'Hi' },
    ]);

    it('a good submission: cleaned, typed, unknown keys dropped', () => {
      const r = validateSubmission(f, { name: ' Ann ', email: 'a@b.co', age: '30', plan: 'a', tags: 'x,y', agree: 'on', day: '2026-05-01', at: '10:30', zip: '01234', src: 'ads', evil: 'x' });
      expect(r.ok).toBe(true);
      expect(r.data).toEqual({ name: 'Ann', email: 'a@b.co', site: '', age: 30, plan: 'a', tags: ['x', 'y'], agree: true, day: '2026-05-01', at: '10:30', zip: '01234', src: 'ads' });
      expect(r.spam).toBe(false);
    });

    it('problems by field, in the shape of the 422 errors', () => {
      const r = validateSubmission(f, { name: 'A', email: 'nope', site: 'ftp:x', age: '12', plan: 'c', tags: ['z'], day: '2025-12-31', at: '25:00', zip: '12' });
      expect(r.ok).toBe(false);
      expect(r.errors).toEqual({
        name: ['minLength'],
        email: ['email'],
        site: ['url'],
        age: ['min'],
        plan: ['option'],
        tags: ['option'],
        agree: ['required'],
        day: ['min'],
        at: ['time'],
        zip: ['pattern'],
      });
      expect(validateSubmission(f, {}).errors).toMatchObject({ name: ['required'], email: ['required'], tags: ['required'], agree: ['required'] });
    });

    it('the honeypot marks spam', () => {
      expect(validateSubmission(f, { _gjsf_hp: 'http://spam' }).spam).toBe(true);
    });
  });
});
