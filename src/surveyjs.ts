import { fieldId, normalizeForm, type FieldType, type FormDef, type FormField } from './schema';

/**
 * SurveyJS JSON (survey-library / Survey Creator) in and out, for the parts
 * that are plain forms: text inputs of every `inputType`, comment, dropdown,
 * tagbox, radiogroup, checkbox, boolean, rating, file, html; panels and
 * pages are flattened. Logic (visibleIf, expressions, matrices…) has no
 * place in a plain HTML form: such questions are listed in `skipped`.
 */

export interface SurveyImport {
  form: FormDef;
  /** `name (type)` of questions left out. */
  skipped: string[];
}

type Json = Record<string, any>;

const text = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    // Localized: { default: 'Name', ru: 'Имя' }
    const o = v as Record<string, unknown>;
    const s = o.default ?? o.en ?? Object.values(o)[0];
    return typeof s === 'string' ? s : undefined;
  }
  return String(v);
};

const strip = (html: string | undefined): string | undefined => (html == null ? undefined : html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined);

const choices = (list: unknown): Array<{ label: string; value: string }> =>
  (Array.isArray(list) ? list : []).map((c: any) =>
    c && typeof c === 'object' ? { value: String(c.value ?? text(c.text) ?? ''), label: text(c.text) ?? String(c.value ?? '') } : { value: String(c), label: String(c) }
  );

const INPUT_TYPES: Record<string, FieldType> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  password: 'password',
  date: 'date',
  time: 'time',
  'datetime-local': 'datetime',
  range: 'range',
  color: 'color',
};

function elementsOf(json: Json): Json[] {
  const out: Json[] = [];
  const walk = (list: unknown): void =>
    (Array.isArray(list) ? list : []).forEach((el: Json) => {
      if (!el || typeof el !== 'object') return;
      if (el.type === 'panel' || el.type === 'flowpanel') {
        const title = text(el.title);
        if (title) out.push({ type: 'html', html: title, __heading: true });
        walk(el.elements || el.questions);
      } else out.push(el);
    });
  if (Array.isArray(json.pages)) json.pages.forEach((p: Json) => walk(p?.elements || p?.questions));
  walk(json.elements || json.questions);
  return out;
}

/** A SurveyJS survey as a form (an id is given by the caller). */
export function fromSurveyJs(json: Json, id = ''): SurveyImport {
  const skipped: string[] = [];
  const fields: Array<Partial<FormField>> = [];
  elementsOf(json || {}).forEach((q) => {
    const base: Partial<FormField> = { id: fieldId(), name: q.name, label: text(q.title) ?? q.name };
    if (q.isRequired) base.required = true;
    const placeholder = text(q.placeholder ?? q.placeHolder);
    if (placeholder) base.placeholder = placeholder;
    const help = text(q.description);
    if (help) base.help = help;
    if (q.defaultValue != null) base.value = Array.isArray(q.defaultValue) ? q.defaultValue.join(',') : String(q.defaultValue);
    if (q.readOnly) base.readonly = true;
    const width = typeof q.width === 'string' ? q.width.trim() : '';
    if (width === '50%') base.width = '1/2';
    else if (/^33(\.3+)?%$/.test(width)) base.width = '1/3';
    else if (width === '25%') base.width = '1/4';

    switch (q.type) {
      case 'text': {
        const t = INPUT_TYPES[q.inputType || 'text'];
        if (!t) {
          skipped.push(`${q.name} (text/${q.inputType})`);
          return;
        }
        if (q.visible === false) {
          fields.push({ id: base.id, type: 'hidden', name: q.name, value: base.value });
          return;
        }
        const f: Partial<FormField> = { ...base, type: t };
        if (q.min != null) f.min = String(q.min);
        if (q.max != null) f.max = String(q.max);
        if (q.step != null) f.step = String(q.step);
        if (q.maxLength > 0) f.maxLength = q.maxLength;
        if (q.autocomplete) f.autocomplete = q.autocomplete;
        const re = (q.validators || []).find((v: Json) => v?.type === 'regex' && v.regex);
        if (re) f.pattern = String(re.regex).replace(/^\^|\$$/g, '');
        const len = (q.validators || []).find((v: Json) => v?.type === 'text');
        if (len?.minLength > 0) f.minLength = len.minLength;
        if (len?.maxLength > 0) f.maxLength = len.maxLength;
        fields.push(f);
        return;
      }
      case 'comment':
        fields.push({ ...base, type: 'textarea', ...(q.rows ? { rows: q.rows } : {}), ...(q.maxLength > 0 ? { maxLength: q.maxLength } : {}) });
        return;
      case 'dropdown':
        fields.push({ ...base, type: 'select', options: choices(q.choices) });
        return;
      case 'tagbox':
        fields.push({ ...base, type: 'select', multiple: true, options: choices(q.choices) });
        return;
      case 'radiogroup':
        fields.push({ ...base, type: 'radio', options: choices(q.choices) });
        return;
      case 'checkbox':
        fields.push({ ...base, type: 'checkboxes', options: choices(q.choices) });
        return;
      case 'boolean':
        fields.push({ ...base, type: 'checkbox', label: text(q.label) ?? base.label, value: q.defaultValue === true ? '1' : undefined });
        return;
      case 'rating': {
        const values = Array.isArray(q.rateValues) && q.rateValues.length ? choices(q.rateValues) : null;
        const min = Number(q.rateMin ?? 1);
        const max = Number(q.rateMax ?? 5);
        const step = Number(q.rateStep ?? 1) || 1;
        const opts = values || Array.from({ length: Math.max(0, Math.floor((max - min) / step) + 1) }, (_, i) => String(min + i * step)).map((v) => ({ value: v, label: v }));
        fields.push({ ...base, type: 'radio', options: opts });
        return;
      }
      case 'file':
        fields.push({ ...base, type: 'file', ...(q.allowMultiple ? { multiple: true } : {}), ...(q.acceptedTypes ? { accept: q.acceptedTypes } : {}) });
        return;
      case 'html': {
        const t = strip(text(q.html));
        if (t) fields.push({ id: base.id, type: q.__heading || /^\s*<h[1-6][\s>]/i.test(text(q.html) || '') ? 'heading' : 'paragraph', name: '', text: t });
        return;
      }
      case 'expression':
        if (q.name) skipped.push(`${q.name} (expression)`);
        return;
      default:
        skipped.push(`${q.name || '?'} (${q.type})`);
    }
  });
  const form = normalizeForm({
    id,
    name: text(json?.title) || 'Form',
    fields,
    settings: {
      submitLabel: text(json?.completeText),
      successMessage: strip(text(json?.completedHtml)),
      redirect: json?.navigateToUrl,
    },
  });
  if (json?.description) form.fields.unshift({ id: fieldId(), type: 'paragraph', name: '', text: strip(text(json.description)) || '' });
  return { form, skipped };
}

