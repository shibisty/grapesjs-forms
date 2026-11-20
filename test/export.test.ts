import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from 'grapesjs';
import { FORM_TYPE } from '../src/index';
import { createEditor, destroyEditor, tick, until } from './helpers/editor';

let editor: Editor | undefined;
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
});

describe('the exported page', () => {
  it('HTML + JS of GrapesJS make a working form on their own', async () => {
    const s = await createEditor({ plugin: { submitUrl: 'https://api.test/f' } });
    editor = s.editor;
    const f = await s.api.create({ fields: [{ type: 'text', name: 'name', required: true }, { type: 'hidden', name: 'src', value: '{{query.ref}}' }] });
    editor.getWrapper()!.append({ type: FORM_TYPE, formId: f.id } as any);
    await tick(5);
    const html = editor.getHtml();
    const js = editor.getJs();
    expect(js).toContain('formId');
    await destroyEditor(editor);
    editor = undefined;

    // A "site": the exported markup and script, nothing else.
    window.history.replaceState(null, '', '/page?ref=mail');
    document.body.innerHTML = html.replace(/^<body[^>]*>|<\/body>$/g, '');
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 's' }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    new Function(js)();
    const form = document.querySelector<HTMLFormElement>('form[data-gjsf-form]')!;
    expect((form as any).__gjsf).toBe(true);
    expect(form.querySelector<HTMLInputElement>('[name=src]')!.value).toBe('mail');
    form.querySelector<HTMLInputElement>('[name=name]')!.value = 'Ann';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => fetch.mock.calls.length === 1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.test/f/forms/${f.id}/submissions`);
    expect(JSON.parse(String(init.body)).data).toMatchObject({ name: 'Ann', src: 'mail' });
    window.history.replaceState(null, '', '/');
  });
});
