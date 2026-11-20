import type { Component, Editor } from 'grapesjs';
import { formHtml, type BuildOptions } from './build';
import { definePlugin, registerControl, type PluginMeta } from './contract';
import { FormComponents, FORM_TYPE } from './editor/FormComponents';
import { COMMANDS, EVENTS } from './events';
import { createTranslator, registerMessages } from './i18n';
import type { FormsLabels } from './i18n/types';
import { fieldId, normalizeForm, type FormDef, type FormField, type ProblemCode } from './schema';
import { IndexedDbFormStore } from './store/IndexedDbFormStore';
import { RestFormStore, submitUrlOf } from './store/RestFormStore';
import { ConflictError, type FormStore, type FormWrite } from './store/types';
import { fromSurveyJs, toSurveyJs } from './surveyjs';
import type { FormInit, FormsApi, FormsOptions, ResolvedOptions } from './types';
import { h } from './ui/dom';
import { FormEditor } from './ui/FormEditor';
import { BASE_FORM_CSS, injectCss } from './ui/styles';
import { clone, fmt, report, uuid } from './utils';

export const PANEL_BUTTON_ID = 'gjsf-forms';
export const NEW_BLOCK_ID = 'gjsf-new';
export const blockIdOf = (formId: string): string => `gjsf-form-${formId}`;

type EditorWithForms = Editor & { Forms?: FormsApi; __gjsfCleanup?: () => void; PagesManager?: PagesLike };

/** What this plugin needs from grapesjs-pages (`editor.PagesManager`). */
interface PagesLike {
  getActiveId(): string | null;
  store: { get(id: string): Promise<Record<string, unknown> | undefined> };
  whenReady?(): Promise<unknown>;
}

/** The plugin API of an editor (`undefined` without the plugin). */
export function getForms(editor: Editor): FormsApi | undefined {
  return (editor as EditorWithForms).Forms;
}

export function resolveOptions(o: FormsOptions = {}): ResolvedOptions {
  const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def);
  const rest = o.rest && o.rest.url ? o.rest : null;
  return {
    store: o.store ?? null,
    rest,
    submitUrl: (o.submitUrl ?? rest?.url ?? null) || null,
    dbName: o.dbName || 'gjs-forms',
    autosaveDelay: num(o.autosaveDelay, 600),
    blocks: o.blocks !== false,
    baseCss: o.baseCss !== false,
    panelId: o.panelId || null,
    labels: { ...(o.labels || {}) },
    injectCss: o.injectCss !== false,
  };
}

const FORM_ICON = (size: number): string =>
  `<svg viewBox="0 0 24 24" style="display:block;width:${size}px;height:${size}px"><path fill="currentColor" d="M4 4h16v2H4zm0 4h10v2H4zm0 5h16v3H4zm0 5h7v2H4zm11 0h5v2h-5z"/></svg>`;

const BLOCK_MEDIA = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18v2H3zm0 4h11v2H3zm0 5h18v3H3zm0 5h8v3H3zm11 0h7v3h-7z"/></svg>`;

const CODES: ProblemCode[] = ['required', 'email', 'url', 'number', 'min', 'max', 'minLength', 'maxLength', 'pattern', 'option', 'date', 'time', 'color'];

/**
 * grapesjs-forms: forms are made in an editor of their own (fields, options,
 * placeholders, attributes, hidden values) and kept in a store; a form on a
 * page is a component built from it (plain HTML elements with stable
 * classes, styled by the site's own CSS); the site posts what the visitor
 * typed to the store's API.
 */
