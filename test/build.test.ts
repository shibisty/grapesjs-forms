import { describe, expect, it } from 'vitest';
import { formHtml } from '../src/build';
import { resolveBuild } from '../src/placeholders';
import { normalizeForm } from '../src/schema';

const html = (raw: any, o: any = {}): HTMLFormElement => {
  const d = document.createElement('div');
  d.innerHTML = formHtml(normalizeForm({ id: 'abc12345-x', name: 'Contact', ...raw }), o);
  return d.firstElementChild as HTMLFormElement;
};

describe('build', () => {
  it('a form of plain elements with stable classes', () => {
    const f = html(
      {
        fields: [
          { type: 'text', name: 'name', label: 'Name', required: true, placeholder: 'Your name', width: '1/2', attrs: { class: 'big', 'data-x': '1' } },
          { type: 'select', name: 'plan', label: 'Plan', options: ['a', 'b'], value: 'b' },
          { type: 'radio', name: 'size', label: 'Size', options: ['s', 'm'], required: true },
          { type: 'checkboxes', name: 'tags', label: 'Tags', options: ['x', 'y'], required: true, value: 'y' },
          { type: 'file', name: 'cv', label: 'CV', accept: '.pdf' },
          { type: 'paragraph', text: 'Fine print' },
        ],
        settings: { submitLabel: 'Go', successMessage: 'Thanks', redirect: '/ok', reset: false },
        attrs: { 'data-track': 'lead', class: 'contact' },
        version: 3,
      },
      { action: 'https://api.test/forms/abc/submissions' }
    );
    expect(f.tagName).toBe('FORM');
    expect(f.className).toBe('gjsf-form contact');
    expect(f.getAttribute('action')).toBe('https://api.test/forms/abc/submissions');
    expect(f.getAttribute('method')).toBe('post');
    expect(f.getAttribute('enctype')).toBe('multipart/form-data');
    expect(f.dataset).toMatchObject({ gjsfForm: 'abc12345-x', gjsfSuccess: 'Thanks', gjsfRedirect: '/ok', gjsfReset: 'false', gjsfVersion: '3', track: 'lead' });
    const name = f.querySelector<HTMLInputElement>('input[name="name"]')!;
    expect(name.className).toBe('gjsf-input big');
    expect(name.required).toBe(true);
    expect(name.placeholder).toBe('Your name');
    expect(name.dataset.x).toBe('1');
    expect(name.closest('.gjsf-field')!.className).toContain('gjsf-w-1-2');
    expect(f.querySelector(`label[for="${name.id}"]`)!.textContent).toBe('Name*');
    expect(f.querySelector<HTMLSelectElement>('select[name="plan"]')!.value).toBe('b');
    expect(f.querySelectorAll('input[name="size"][type="radio"]').length).toBe(2);
    expect(f.querySelector('fieldset[data-gjsf-field="tags"]')!.hasAttribute('data-gjsf-required')).toBe(true);
    expect(f.querySelector<HTMLInputElement>('input[name="tags"][value="y"]')!.checked).toBe(true);
    expect(f.querySelector('input[name="cv"]')!.getAttribute('accept')).toBe('.pdf');
    expect(f.querySelector('p.gjsf-text')!.textContent).toBe('Fine print');
    expect(f.querySelector('button.gjsf-submit')!.textContent).toBe('Go');
    expect(f.querySelector('.gjsf-hp input[name="_gjsf_hp"]')).not.toBeNull();
    expect(f.querySelector('.gjsf-message[role="status"]')).not.toBeNull();
  });

  it('hidden values: build placeholders filled, run-time ones left to the browser', () => {
    const f = html(
      { fields: [{ type: 'hidden', name: 'page', value: '{{page.slug}}' }, { type: 'hidden', name: 'src', value: '{{form.name}}/{{query.utm_source}}' }, { type: 'hidden', name: 'fixed', value: 'x' }] },
      { ctx: { page: { id: 'p1', slug: '/about' } } }
    );
    const page = f.querySelector<HTMLInputElement>('input[name="page"]')!;
    expect(page.value).toBe('/about');
    expect(page.hasAttribute('data-gjsf-value')).toBe(false);
    const src = f.querySelector<HTMLInputElement>('input[name="src"]')!;
    expect(src.value).toBe('');
    expect(src.getAttribute('data-gjsf-value')).toBe('Contact/{{query.utm_source}}');
    expect(f.querySelector<HTMLInputElement>('input[name="fixed"]')!.value).toBe('x');
  });

  it('text is escaped', () => {
    const f = html({ fields: [{ type: 'text', name: 'a', label: '<img src=x onerror=alert(1)>' }] });
    expect(f.querySelector('img')).toBeNull();
    expect(f.querySelector('label')!.textContent).toContain('<img');
  });

  it('no honeypot when off', () => {
    expect(html({ settings: { honeypot: false } }).querySelector('.gjsf-hp')).toBeNull();
  });

  it('resolveBuild leaves {{page.*}} to the browser without grapesjs-pages', () => {
    expect(resolveBuild('{{page.slug}} {{form.id}} {{page.nope.x}}', { form: { id: 'f', name: 'n' } })).toBe('{{page.slug}} f {{page.nope.x}}');
    expect(resolveBuild('{{page.nope}}', { page: { id: '1' } })).toBe('');
  });
});