/** A form as a SurveyJS survey (one page). Hidden fields become invisible text questions. */
export function toSurveyJs(form: FormDef): Json {
  const elements: Json[] = [];
  form.fields.forEach((f) => {
    const q: Json = { name: f.name };
    if (f.label) q.title = f.label;
    if (f.required) q.isRequired = true;
    if (f.placeholder) q.placeholder = f.placeholder;
    if (f.help) q.description = f.help;
    if (f.readonly) q.readOnly = true;
    if (f.value) q.defaultValue = f.type === 'checkboxes' ? f.value.split(',').map((x) => x.trim()) : f.type === 'checkbox' ? /^(1|true|on|yes)$/i.test(f.value) : f.value;
    if (f.width === '1/2') q.width = '50%';
    const opts = (f.options || []).map((o) => (o.label === o.value ? o.value : { value: o.value, text: o.label }));
    switch (f.type) {
      case 'heading':
      case 'paragraph':
        elements.push({ type: 'html', name: f.id, html: f.type === 'heading' ? `<h3>${escHtml(f.text || '')}</h3>` : `<p>${escHtml(f.text || '')}</p>` });
        return;
      case 'hidden':
        elements.push({ type: 'text', name: f.name, visible: false, ...(f.value ? { defaultValue: f.value } : {}) });
        return;
      case 'textarea':
        elements.push({ ...q, type: 'comment', ...(f.rows ? { rows: f.rows } : {}), ...(f.maxLength ? { maxLength: f.maxLength } : {}) });
        return;
      case 'select':
        elements.push({ ...q, type: f.multiple ? 'tagbox' : 'dropdown', choices: opts });
        return;
      case 'radio':
        elements.push({ ...q, type: 'radiogroup', choices: opts });
        return;
      case 'checkboxes':
        elements.push({ ...q, type: 'checkbox', choices: opts });
        return;
      case 'checkbox':
        elements.push({ ...q, type: 'boolean', renderAs: 'checkbox', ...(f.label ? { label: f.label } : {}) });
        return;
      case 'file':
        elements.push({ ...q, type: 'file', ...(f.multiple ? { allowMultiple: true } : {}), ...(f.accept ? { acceptedTypes: f.accept } : {}), storeDataAsText: false });
        return;
      default: {
        const inputType = f.type === 'datetime' ? 'datetime-local' : f.type;
        const t: Json = { ...q, type: 'text', ...(inputType !== 'text' ? { inputType } : {}) };
        if (f.min) t.min = f.min;
        if (f.max) t.max = f.max;
        if (f.step) t.step = f.step;
        if (f.maxLength) t.maxLength = f.maxLength;
        if (f.autocomplete) t.autocomplete = f.autocomplete;
        const validators: Json[] = [];
        if (f.pattern) validators.push({ type: 'regex', regex: `^${f.pattern}$` });
        if (f.minLength) validators.push({ type: 'text', minLength: f.minLength });
        if (validators.length) t.validators = validators;
        elements.push(t);
      }
    }
  });
  const out: Json = { title: form.name, pages: [{ name: 'page1', elements }] };
  if (form.settings.submitLabel) out.completeText = form.settings.submitLabel;
  if (form.settings.successMessage) out.completedHtml = `<p>${escHtml(form.settings.successMessage)}</p>`;
  if (form.settings.redirect) out.navigateToUrl = form.settings.redirect;
  return out;
}

const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
