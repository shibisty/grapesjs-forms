import { afterEach, describe, expect, it } from 'vitest';
import type { Component, Editor } from 'grapesjs';
import { FORM_TYPE, NEW_BLOCK_ID, blockIdOf } from '../src/index';
import { MemoryFormStore } from '../src/store/MemoryFormStore';
import { click, createEditor, destroyEditor, tick, type, until } from './helpers/editor';

let editor: Editor | undefined;
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
});

const addForm = (ed: Editor, formId: string): Component => ed.getWrapper()!.append({ type: FORM_TYPE, formId } as any)[0];
const modal = (): HTMLElement => document.querySelector<HTMLElement>('.gjsf-ed')!;

describe('the plugin in GrapesJS', () => {
  it('creates a form with default fields and a block for it', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create();
    expect(f.name).toBe('Form 1');
    expect(f.fields.map((x) => x.name)).toEqual(['name', 'email', 'message']);
    expect(await s.store.getForm(f.id)).toBeTruthy();
    expect(editor.Blocks.get(NEW_BLOCK_ID)).toBeTruthy();
    expect(editor.Blocks.get(blockIdOf(f.id))?.get('label')).toBe('Form 1');
    expect(editor.Panels.getButton('options', 'gjsf-forms')).toBeTruthy();
  });

  it('a form component is built from its form and exports HTML + the script', async () => {
    const s = await createEditor({ plugin: { submitUrl: 'https://api.test/forms-api' } });
    editor = s.editor;
    const f = await s.api.create();
    const c = addForm(editor, f.id);
    await tick(5);
    const html = editor.getHtml();
    expect(html).toContain(`data-gjsf-form="${f.id}"`);
    expect(html).toContain(`action="https://api.test/forms-api/forms/${f.id}/submissions"`);
    expect(html).toMatch(/<input[^>]*name="email"[^>]*>/);
    expect(html).not.toContain('</input>');
    expect(html).toContain('data-gjsf-codes=');
    expect(c.components().length).toBeGreaterThan(3);
    const part = c.components().at(0);
    expect(part.get('removable')).toBe(false);
    expect(part.get('draggable')).toBe(false);
    expect(editor.getJs()).toContain('gjsf');
    // the rules every form needs, and the base styles, in the project CSS
    await tick(5);
    expect(editor.getCss()).toContain('.gjsf-hp');
    expect(editor.getCss()).toContain('.gjsf-input');
  });

  it('Component settings: a part edits its field, the form its settings; the selection survives a rename', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create();
    const c = addForm(editor, f.id);
    await tick(5);
    const traitEl = (comp: Component): HTMLElement => {
      const trait = (comp as any).getTrait('gjsf-settings');
      expect(trait).toBeTruthy();
      const View = (editor!.TraitManager as any).getType('gjsf-settings');
      const view = new View({ model: trait, editor: (editor as any).getModel() });
      document.body.appendChild(view.render().el);
      return view.el as HTMLElement;
    };
    // the label of the 2nd field (email)
    const emailField = c.components().at(1);
    const label = emailField.components().at(0);
    expect(label.getAttributes()['data-gjsf-part']).toBe('label');
    editor.select(label);
    const el = traitEl(label);
    expect(el.querySelector('.gjsf-trait__title')!.textContent).toBe(f.fields[1].label);
    const labelInput = el.querySelector<HTMLInputElement>('[data-prop="label"]')!;
    expect(labelInput.value).toBe(f.fields[1].label);
    labelInput.value = 'Your mail';
    labelInput.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => (s.api.get(f.id)?.fields[1].label === 'Your mail') && editor!.getHtml().includes('Your mail'));
    // the name followed the label: the ids changed, the label is selected again (by its place)
    expect(s.api.get(f.id)!.fields[1].name).toBe('your_mail');
    const sel = editor.getSelected()!;
    expect(sel.getAttributes()['data-gjsf-part']).toBe('label');
    expect(sel.getEl()!.textContent).toContain('Your mail');
    el.remove();
    // the form: its settings
    const fel = traitEl(c);
    const ep = fel.querySelector<HTMLInputElement>('[data-prop="submitLabel"]')!;
    ep.value = 'Go!';
    ep.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => editor!.getHtml().includes('>Go!</button>'));
    // the button is a part after the fields: it shows the form's settings too
    const btn = c.components().filter((x: any) => x.getAttributes()['data-gjsf-part'] === 'actions')[0];
    const bel = traitEl(btn);
    expect(bel.querySelector('[data-prop="submitLabel"]')).toBeTruthy();
    [fel, bel].forEach((x) => x.remove());
  });

  it('the base styles come even when the Style Manager made an empty .gjsf-form rule first', async () => {
    const s = await createEditor();
    editor = s.editor;
    editor.Css.setRule('.gjsf-form', {});
    editor.Css.setRule('.gjsf-input', {});
    const f = await s.api.create();
    addForm(editor, f.id);
    await until(() => editor!.getCss()!.includes('.gjsf-label{'));
    expect(editor.getCss()!).toMatch(/\.gjsf-input\{[^}]*padding/);
  });

  it('a change of the form rebuilds its components; the user’s classes stay; nothing on the undo stack', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create();
    const c = addForm(editor, f.id);
    c.addClass('my-form');
    c.addAttributes({ 'data-own': '1' });
    await tick(5);
    const um = editor.UndoManager;
    const before = um.getStack().length;
    await s.api.update(f.id, { fields: [...f.fields, { id: 'h', type: 'hidden', name: 'src', value: '{{form.name}}' }], settings: { submitLabel: 'Go' } });
    const html = editor.getHtml();
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="src"[^>]*value="Form 1"/);
    expect(html).toContain('>Go</button>');
    expect(c.getClasses()).toContain('my-form');
    expect(c.getAttributes()['data-own']).toBe('1');
    expect(c.getAttributes()['data-gjsf-version']).toBe(String(s.api.get(f.id)!.version));
    expect(um.getStack().length).toBe(before);
  });

  it('parts are layers with stable ids: styles given in GrapesJS survive a rebuild', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create();
    const c = addForm(editor, f.id);
    await tick(5);
    const find = (part: string, field?: string): Component => {
      let hit: Component | undefined;
      const walk = (x: Component, inField?: string): void => {
        const fl = x.getAttributes()['data-gjsf-field'] || inField;
        if (!hit && x.getAttributes()['data-gjsf-part'] === part && (!field || fl === field)) hit = x;
        x.components().forEach((k: Component) => walk(k, fl));
      };
      walk(c);
      return hit!;
    };
    const label = find('label', 'email');
    const submit = find('submit');
    expect(label.get('layerable')).toBe(true);
    expect(label.get('selectable')).toBe(true);
    expect(label.get('stylable')).toBe(true);
    const lid = label.getId();
    const sid = submit.getId();
    expect(lid).toMatch(/-email-label$/);
    expect(sid).toMatch(/-form-submit$/);
    editor.select(label);
    label.setStyle({ color: 'crimson' });
    submit.setStyle({ 'background-color': 'navy' });
    await s.api.update(f.id, { settings: { submitLabel: 'Go' } });
    expect(find('label', 'email').getId()).toBe(lid);
    expect(editor.getSelected()?.getId()).toBe(lid);
    expect(find('submit').getId()).toBe(sid);
    const css = editor.getCss()!;
    expect(css).toContain(`#${lid}{color:crimson;}`);
    expect(css).toContain(`#${sid}{background-color:navy;}`);
    const html = editor.getHtml();
    expect(html).toContain(`id="${lid}"`);
    expect(html).toContain('>Go</button>');
    // Ids are unique inside the form.
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('switching the form in the trait rebuilds; a deleted form leaves a marked copy', async () => {
    const s = await createEditor();
    editor = s.editor;
    const a = await s.api.create({ name: 'A', fields: [{ type: 'text', name: 'aaa' }] });
    const b = await s.api.create({ name: 'B', fields: [{ type: 'text', name: 'bbb' }] });
    const c = addForm(editor, a.id);
    await tick(5);
    editor.select(c);
    const opts = (c.getTrait('formId') as any).get('options').map((o: any) => o.name);
    expect(opts).toEqual(['— choose a form —', 'A', 'B']);
    c.set('formId', b.id);
    expect(editor.getHtml()).toContain('name="bbb"');
    await s.api.remove(b.id);
    expect(editor.getHtml()).toContain('name="bbb"');
    expect(c.getAttributes()).toHaveProperty('data-gjsf-missing');
    expect(editor.Blocks.get(blockIdOf(b.id))).toBeFalsy();
  });

  it('the "New form" block creates a form and opens the editor', async () => {
    const s = await createEditor();
    editor = s.editor;
    const c = editor.getWrapper()!.append({ type: FORM_TYPE, gjsfCreate: true } as any)[0];
    await until(() => !!c.get('formId'));
    expect(s.api.list()).toHaveLength(1);
    await until(() => !!modal());
    expect(modal().querySelector('[data-role=form-name]')).toBeTruthy();
  });

  it('a project loaded with an older copy is brought up to date', async () => {
    const store = new MemoryFormStore();
    const f = await store.saveForm({ id: 'f1', name: 'F', fields: [{ id: 'x', type: 'text', name: 'newname' }] as any, settings: {} });
    const html = `<form class="gjsf-form" data-gjsf-form="f1" data-gjsf-version="0"><div data-gjsf-part="field">old</div></form>`;
    const s = await createEditor({ store, html });
    editor = s.editor;
    await until(() => editor!.getHtml().includes('name="newname"'));
    const c = editor.getWrapper()!.components().at(0);
    expect(c.get('type')).toBe(FORM_TYPE);
    expect(c.get('formId')).toBe('f1');
    expect(c.getAttributes()['data-gjsf-version']).toBe(String(f.version));
  });

  it('next to grapesjs-pages {{page.*}} is the open page', async () => {
    const page = { id: 'p1', name: 'About', slug: '/about' };
    const s = await createEditor({
      before: (ed) => {
        (ed as any).PagesManager = { getActiveId: () => 'p1', store: { get: async () => page } };
      },
    });
    editor = s.editor;
    const f = await s.api.create({ fields: [{ type: 'hidden', name: 'from', value: '{{page.slug}}' }] });
    editor.trigger('pages-manager:open', page);
    const c = addForm(editor, f.id);
    await tick(5);
    expect(editor.getHtml()).toMatch(/name="from"[^>]*value="\/about"/);
    expect(c.getAttributes()['data-gjsf-page']).toBe('p1');
  });

  it('html() is the form for sites without GrapesJS', async () => {
    const s = await createEditor({ plugin: { submitUrl: '/api' } });
    editor = s.editor;
    const f = await s.api.create();
    expect(s.api.html(f.id)).toMatch(/^<form class="gjsf-form" data-gjsf-form="[^"]+"[^>]* data-gjsf-codes="\{&quot;required&quot;/);
    expect(s.api.actionOf(f.id)).toBe(`/api/forms/${f.id}/submissions`);
  });
});

