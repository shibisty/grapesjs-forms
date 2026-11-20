import { afterEach, describe, expect, it, vi } from 'vitest';
import { formHtml } from '../src/build';
import { enhanceForms, formScript } from '../src/runtime/index';
import { normalizeForm } from '../src/schema';
import { tick, until } from './helpers/editor';

/** The script as GrapesJS exports it: its source text alone, without the module around it. */
const isolated = new Function(`return (${formScript.toString()})`)() as typeof formScript;

const mount = (raw: any, action = 'https://api.test/forms/f1/submissions'): HTMLFormElement => {
  const d = document.createElement('div');
  d.innerHTML = formHtml(normalizeForm({ id: 'f1', name: 'Contact', ...raw }), { action, texts: { success: 'Thanks!', error: 'Oops' } }).replace('<form ', `<form data-gjsf-codes='{"required":"Fill it in"}' `);
  document.body.append(d);
  const f = d.firstElementChild as HTMLFormElement;
  isolated.call(f);
  return f;
};

const submit = (f: HTMLFormElement): void => void f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('runtime script', () => {
  it('is self-contained (works from its source text alone)', () => {
    expect(formScript.toString()).not.toMatch(/\bimport\b|__vite|require\(/);
    expect(typeof isolated).toBe('function');
  });

  it('fills placeholders and posts JSON { data, meta }', async () => {
    window.history.replaceState(null, '', '/landing?utm_source=ads&email=q%40x.io');
    const fetch = reply(201, { id: 's1' });
    vi.stubGlobal('fetch', fetch);
    const f = mount({
      fields: [
        { type: 'email', name: 'email', value: '{{query.email}}' },
        { type: 'checkboxes', name: 'tags', options: ['a', 'b'] },
        { type: 'checkbox', name: 'agree' },
        { type: 'hidden', name: 'src', value: '{{query.utm_source}}|{{path}}' },
      ],
    });
    expect(f.querySelector<HTMLInputElement>('[name=email]')!.value).toBe('q@x.io');
    f.querySelector<HTMLInputElement>('[name=tags][value=b]')!.checked = true;
    submit(f);
    await until(() => fetch.mock.calls.length === 1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/forms/f1/submissions');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(body.data).toEqual({ email: 'q@x.io', tags: ['b'], agree: false, src: 'ads|/landing', _gjsf_hp: '' });
    expect(body.meta.url).toContain('/landing');
    await until(() => f.classList.contains('is-success'));
    expect(f.querySelector('.gjsf-message')!.textContent).toBe('Thanks!');
    // reset, and the placeholder filled again
    expect(f.querySelector<HTMLInputElement>('[name=tags][value=b]')!.checked).toBe(false);
    expect(f.querySelector<HTMLInputElement>('[name=email]')!.value).toBe('q@x.io');
  });

  it('shows the 422 errors per field (codes become the form texts)', async () => {
    vi.stubGlobal('fetch', reply(422, { error: 'Invalid', errors: { email: ['required'], name: ['Too short'] } }));
    const f = mount({ fields: [{ type: 'text', name: 'name' }, { type: 'email', name: 'email' }] });
    const onError = vi.fn();
    f.addEventListener('gjsf:error', onError);
    submit(f);
    await until(() => f.classList.contains('is-error'));
    expect(f.querySelector('[data-gjsf-error-for=email]')!.textContent).toBe('Fill it in');
    expect(f.querySelector('[data-gjsf-error-for=name]')!.textContent).toBe('Too short');
    expect(f.querySelector('[data-gjsf-field=email]')!.classList.contains('has-error')).toBe(true);
    expect(f.querySelector('[name=email]')!.getAttribute('aria-invalid')).toBe('true');
    expect(f.querySelector('.gjsf-message')!.textContent).toBe('Invalid');
    expect(onError).toHaveBeenCalledOnce();
    // typing clears the error of that field
    f.querySelector('[name=email]')!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(f.querySelector('[data-gjsf-error-for=email]')!.textContent).toBe('');
  });

  it('a required checkbox group needs one checked', async () => {
    const fetch = reply(201, {});
    vi.stubGlobal('fetch', fetch);
    const f = mount({ fields: [{ type: 'checkboxes', name: 'tags', options: ['a', 'b'], required: true }] });
    submit(f);
    await tick(5);
    expect(fetch).not.toHaveBeenCalled();
    expect(f.querySelector('[data-gjsf-error-for=tags]')!.textContent).toBe('Fill it in');
  });

  it('the browser validation stops a submit', async () => {
    const fetch = reply(201, {});
    vi.stubGlobal('fetch', fetch);
    const f = mount({ fields: [{ type: 'email', name: 'email', required: true }] });
    submit(f);
    await tick(5);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gjsf:submit: a listener may send it itself (detail.promise)', async () => {
    const fetch = reply(201, {});
    vi.stubGlobal('fetch', fetch);
    const f = mount({ fields: [{ type: 'text', name: 'a' }] }, '');
    f.addEventListener('gjsf:submit', (e) => {
      (e as CustomEvent).detail.promise = Promise.resolve({ message: 'Handled' });
    });
    submit(f);
    await until(() => f.classList.contains('is-success'));
    expect(f.querySelector('.gjsf-message')!.textContent).toBe('Handled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('no endpoint and nobody handles it: an error', async () => {
    const f = mount({ fields: [{ type: 'text', name: 'a' }] }, '');
    submit(f);
    await until(() => f.classList.contains('is-error'));
    expect(f.querySelector('.gjsf-message')!.textContent).toBe('Oops');
  });

  it('the server may send a message or a redirect', async () => {
    vi.stubGlobal('fetch', reply(201, { message: 'From server' }));
    const f = mount({ fields: [{ type: 'text', name: 'a' }] });
    submit(f);
    await until(() => f.classList.contains('is-success'));
    expect(f.querySelector('.gjsf-message')!.textContent).toBe('From server');
  });

  it('files go as multipart with _meta', async () => {
    const fetch = reply(201, {});
    vi.stubGlobal('fetch', fetch);
    const f = mount({ fields: [{ type: 'file', name: 'cv' }] });
    const input = f.querySelector<HTMLInputElement>('[name=cv]')!;
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file] });
    // jsdom's FormData reads the input's files list
    const OrigFD = window.FormData;
    vi.stubGlobal(
      'FormData',
      class extends OrigFD {
        constructor(form?: HTMLFormElement) {
          super(form);
          if (form) this.set('cv', file);
        }
      }
    );
    submit(f);
    await until(() => fetch.mock.calls.length === 1);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('_meta')).toContain('"url"');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('enhanceForms turns on server-rendered forms once', () => {
    const d = document.createElement('div');
    d.innerHTML = formHtml(normalizeForm({ id: 'x', fields: [{ type: 'text', name: 'a' }] })) + formHtml(normalizeForm({ id: 'y' }));
    document.body.append(d);
    expect(enhanceForms(d)).toBe(2);
    expect(enhanceForms(d)).toBe(0);
  });
});