function formsPlugin(editor: Editor, userOpts: FormsOptions = {}): void {
  const ed = editor as EditorWithForms;
  ed.__gjsfCleanup?.();
  const opts = resolveOptions(userOpts);
  registerMessages(editor);
  const t = createTranslator(editor, opts.labels);
  const store: FormStore = opts.store || (opts.rest ? new RestFormStore(opts.rest) : new IndexedDbFormStore(opts.dbName));
  const pm = (): PagesLike | undefined => ed.PagesManager;
  let forms: FormDef[] = [];
  let page: Record<string, unknown> | null = null;
  let ui: FormEditor | null = null;
  let disposed = false;
  const offs: Array<() => void> = [];
  const on = (ev: string, fn: (...a: any[]) => void): void => {
    editor.on(ev, fn);
    offs.push(() => editor.off(ev, fn));
  };
  const emit = (ev: string, ...a: unknown[]): void => {
    if (!disposed) editor.trigger(ev, ...a);
  };
  const byId = (id: string | null | undefined): FormDef | undefined => (id ? forms.find((f) => f.id === id) : undefined);
  const sort = (): void => void forms.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const onError = (e: unknown): void => {
    ui?.flash(fmt(t('saveError'), (e as Error)?.message || String(e)), true);
    report(e);
  };

  /* ---------------------------- building ---------------------------- */

  const actionOf = (f: FormDef | string): string => {
    const form = typeof f === 'string' ? byId(f) : f;
    if (!form) return '';
    return form.settings?.endpoint || (opts.submitUrl ? submitUrlOf(opts.submitUrl, form.id) : '');
  };
  const codes = (): Record<string, string> => Object.fromEntries(CODES.map((c) => [c, t(`problem_${c}` as keyof FormsLabels)]));
  const texts = (): BuildOptions['texts'] => ({ submit: t('submit'), success: t('success'), error: t('error') });
  const pageId = (): string | null => (page && typeof page.id === 'string' ? page.id : null);

  const components = new FormComponents(editor, {
    form: byId,
    formOptions: () => forms.map((f) => ({ id: f.id, name: f.name })),
    buildOptions: (form) => ({ action: actionOf(form), ctx: { page }, texts: texts(), codes: codes(), pageId: pageId() }),
    labels: { chooseForm: () => t('chooseForm'), editForm: () => t('editForm'), noForm: () => t('noForm'), missingForm: () => t('missingForm') },
    editCommand: COMMANDS.edit,
    onCreate: (c) =>
      void create()
        .then((f) => {
          c.set('formId', f.id);
          openEditor(f.id);
        })
        .catch(onError),
  });

  /** Components built from another version of their form, or on another page. */
  const stale = (c: Component, f: FormDef): boolean => {
    const a = c.getAttributes() as Record<string, string>;
    if (a['data-gjsf-version'] !== String(f.version ?? '')) return true;
    if ('data-gjsf-missing' in a) return true;
    const pid = pageId();
    return (a['data-gjsf-page'] || null) !== pid;
  };
  const refreshStale = (): void => {
    if (!disposed) components.rebuildAll(null, stale);
  };

  let baseDone = false;
  const ensureBaseCss = (): void => {
    if (!opts.baseCss || baseDone) return;
    if (!components.all().length) return;
    baseDone = true;
    // Once per project: a rule of the base sheet with styles means it is there (the Style Manager makes empty rules of selected classes).
    const r = editor.Css.getRule('.gjsf-input') as any;
    if (!r || !Object.keys(r.getStyle?.() || {}).length) editor.Css.addRules(BASE_FORM_CSS);
  };

  /* ------------------------------ blocks ----------------------------- */

  const updateBlocks = (): void => {
    if (!opts.blocks || disposed) return;
    const bm = editor.Blocks;
    const category = t('blocksCategory');
    const want = new Set<string>([NEW_BLOCK_ID, ...forms.map((f) => blockIdOf(f.id))]);
    bm.getAll()
      .filter((b: any) => String(b.id).startsWith('gjsf-') && !want.has(b.id))
      .forEach((b: any) => bm.remove(b.id));
    const put = (id: string, props: Record<string, unknown>): void => {
      const cur = bm.get(id) as any;
      if (cur) cur.set(props);
      else bm.add(id, props as any);
    };
    put(NEW_BLOCK_ID, { label: `+ ${t('newFormBlock')}`, category, media: BLOCK_MEDIA, content: { type: FORM_TYPE, gjsfCreate: true }, select: true });
    forms.forEach((f) => put(blockIdOf(f.id), { label: f.name, category, media: BLOCK_MEDIA, content: { type: FORM_TYPE, formId: f.id }, select: true }));
  };

  const listChanged = (): void => {
    if (disposed) return;
    sort();
    updateBlocks();
    const sel = editor.getSelected();
    if (sel?.get('type') === FORM_TYPE) components.refreshTraits(sel);
    emit(EVENTS.forms, forms);
  };

  /* ------------------------------ forms ------------------------------ */

  const reload = async (): Promise<FormDef[]> => {
    forms = (await store.listForms()).map(normalizeForm);
    listChanged();
    ui?.setForms(true);
    refreshStale();
    return forms;
  };

  const defaultFields = (): Array<Partial<FormField>> => [
    { id: fieldId(), type: 'text', name: 'name', label: t('defaultName'), required: true, autocomplete: 'name', width: '1/2' },
    { id: fieldId(), type: 'email', name: 'email', label: t('defaultEmail'), required: true, autocomplete: 'email', width: '1/2' },
    { id: fieldId(), type: 'textarea', name: 'message', label: t('defaultMessage'), rows: 5 },
  ];

  const write = (f: FormDef): FormWrite => ({ id: f.id, name: f.name, fields: f.fields, settings: f.settings, ...(f.attrs ? { attrs: f.attrs } : {}) });

  const put = (saved: FormDef): void => {
    const n = normalizeForm(saved);
    forms = byId(n.id) ? forms.map((x) => (x.id === n.id ? n : x)) : [...forms, n];
  };

  const create = async (init: FormInit = {}): Promise<FormDef> => {
    const base = t('defaultFormName');
    let n = forms.length + 1;
    while (forms.some((x) => x.name === `${base} ${n}`)) n++;
    const draft = normalizeForm({ id: init.id || uuid(), name: init.name || `${base} ${n}`, fields: init.fields || defaultFields(), settings: init.settings || {}, attrs: init.attrs });
    const saved = await store.saveForm(write(draft));
    put(saved);
    listChanged();
    ui?.setForms();
    emit(EVENTS.saved, byId(saved.id));
    return byId(saved.id)!;
  };

  // Edits are kept at once and written after a pause, per form.
  const pending = new Map<string, FormDef>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    for (const f of batch) {
      const known = byId(f.id);
      ui?.flash(t('saving'));
      try {
        const saved = await store.saveForm(write(normalizeForm(f)), known?.version ?? null);
        put(saved);
        ui?.flash(t('saved'));
        emit(EVENTS.saved, byId(saved.id));
        components.rebuildAll(saved.id);
      } catch (e) {
        if (e instanceof ConflictError) {
          const fresh = await store.getForm(f.id).catch(() => undefined);
          if (fresh) put(fresh);
          ui?.setForms(true);
          ui?.flash(t('conflict'), true);
          components.rebuildAll(f.id);
        } else throw e;
      }
    }
    if (batch.length) listChanged();
    ui?.setForms();
  };
  const schedule = (f: FormDef): void => {
    const known = byId(f.id);
    // The cache follows the edit (names in blocks, the trait list); the version stays the last saved one.
    if (known) put({ ...clone(f), version: known.version, updatedAt: known.updatedAt });
    pending.set(f.id, clone(f));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush().catch(onError), opts.autosaveDelay);
  };

  const update: FormsApi['update'] = async (id, patch) => {
    if (pending.has(id)) await flush();
    const cur = byId(id);
    if (!cur) throw new Error(`grapesjs-forms: no form ${id}`);
    pending.set(id, normalizeForm({ ...clone(cur), ...clone(patch), id }));
    await flush();
    return byId(id)!;
  };

  const remove = async (id: string): Promise<void> => {
    pending.delete(id);
    await store.deleteForm(id);
    forms = forms.filter((f) => f.id !== id);
    listChanged();
    ui?.setForms();
    components.rebuildAll(id);
    emit(EVENTS.removed, id);
  };

  const duplicate = async (id: string): Promise<FormDef> => {
    if (pending.has(id)) await flush();
    const src = byId(id);
    if (!src) throw new Error(`grapesjs-forms: no form ${id}`);
    return create({ name: fmt(t('copyOf'), src.name), fields: clone(src.fields).map((f) => ({ ...f, id: fieldId() })), settings: clone(src.settings), attrs: src.attrs && clone(src.attrs) });
  };

  const applyJson = async (id: string, json: Record<string, any>): Promise<string[]> => {
    const surveyjs = !Array.isArray(json.fields) && (Array.isArray(json.pages) || Array.isArray(json.elements) || Array.isArray(json.questions));
    let next: FormDef;
    let skipped: string[] = [];
    if (surveyjs) {
      const r = fromSurveyJs(json, id);
      next = r.form;
      skipped = r.skipped;
    } else next = normalizeForm({ ...json, id });
    await update(id, { name: next.name, fields: next.fields, settings: next.settings, attrs: next.attrs });
    return skipped;
  };

  /* --------------------------- the editor UI -------------------------- */

  const previewStyles = (): { css: string; links: string[] } => {
    const links: string[] = [];
    try {
      const doc = editor.Canvas.getDocument();
      doc?.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => l.href && links.push(l.href));
    } catch {
      /* no canvas */
    }
    const cfg = (editor.getConfig() as any).canvas?.styles;
    (Array.isArray(cfg) ? cfg : []).forEach((s: unknown) => {
      const href = typeof s === 'string' ? s : (s as { href?: string })?.href;
      if (href && !links.includes(href)) links.push(href);
    });
    let css = '';
    try {
      css = editor.getCss() || '';
    } catch {
      css = '';
    }
    if (opts.baseCss && !/\.gjsf-form\s*\{/.test(css)) css = BASE_FORM_CSS + css;
    return { css, links };
  };

  const makeUi = (): FormEditor =>
    new FormEditor({
      t,
      forms: () => forms,
      form: byId,
      create: () => create(),
      duplicate,
      remove,
      change: schedule,
      defaultAction: (f) => (opts.submitUrl ? submitUrlOf(opts.submitUrl, f.id) : ''),
      previewHtml: (f) => formHtml(normalizeForm(f), { action: '', ctx: { page }, texts: texts(), codes: codes(), key: 'preview' }),
      previewStyles,
      submit: async (id, data, meta) => {
        if (pending.has(id)) await flush();
        const r = await store.submit(id, data, { ...(meta || {}), ...(pageId() ? { pageId: pageId()! } : {}) });
        emit(EVENTS.submitted, { formId: id, result: r });
        return r;
      },
      submissions: (id, p) => (store.listSubmissions ? store.listSubmissions(id, p) : null),
      deleteSubmission: (id, sid) => store.deleteSubmission?.(id, sid) ?? Promise.resolve(),
      applyJson,
      exportSurveyJs: (id) => toSurveyJs(byId(id) || normalizeForm({ id })),
      onError,
    });

  const openEditor = (id?: string | null): void => {
    if (disposed) return;
    if (opts.injectCss) injectCss();
    if (!ui) ui = makeUi();
    ui.show(id || null);
    const Modal = editor.Modal as any;
    Modal.open({ title: t('forms'), content: ui.root, attributes: { class: 'gjsf-modal' } });
    Modal.onceClose?.(() => {
      void flush().catch(onError);
    });
  };
  const closeEditor = (): void => {
    if (ui && (editor.Modal as any).isOpen?.()) editor.Modal.close();
  };

  editor.Commands.add(COMMANDS.open, {
    run(_e: Editor, _s: unknown, o: { id?: string } = {}) {
      openEditor(o?.id);
    },
  });
  editor.Commands.add(COMMANDS.edit, {
    run(e: Editor, _s: unknown, o: { component?: Component; id?: string } = {}) {
      const c = o?.component || (o as any)?.trait?.target || e.getSelected();
      const id = o?.id || (c?.get?.('type') === FORM_TYPE ? String(c.get('formId') || '') : '');
      openEditor(id || null);
    },
  });

  /* ------------------------------- API ------------------------------- */

  const api: FormsApi = {
    store,
    list: () => forms,
    get: (id) => byId(id),
    reload,
    create,
    update,
    remove,
    duplicate,
    open: (id) => openEditor(id),
    close: closeEditor,
    actionOf,
    html: (id, o = {}) => {
      const f = byId(id);
      if (!f) throw new Error(`grapesjs-forms: no form ${id}`);
      return formHtml(f, { action: actionOf(f), ctx: { page }, texts: texts(), codes: codes(), pageId: pageId(), ...o });
    },
    submit: async (id, data, meta) => {
      if (pending.has(id)) await flush();
      return store.submit(id, data, meta);
    },
    rebuild: (id) => components.rebuildAll(id || null),
    importSurveyJs: async (json, into) => {
      if (into) {
        const skipped = await applyJson(into, json);
        return { form: byId(into)!, skipped };
      }
      const r = fromSurveyJs(json, uuid());
      const f = await create({ id: r.form.id, name: r.form.name, fields: r.form.fields, settings: r.form.settings });
      return { form: f, skipped: r.skipped };
    },
    exportSurveyJs: (id) => {
      const f = byId(id);
      if (!f) throw new Error(`grapesjs-forms: no form ${id}`);
      return toSurveyJs(f);
    },
    flush,
  };
  ed.Forms = api;

  /* ------------------------- grapesjs-pages -------------------------- */

  on('pages-manager:open', (rec: Record<string, unknown>) => {
    page = rec && typeof rec === 'object' ? { ...rec } : null;
    // The project of the page was just loaded: its forms may be older than the store's.
    setTimeout(() => {
      refreshStale();
      ensureBaseCss();
    }, 0);
  });
  on('pages-manager:detach', () => {
    page = null;
  });

  on('component:add', (c: Component) => {
    if (c?.get?.('type') === FORM_TYPE) setTimeout(ensureBaseCss, 0);
  });

  /* ----------------------------- panel ------------------------------ */

  const mountButton = (): void => {
    const panels = editor.Panels;
    const panel = panels.getPanel(opts.panelId || 'options') || panels.getPanel('options') || panels.getPanel('commands');
    if (panel) {
      panels.addButton(panel.id as string, {
        id: PANEL_BUTTON_ID,
        label: FORM_ICON(18),
        command: COMMANDS.open,
        togglable: false,
        attributes: { title: t('forms') },
      } as any);
      offs.push(() => {
        try {
          panels.removeButton(panel.id as string, PANEL_BUTTON_ID);
        } catch {
          /* gone */
        }
      });
      return;
    }
    const container = editor.getContainer() as HTMLElement | null;
    if (!container) return;
    if (opts.injectCss) injectCss();
    const btn = h('button', { class: 'gjsf-toggle', type: 'button', title: t('forms'), onclick: () => openEditor() });
    btn.innerHTML = FORM_ICON(14);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(btn);
    offs.push(() => btn.remove());
  };

  on('i18n:locale i18n:update', () =>
    setTimeout(() => {
      if (disposed) return;
      updateBlocks();
      const sel = editor.getSelected();
      if (sel?.get('type') === FORM_TYPE) components.refreshTraits(sel);
      if (ui && (editor.Modal as any).isOpen?.()) ui.render();
    }, 0)
  );

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    components.destroy();
    ui?.destroy();
    offs.splice(0).forEach((off) => off());
    if (ed.__gjsfCleanup === cleanup) delete ed.__gjsfCleanup;
  };
  ed.__gjsfCleanup = cleanup;
  const offControl = registerControl(editor, META, () => publicOptions(opts), (patch) => {
    if ('autosaveDelay' in patch) opts.autosaveDelay = resolveOptions({ autosaveDelay: patch.autosaveDelay as number }).autosaveDelay;
    if ('submitUrl' in patch) {
      opts.submitUrl = (patch.submitUrl as string) || opts.rest?.url || null;
      components.rebuildAll(null);
    }
  });
  on('destroy', offControl);
  on('destroy', cleanup);
  const onUnload = (): void => void flush().catch(report);
  window.addEventListener('beforeunload', onUnload);
  offs.push(() => window.removeEventListener('beforeunload', onUnload));

  editor.onReady(() => {
    if (disposed) return;
    mountButton();
    void reload()
      .then(async () => {
        const p = pm();
        if (p?.whenReady) await p.whenReady();
        const id = p?.getActiveId?.();
        if (p && id && !page) page = (await p.store.get(id).catch(() => undefined)) || null;
        if (!disposed) {
          refreshStale();
          ensureBaseCss();
        }
      })
      .catch(onError);
  });
}

