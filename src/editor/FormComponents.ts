import type { Component, Editor } from 'grapesjs';
import { buildChildren, CLS, formAttrs, type BuildOptions, type El } from '../build';
import { formScript } from '../runtime/script';
import type { FormDef } from '../schema';

export const FORM_TYPE = 'gjsf-form';
export const PART_TYPE = 'gjsf-part';
export const FORM_ATTR = 'data-gjsf-form';
export const PART_ATTR = 'data-gjsf-part';
/** The trait (Component settings) that edits the selected field — or, on the form, the form's settings. */
export const SETTINGS_TRAIT = 'gjsf-settings';
const settingsTrait = { type: SETTINGS_TRAIT, name: SETTINGS_TRAIT, changeProp: true };

/** Parts of a form are made by the plugin: they are styled, not moved, removed or edited by hand. */
const LOCKED = {
  removable: false,
  draggable: false,
  copyable: false,
  droppable: false,
  editable: false,
  stylable: true,
  selectable: true,
  hoverable: true,
  layerable: true,
};

/** Attributes of the `<form>` the plugin writes (removed before each rebuild; the user's own stay). */
const OWN_ATTRS = ['action', 'method', 'enctype', 'data-gjsf-success', 'data-gjsf-error', 'data-gjsf-redirect', 'data-gjsf-reset', 'data-gjsf-version', 'data-gjsf-codes', 'data-gjsf-page', 'data-gjsf-missing'];

/**
 * Gives every built element without an id a stable one, made from the
 * component's key, the field it belongs to and its part
 * (`gjsf-k3x9a-email-label`, `gjsf-k3x9a-form-submit`): a rebuild (the form
 * was edited, another page opened) makes the same ids, so styles given to
 * the parts in GrapesJS (`#…` rules) stay with them.
 */
export function stableIds(els: Array<El | string>, key: string): Array<El | string> {
  const safe = (s: string) => s.replace(/[^\w-]/g, '_');
  const seen = new Map<string, number>();
  const walk = (el: El | string, scope: string): void => {
    if (typeof el === 'string') return;
    const field = el.attrs?.['data-gjsf-field'];
    const sc = field ? safe(field) : scope;
    if (!el.attrs?.id) {
      const base = `gjsf-${key}-${sc}-${safe(el.part)}`;
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      el.attrs = { ...(el.attrs || {}), id: n ? `${base}-${n}` : base };
    }
    (el.kids || []).forEach((k) => walk(k, sc));
  };
  els.forEach((el) => walk(el, 'form'));
  return els;
}

/** A built element as a GrapesJS component definition. */
export function toComponent(el: El | string): Record<string, unknown> {
  if (typeof el === 'string') return { type: 'textnode', content: el };
  // Inline styles would become `#id{…}` rules that pile up with every rebuild: the honeypot is hidden by a class rule.
  return {
    type: PART_TYPE,
    tagName: el.tag,
    attributes: { ...(el.attrs || {}), [PART_ATTR]: el.part },
    classes: el.classes || [],
    void: !!el.void,
    components: (el.kids || []).map(toComponent),
    ...LOCKED,
  };
}

export interface FormHost {
  /** The form of an id (cached). */
  form(id: string | null | undefined): FormDef | undefined;
  /** Options of a build (action, texts, page). */
  buildOptions(form: FormDef, comp: Component): BuildOptions;
  /** The select of the "Form" trait. */
  formOptions(): Array<{ id: string; name: string }>;
  labels: { chooseForm: () => string; editForm: () => string; noForm: () => string; missingForm: () => string };
  /** The content of the settings trait of a form or one of its parts. */
  settings?(target: { form: Component; formId: string; index: number | null }): HTMLElement;
  editCommand: string;
  /** A form component without a form was dropped from the "New form" block. */
  onCreate(comp: Component): void;
}

const randomKey = (): string => Math.random().toString(36).slice(2, 7);

/** The rules every form needs on the site (in the project CSS, so they are exported). */
export const REQUIRED_CSS = `.${CLS.hp}{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}`;

/** Shown only in the canvas. */
export const CANVAS_CSS = `
form.${CLS.form}:empty{min-height:64px;outline:1px dashed rgba(127,127,127,.6);display:flex;align-items:center;justify-content:center}
form.${CLS.form}:empty::before{content:attr(data-gjsf-placeholder);opacity:.6;font:13px/1.3 sans-serif}
form.${CLS.form}[data-gjsf-missing]{outline:1px dashed #e57373}
`;

/**
 * The component types: `gjsf-form` (the `<form>`, its `formId` names the
 * form; the script is the site's behaviour) and `gjsf-part` (everything
 * inside, made from the form's schema).
 */
