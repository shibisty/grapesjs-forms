import { resolveBuild, hasTokens, type BuildContext } from './placeholders';
import { cleanAttrs, HONEYPOT, inputFields, isContent, type FormDef, type FormField } from './schema';

/**
 * A form as a tree of plain HTML elements with stable classes. The same tree
 * becomes GrapesJS components (`toComponents`) or an HTML string
 * (`formHtml`, for servers and previews).
 *
 * The classes are the styling contract: the site's CSS (made in the Style
 * Manager like any other) styles `.gjsf-input`, `.gjsf-label`… on every
 * form at once, and a form gets its own look from a class on the form.
 */
export interface El {
  tag: string;
  attrs?: Record<string, string>;
  classes?: string[];
  /** Text or elements. */
  kids?: Array<El | string>;
  /** `<input>` and friends. */
  void?: boolean;
  /** Which part of the form (`field`, `label`, `input`…): `data-gjsf-part`. */
  part: string;
  style?: Record<string, string>;
}

export const CLS = {
  form: 'gjsf-form',
  field: 'gjsf-field',
  label: 'gjsf-label',
  req: 'gjsf-req',
  input: 'gjsf-input',
  options: 'gjsf-options',
  option: 'gjsf-option',
  check: 'gjsf-check',
  optionLabel: 'gjsf-option-label',
  help: 'gjsf-help',
  error: 'gjsf-error',
  heading: 'gjsf-heading',
  text: 'gjsf-text',
  actions: 'gjsf-actions',
  submit: 'gjsf-submit',
  message: 'gjsf-message',
  hp: 'gjsf-hp',
} as const;

export interface BuildOptions {
  /** Where the form posts (`action`); empty — the site handles `gjsf:submit` itself. */
  action?: string;
  /** Makes element ids unique when one form is on a page twice. */
  key?: string;
  ctx?: BuildContext;
  /** Default texts (the form's own settings win). */
  texts?: { submit?: string; success?: string; error?: string };
  /** Texts of problem codes (`required` → "Please fill in…") the site shows for a server's 422 codes. */
  codes?: Record<string, string>;
  /** grapesjs-pages record of the page (sent as `meta.page_id`). */
  pageId?: string | null;
}

const WIDTH_CLASS: Record<string, string> = { '1/2': 'gjsf-w-1-2', '1/3': 'gjsf-w-1-3', '2/3': 'gjsf-w-2-3', '1/4': 'gjsf-w-1-4', '3/4': 'gjsf-w-3-4' };

const INPUT_TYPE: Record<string, string> = { datetime: 'datetime-local' };

/** Extra attributes of a field: its `class` joins the element's classes. */
function extra(f: FormField): { attrs: Record<string, string>; classes: string[] } {
  const a = { ...(f.attrs || {}) };
  const classes = (a.class || '').split(/\s+/).filter(Boolean);
  delete a.class;
  return { attrs: a, classes };
}

/** The attributes of a form element. */
export function formAttrs(form: FormDef, o: BuildOptions = {}): Record<string, string> {
  const s = form.settings || {};
  const attrs: Record<string, string> = { ...(cleanAttrs(form.attrs) || {}) };
  delete attrs.class;
  Object.assign(attrs, {
    'data-gjsf-form': form.id,
    method: 'post',
    'data-gjsf-success': s.successMessage || o.texts?.success || '',
    'data-gjsf-error': s.errorMessage || o.texts?.error || '',
  });
  const action = s.endpoint || o.action || '';
  if (action) attrs.action = action;
  if (form.version != null) attrs['data-gjsf-version'] = String(form.version);
  if (s.redirect) attrs['data-gjsf-redirect'] = s.redirect;
  if (s.reset === false) attrs['data-gjsf-reset'] = 'false';
  if (inputFields(form).some((f) => f.type === 'file')) attrs.enctype = 'multipart/form-data';
  if (o.codes && Object.keys(o.codes).length) attrs['data-gjsf-codes'] = JSON.stringify(o.codes);
  if (o.pageId) attrs['data-gjsf-page'] = o.pageId;
  return attrs;
}