export const PLUGIN_ID = 'grapesjs-forms';
/** Version of this package (a test checks it against package.json). */
export const VERSION = '0.1.0';

/** Options for forms (plugin contract). `autosaveDelay` and `submitUrl` apply live. */
export const META: PluginMeta = {
  id: PLUGIN_ID,
  version: VERSION,
  title: 'Forms',
  description: 'A form editor of its own; a form is a component styled by the site; submissions go to a REST API.',
  options: [
    { key: 'rest', type: 'json', default: null, title: 'REST backend', description: '{ "url": "/api/forms-admin" } (openapi.yaml); null — IndexedDB in the browser.' },
    { key: 'submitUrl', type: 'string', default: '', title: 'Submit URL of the site', description: 'Base the published forms post to (<url>/forms/<id>/submissions). Empty — rest.url.', live: true },
    { key: 'dbName', type: 'string', default: 'gjs-forms', title: 'IndexedDB database', advanced: true },
    { key: 'autosaveDelay', type: 'number', default: 600, title: 'Autosave delay, ms', live: true },
    { key: 'blocks', type: 'boolean', default: true, title: 'Blocks of the forms' },
    { key: 'baseCss', type: 'boolean', default: true, title: 'Base form styles', description: 'Adds a small stylesheet for forms to the project CSS once.' },
    { key: 'panelId', type: 'string', default: '', title: 'Panel of the "Forms" button', description: 'Empty — options.', advanced: true },
    { key: 'labels', type: 'json', default: {}, title: 'Texts', advanced: true },
    { key: 'injectCss', type: 'boolean', default: true, title: 'Inject CSS', advanced: true },
  ],
};

/** The options a form can show. */
export function publicOptions(o: ResolvedOptions): Record<string, unknown> {
  return {
    rest: o.rest ? { url: o.rest.url, ...(o.rest.credentials ? { credentials: o.rest.credentials } : {}) } : null,
    submitUrl: o.submitUrl || '',
    dbName: o.dbName,
    autosaveDelay: o.autosaveDelay,
    blocks: o.blocks,
    baseCss: o.baseCss,
    panelId: o.panelId || '',
    labels: o.labels,
    injectCss: o.injectCss,
  };
}

export default definePlugin(formsPlugin, META);