describe('the forms editor', () => {
  it('adds, edits, reorders and removes fields; saves after a pause', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create({ fields: [] });
    editor.runCommand('forms:open', { id: f.id });
    expect(editor.Modal.isOpen()).toBe(true);
    const root = modal();
    expect(root.querySelector('.gjsf-hint')!.textContent).toBe('No fields yet: add one from the list on the left.');
    click(root.querySelector('[data-add=email]')!);
    click(root.querySelector('[data-add=select]')!);
    click(root.querySelector('[data-add=hidden]')!);
    expect(root.querySelectorAll('.gjsf-row')).toHaveLength(3);
    // the hidden field is open: its value and a placeholder chip
    const value = root.querySelector<HTMLInputElement>('.gjsf-props [data-prop=value]')!;
    type(value, 'ref=');
    value.setSelectionRange(4, 4);
    click(root.querySelector('[data-token="{{query.utm_source}}"]')!);
    expect(value.value).toBe('ref={{query.utm_source}}');
    // the e-mail field: the label renames the key
    click(root.querySelectorAll('.gjsf-row')[0]);
    type(root.querySelector<HTMLInputElement>('.gjsf-props [data-prop=label]')!, 'Work e-mail');
    expect(root.querySelector<HTMLInputElement>('.gjsf-props [data-prop=name]')!.value).toBe('work_e_mail');
    click(root.querySelector('.gjsf-props [data-prop=required]')!);
    // an attribute
    click(root.querySelector('.gjsf-props [data-role=add-attr]')!);
    const kv = root.querySelectorAll<HTMLInputElement>('.gjsf-props .gjsf-kv input');
    type(kv[0], 'data-track');
    type(kv[1], 'lead');
    // move the select up
    click(root.querySelectorAll('.gjsf-row')[1].querySelector('[title="Move up"]')!);
    await until(async () => ((await s.store.getForm(f.id))?.fields.length || 0) === 3);
    await until(async () => (await s.store.getForm(f.id))!.fields[1]?.name === 'work_e_mail');
    const saved = (await s.store.getForm(f.id))!;
    expect(saved.fields.map((x) => x.type)).toEqual(['select', 'email', 'hidden']);
    expect(saved.fields[1]).toMatchObject({ label: 'Work e-mail', required: true, attrs: { 'data-track': 'lead' } });
    expect(saved.fields[0].options).toHaveLength(3);
    expect(saved.fields[2]).toMatchObject({ value: 'ref={{query.utm_source}}' });
  });

  it('settings and the name', async () => {
    const s = await createEditor({ plugin: { submitUrl: 'https://x.test' } });
    editor = s.editor;
    const f = await s.api.create();
    s.api.open(f.id);
    const root = modal();
    type(root.querySelector<HTMLInputElement>('[data-role=form-name]')!, 'Callback');
    click(root.querySelector('[data-tab=settings]')!);
    expect(root.querySelector('.gjsf-pane small')!.textContent).toBe(`Empty — https://x.test/forms/${f.id}/submissions`);
    type(root.querySelector<HTMLInputElement>('[data-prop=successMessage]')!, 'We will call you');
    click(root.querySelector('[data-prop=honeypot]')!);
    await until(async () => (await s.store.getForm(f.id))?.settings.honeypot === false);
    const saved = (await s.store.getForm(f.id))!;
    expect(saved).toMatchObject({ name: 'Callback', settings: { successMessage: 'We will call you', honeypot: false } });
    expect(editor.Blocks.get(blockIdOf(f.id))?.get('label')).toBe('Callback');
  });

  it('the preview sends to the store; submissions are listed', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create({ fields: [{ type: 'text', name: 'name', required: false }] });
    s.api.open(f.id);
    const root = modal();
    click(root.querySelector('[data-tab=preview]')!);
    const frame = root.querySelector<HTMLIFrameElement>('iframe.gjsf-frame')!;
    await until(() => !!(frame.contentDocument?.querySelector('form') as any)?.__gjsf);
    const form = frame.contentDocument!.querySelector('form')!;
    form.querySelector<HTMLInputElement>('[name=name]')!.value = 'Ann';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(async () => (await s.store.listSubmissions!(f.id)).total === 1);
    await until(() => form.classList.contains('is-success'));
    click(root.querySelector('[data-tab=submissions]')!);
    await until(() => !!root.querySelector('[data-submission]'));
    expect(root.querySelector('[data-submission] td:nth-child(2)')!.textContent).toBe('Ann');
  });

  it('JSON: a SurveyJS survey replaces the fields; skipped questions are reported', async () => {
    const s = await createEditor();
    editor = s.editor;
    const f = await s.api.create();
    s.api.open(f.id);
    const root = modal();
    click(root.querySelector('[data-tab=json]')!);
    const area = root.querySelector<HTMLTextAreaElement>('[data-role=json]')!;
    expect(JSON.parse(area.value).fields).toHaveLength(3);
    area.value = JSON.stringify({ title: 'Survey', elements: [{ type: 'text', name: 'q1', inputType: 'tel' }, { type: 'matrix', name: 'm' }] });
    click(root.querySelector('[data-role=apply-json]')!);
    await until(() => s.api.get(f.id)?.name === 'Survey');
    expect(s.api.get(f.id)!.fields.map((x) => x.type)).toEqual(['tel']);
    await until(() => /Skipped/.test(root.querySelector('.gjsf-status')?.textContent || ''));
    area.value = '{bad';
    click(root.querySelector('[data-role=apply-json]')!);
  });

  it('new, duplicate and delete forms from the editor', async () => {
    const s = await createEditor();
    editor = s.editor;
    s.api.open();
    const root = modal();
    click(root.querySelector('[data-role=new-form]')!);
    await until(() => s.api.list().length === 1);
    await until(() => root.querySelectorAll('.gjsf-side-item').length === 1);
    click(root.querySelector('[data-role=duplicate]')!);
    await until(() => s.api.list().length === 2);
    expect(s.api.list().map((x) => x.name).sort()).toEqual(['Form 1', 'Form 1 (copy)']);
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      click(root.querySelector('[data-role=remove-form]')!);
      await until(() => s.api.list().length === 1);
    } finally {
      window.confirm = confirm;
    }
  });

  it('dblclick on a form opens the editor on it', async () => {
    const s = await createEditor();
    editor = s.editor;
    const a = await s.api.create({ name: 'A' });
    await s.api.create({ name: 'B' });
    const c = addForm(editor, a.id);
    await tick(5);
    editor.runCommand('forms:edit', { component: c });
    expect(modal().querySelector<HTMLInputElement>('[data-role=form-name]')!.value).toBe('A');
  });

  it('Russian labels with editor.I18n', async () => {
    const s = await createEditor({ before: (ed) => ed.I18n.setLocale('ru') });
    editor = s.editor;
    const f = await s.api.create();
    expect(f.name).toBe('Форма 1');
    expect(f.fields[0].label).toBe('Имя');
    s.api.open(f.id);
    expect(modal().querySelector('[data-tab=fields]')!.textContent).toBe('Поля');
    expect(s.api.html(f.id)).toContain('>Отправить</button>');
  });
});