/** The parts inside the `<form>`. */
export function buildChildren(form: FormDef, o: BuildOptions = {}): El[] {
  const ctx: BuildContext = { form: { id: form.id, name: form.name }, ...(o.ctx || {}) };
  const key = (o.key || form.id.slice(0, 8)).replace(/[^\w-]/g, '');
  const idOf = (f: FormField, i?: number): string => `gjsf-${key}-${f.name.replace(/[^\w-]/g, '_')}${i == null ? '' : `-${i}`}`;
  const out: El[] = [];

  form.fields.forEach((f) => {
    if (isContent(f.type)) {
      const { attrs, classes } = extra(f);
      out.push(
        f.type === 'heading'
          ? { tag: 'h3', part: 'heading', classes: [CLS.heading, ...classes], attrs, kids: [f.text || ''] }
          : { tag: 'p', part: 'text', classes: [CLS.text, ...classes], attrs, kids: [f.text || ''] }
      );
      return;
    }

    let value = resolveBuild(f.value || '', ctx);
    const runtime = hasTokens(value) ? value : '';
    if (runtime) value = '';

    if (f.type === 'hidden') {
      const { attrs } = extra(f);
      out.push({
        tag: 'input',
        void: true,
        part: 'hidden',
        attrs: { ...attrs, type: 'hidden', name: f.name, value, ...(runtime ? { 'data-gjsf-value': runtime } : {}) },
      });
      return;
    }

    const { attrs: own, classes: ownCls } = extra(f);
    const id = idOf(f);
    const wrapCls = [CLS.field, `${CLS.field}--${f.type}`, ...(f.width && WIDTH_CLASS[f.width] ? [WIDTH_CLASS[f.width]] : []), ...(f.required ? ['is-required'] : [])];
    const labelKids: Array<El | string> = [f.label || f.name];
    if (f.required) labelKids.push({ tag: 'span', part: 'req', classes: [CLS.req], attrs: { 'aria-hidden': 'true' }, kids: ['*'] });
    const help: El | null = f.help ? { tag: 'div', part: 'help', classes: [CLS.help], attrs: { id: `${id}-help` }, kids: [f.help] } : null;
    const error: El = { tag: 'div', part: 'error', classes: [CLS.error], attrs: { 'data-gjsf-error-for': f.name, 'aria-live': 'polite' } };
    const common: Record<string, string> = {};
    if (f.required) common.required = '';
    if (f.readonly) common.readonly = '';
    if (f.disabled) common.disabled = '';
    if (f.help) common['aria-describedby'] = `${id}-help`;
    if (runtime) common['data-gjsf-value'] = runtime;

    if (f.type === 'radio' || f.type === 'checkboxes') {
      const multi = f.type === 'checkboxes';
      const chosen = new Set(value.split(',').map((x) => x.trim()).filter(Boolean));
      const opts = (f.options || []).map<El>((opt, i) => ({
        tag: 'label',
        part: 'option',
        classes: [CLS.option],
        kids: [
          {
            tag: 'input',
            void: true,
            part: 'check',
            classes: [CLS.check, ...ownCls],
            attrs: {
              ...own,
              type: multi ? 'checkbox' : 'radio',
              name: f.name,
              value: opt.value,
              id: idOf(f, i),
              ...(chosen.has(opt.value) ? { checked: '' } : {}),
              // A required radio group: one input is enough; checkboxes are checked by the script.
              ...(f.required && (!multi ? i === 0 : false) ? { required: '' } : {}),
              ...(f.disabled ? { disabled: '' } : {}),
              ...(runtime ? { 'data-gjsf-value': runtime } : {}),
            },
          },
          { tag: 'span', part: 'option-label', classes: [CLS.optionLabel], kids: [opt.label] },
        ],
      }));
      out.push({
        tag: 'fieldset',
        part: 'field',
        classes: wrapCls,
        attrs: { 'data-gjsf-field': f.name, ...(multi && f.required ? { 'data-gjsf-required': '' } : {}), ...(f.help ? { 'aria-describedby': `${id}-help` } : {}) },
        kids: [{ tag: 'legend', part: 'label', classes: [CLS.label], kids: labelKids }, { tag: 'div', part: 'options', classes: [CLS.options], kids: opts }, ...(help ? [help] : []), error],
      });
      return;
    }

    if (f.type === 'checkbox') {
      out.push({
        tag: 'div',
        part: 'field',
        classes: wrapCls,
        attrs: { 'data-gjsf-field': f.name },
        kids: [
          {
            tag: 'label',
            part: 'option',
            classes: [CLS.option],
            kids: [
              {
                tag: 'input',
                void: true,
                part: 'check',
                classes: [CLS.check, ...ownCls],
                attrs: { ...own, ...common, type: 'checkbox', name: f.name, value: '1', id, ...(/^(1|true|on|yes)$/i.test(value) ? { checked: '' } : {}) },
              },
              { tag: 'span', part: 'option-label', classes: [CLS.optionLabel], kids: labelKids },
            ],
          },
          ...(help ? [help] : []),
          error,
        ],
      });
      return;
    }

    let input: El;
    if (f.type === 'textarea') {
      input = {
        tag: 'textarea',
        part: 'input',
        classes: [CLS.input, ...ownCls],
        attrs: {
          ...own,
          ...common,
          name: f.name,
          id,
          ...(f.placeholder ? { placeholder: f.placeholder } : {}),
          ...(f.rows ? { rows: String(f.rows) } : {}),
          ...(f.minLength != null ? { minlength: String(f.minLength) } : {}),
          ...(f.maxLength != null ? { maxlength: String(f.maxLength) } : {}),
          ...(f.autocomplete ? { autocomplete: f.autocomplete } : {}),
        },
        kids: value ? [value] : [],
      };
    } else if (f.type === 'select') {
      const chosen = new Set(value.split(',').map((x) => x.trim()).filter(Boolean));
      const kids: El[] = [];
      if (!f.multiple) kids.push({ tag: 'option', part: 'choice', attrs: { value: '', ...(chosen.size ? {} : { selected: '' }), ...(f.required ? { disabled: '' } : {}) }, kids: [f.placeholder || '—'] });
      (f.options || []).forEach((opt) => kids.push({ tag: 'option', part: 'choice', attrs: { value: opt.value, ...(chosen.has(opt.value) ? { selected: '' } : {}) }, kids: [opt.label] }));
      input = {
        tag: 'select',
        part: 'input',
        classes: [CLS.input, ...ownCls],
        attrs: { ...own, ...common, name: f.name, id, ...(f.multiple ? { multiple: '' } : {}), ...(f.autocomplete ? { autocomplete: f.autocomplete } : {}) },
        kids,
      };
    } else {
      const a: Record<string, string> = { ...own, ...common, type: INPUT_TYPE[f.type] || f.type, name: f.name, id };
      if (f.placeholder && !['range', 'color', 'file', 'date', 'time', 'datetime'].includes(f.type)) a.placeholder = f.placeholder;
      if (value && f.type !== 'file' && f.type !== 'password') a.value = value;
      if (f.min) a.min = f.min;
      if (f.max) a.max = f.max;
      if (f.step) a.step = f.step;
      if (f.minLength != null) a.minlength = String(f.minLength);
      if (f.maxLength != null) a.maxlength = String(f.maxLength);
      if (f.pattern) a.pattern = f.pattern;
      if (f.accept && f.type === 'file') a.accept = f.accept;
      if (f.multiple && f.type === 'file') a.multiple = '';
      if (f.autocomplete) a.autocomplete = f.autocomplete;
      input = { tag: 'input', void: true, part: 'input', classes: [CLS.input, ...ownCls], attrs: a };
    }
    out.push({
      tag: 'div',
      part: 'field',
      classes: wrapCls,
      attrs: { 'data-gjsf-field': f.name },
      kids: [{ tag: 'label', part: 'label', classes: [CLS.label], attrs: { for: id }, kids: labelKids }, input, ...(help ? [help] : []), error],
    });
  });

  if (form.settings?.honeypot !== false) {
    out.push({
      tag: 'div',
      part: 'hp',
      classes: [CLS.hp],
      attrs: { 'aria-hidden': 'true' },
      style: { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' },
      kids: [{ tag: 'input', void: true, part: 'hp-input', attrs: { type: 'text', name: HONEYPOT, tabindex: '-1', autocomplete: 'off', value: '' } }],
    });
  }
  out.push({
    tag: 'div',
    part: 'actions',
    classes: [CLS.actions],
    kids: [{ tag: 'button', part: 'submit', classes: [CLS.submit], attrs: { type: 'submit' }, kids: [form.settings?.submitLabel || o.texts?.submit || 'Send'] }],
  });
  out.push({ tag: 'div', part: 'message', classes: [CLS.message], attrs: { role: 'status', 'aria-live': 'polite' } });
  return out;
}

/* ----------------------------- HTML ------------------------------- */

const escText = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const escAttr = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const attrsHtml = (el: Pick<El, 'attrs' | 'classes' | 'style'>, part?: string): string => {
  const a: Record<string, string> = { ...(el.classes?.length ? { class: el.classes.join(' ') } : {}), ...(el.attrs || {}) };
  if (part) a['data-gjsf-part'] = part;
  if (el.style) a.style = Object.entries(el.style).map(([k, v]) => `${k}:${v}`).join(';');
  return Object.entries(a)
    .map(([k, v]) => (v === '' && !['value', 'action'].includes(k) ? ` ${k}` : ` ${k}="${escAttr(v)}"`))
    .join('');
};

export function elHtml(el: El | string): string {
  if (typeof el === 'string') return escText(el);
  const open = `<${el.tag}${attrsHtml(el, el.part)}>`;
  if (el.void) return open;
  return `${open}${(el.kids || []).map(elHtml).join('')}</${el.tag}>`;
}

/** The whole `<form>` as HTML (servers, e-mails, previews, sites without GrapesJS). */
export function formHtml(form: FormDef, o: BuildOptions & { classes?: string[] } = {}): string {
  const cls = [CLS.form, ...(form.attrs?.class || '').split(/\s+/).filter(Boolean), ...(o.classes || [])];
  return `<form${attrsHtml({ classes: cls, attrs: formAttrs(form, o) })}>${buildChildren(form, o).map(elHtml).join('')}</form>`;
}