export class FormComponents {
  private offs: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    private readonly host: FormHost
  ) {
    const dc = editor.DomComponents;
    const self = this;

    dc.addType(PART_TYPE, {
      isComponent: (el: HTMLElement) => (el?.getAttribute?.(PART_ATTR) ? { type: PART_TYPE } : false),
      model: {
        defaults: { ...LOCKED },
        init(this: Component) {
          (this as any).set('traits', [settingsTrait]);
        },
      },
    });
    if (host.settings) {
      (editor as any).TraitManager.addType(SETTINGS_TRAIT, {
        noLabel: true,
        createInput({ component }: { component: Component }) {
          const t = self.targetOf(component);
          return t ? host.settings!(t) : document.createElement('div');
        },
        onEvent() {},
        onUpdate() {},
      });
    }

    dc.addType(FORM_TYPE, {
      isComponent: (el: HTMLElement) => (el?.tagName === 'FORM' && el.hasAttribute(FORM_ATTR) ? { type: FORM_TYPE, formId: el.getAttribute(FORM_ATTR) || '' } : false),
      model: {
        defaults: {
          tagName: 'form',
          name: 'Form',
          droppable: false,
          classes: [CLS.form],
          formId: '',
          gjsfKey: '',
          script: formScript,
          'script-props': ['formId'],
          traits: [],
        },
        init(this: Component) {
          if (!this.get('gjsfKey')) this.set('gjsfKey', randomKey());
          (this as any).set('traits', self.traits());
          this.on('change:formId', () => self.rebuild(this));
        },
      },
      view: {
        events: {
          dblclick: 'onEdit',
          submit: 'onSubmit',
        } as any,
        onEdit(this: any, e: Event) {
          e?.stopPropagation?.();
          editor.runCommand(host.editCommand, { component: this.model });
        },
        onSubmit(e: Event) {
          e.preventDefault();
        },
      },
    });

    // In the canvas a form never leaves (Enter in an input would submit it).
    const guard = (doc: Document | undefined | null): void => {
      if (!doc || (doc as any).__gjsfGuard) return;
      (doc as any).__gjsfGuard = true;
      doc.addEventListener(
        'submit',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true
      );
      if (!doc.getElementById('gjsf-canvas-style')) {
        const st = doc.createElement('style');
        st.id = 'gjsf-canvas-style';
        st.textContent = CANVAS_CSS;
        (doc.head || doc.documentElement).appendChild(st);
      }
    };
    const onFrame = (a?: any): void => guard(a?.window?.document || a?.frame?.view?.getDoc?.() || editor.Canvas.getDocument());
    editor.on('canvas:frame:load', onFrame);
    this.offs.push(() => editor.off('canvas:frame:load', onFrame));
    editor.onReady(() => {
      try {
        guard(editor.Canvas.getDocument());
      } catch {
        /* no canvas */
      }
    });

    const onAdd = (c: Component): void => {
      if (c?.get?.('type') !== FORM_TYPE) return;
      if (c.get('gjsfCreate')) {
        c.unset('gjsfCreate');
        host.onCreate(c);
      } else if (c.get('formId') && !c.components().length) this.rebuild(c);
      this.ensureCss();
    };
    editor.on('component:add', onAdd);
    this.offs.push(() => editor.off('component:add', onAdd));

    const onSelect = (c: Component): void => {
      if (c?.get?.('type') === FORM_TYPE) this.refreshTraits(c);
    };
    editor.on('component:selected', onSelect);
    this.offs.push(() => editor.off('component:selected', onSelect));
  }

  traits(): any[] {
    return [
      { type: 'select', name: 'formId', label: this.host.labels.chooseForm(), changeProp: true, options: this.selectOptions() },
      { type: 'button', name: 'gjsf-edit', label: false, text: this.host.labels.editForm(), full: true, command: this.host.editCommand },
      ...(this.host.settings ? [settingsTrait] : []),
    ];
  }

  /**
   * The form of a component and the field it belongs to: the index of its
   * top-level part (fields come first, in order; then the honeypot, the
   * button, the message) — `null` for the form itself.
   */
  targetOf(c: Component): { form: Component; formId: string; index: number | null } | null {
    let x: any = c;
    let top: any = null;
    while (x && x.get?.('type') !== FORM_TYPE) {
      top = x;
      x = x.parent?.();
    }
    if (!x) return null;
    const formId = String(x.get('formId') || '');
    return { form: x, formId, index: top ? x.components().indexOf(top) : null };
  }

  private selectOptions(): Array<{ id: string; name: string }> {
    return [{ id: '', name: this.host.labels.noForm() }, ...this.host.formOptions()];
  }

  /** The trait list of a form component (labels and the list of forms change). */
  refreshTraits(c: Component): void {
    const tr = c.getTrait?.('formId') as any;
    if (tr) {
      tr.set('options', this.selectOptions());
      tr.set('label', this.host.labels.chooseForm());
    } else (c as any).set('traits', this.traits());
    const b = c.getTrait?.('gjsf-edit') as any;
    b?.set('text', this.host.labels.editForm());
    const sel = this.editor.getSelected();
    if (sel === c) {
      // Re-render the open trait manager.
      try {
        (this.editor as any).TraitManager?.render?.();
      } catch {
        /* older builds */
      }
    }
  }

  /** All form components of the open project. */
  all(): Component[] {
    const out: Component[] = [];
    const walk = (c: Component): void => {
      if (c.get('type') === FORM_TYPE) out.push(c);
      c.components().forEach(walk);
    };
    const w = this.editor.getWrapper();
    if (w) walk(w);
    return out;
  }

  /** Adds the rules the site needs once (in the project CSS). */
  ensureCss(): void {
    const css = this.editor.Css;
    if (!css.getRule(`.${CLS.hp}`)) css.addRules(REQUIRED_CSS);
  }

  /**
   * Rebuilds a form component from its form: its parts are replaced, the
   * attributes the plugin owns rewritten; the user's classes and own
   * attributes of the `<form>` stay. Not on the undo stack. A component
   * whose form is gone keeps its parts (a copy) and is marked.
   */
  rebuild(c: Component): void {
    const id = String(c.get('formId') || '');
    const form = this.host.form(id);
    const ph = { 'data-gjsf-placeholder': this.host.labels.noForm() };
    const run = (): void => {
      const attrs = { ...c.getAttributes() } as Record<string, string>;
      const prevOwn: string[] = c.get('gjsfOwnAttrs') || [];
      [...OWN_ATTRS, ...prevOwn].forEach((k) => delete attrs[k]);
      if (!id) {
        delete attrs[FORM_ATTR];
        c.setAttributes({ ...attrs, ...ph });
        c.components().reset();
        return;
      }
      if (!form) {
        c.setAttributes({ ...attrs, [FORM_ATTR]: id, 'data-gjsf-missing': '', 'data-gjsf-placeholder': this.host.labels.missingForm() });
        return;
      }
      const o = this.host.buildOptions(form, c);
      const fa = formAttrs(form, o);
      delete attrs['data-gjsf-placeholder'];
      const own = Object.keys(form.attrs || {}).filter((k) => k !== 'class');
      c.set('gjsfOwnAttrs', own);
      c.setAttributes({ ...attrs, ...fa, ...ph });
      (form.attrs?.class || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => c.addClass(cls));
      const sel = this.editor.getSelected();
      const inside = !!sel && sel !== c && sel.closest?.(`[${FORM_ATTR}]`) === c;
      const selId = inside ? sel!.getId() : '';
      // Where the selected part is (child indexes): found again when its id changed (a field renamed).
      const selPath: number[] = [];
      for (let x: any = inside ? sel : null; x && x !== c; x = x.parent?.()) selPath.unshift(x.parent().components().indexOf(x));
      const key = c.get('gjsfKey') || randomKey();
      // One reset with the new parts: GrapesJS keeps the `#id` rules of ids that stay.
      c.components().reset(stableIds(buildChildren(form, { ...o, key }), String(key).replace(/[^\w-]/g, '')).map(toComponent) as any);
      this.ensureCss();
      if (selId) {
        let again: any = this.find(c, (x) => x.getId() === selId);
        if (!again) {
          again = c;
          for (const i of selPath) again = again?.components().at(i);
        }
        if (again) this.editor.select(again);
      }
    };
    const um = this.editor.UndoManager as any;
    if (um?.skip) um.skip(run);
    else run();
  }

  private find(root: Component, test: (c: Component) => boolean): Component | undefined {
    let hit: Component | undefined;
    const walk = (x: Component): void => {
      if (hit) return;
      if (test(x)) hit = x;
      else x.components().forEach(walk);
    };
    root.components().forEach(walk);
    return hit;
  }

  /** Rebuilds the components of one form (all when no id); `stale` — only those built from another version or for another page. */
  rebuildAll(formId?: string | null, stale?: (c: Component, f: FormDef) => boolean): number {
    let n = 0;
    this.all().forEach((c) => {
      const id = String(c.get('formId') || '');
      if (formId && id !== formId) return;
      const f = this.host.form(id);
      if (stale && f && !stale(c, f)) return;
      if (stale && !f && !id) return;
      this.rebuild(c);
      n++;
    });
    return n;
  }

  destroy(): void {
    this.offs.splice(0).forEach((off) => off());
  }
}
