/**
 * A form is data, not a design: a list of fields with their settings. The
 * plugin builds a GrapesJS component from it (plain HTML elements with
 * stable classes, styled by the site's own CSS), the site posts what the
 * visitor typed to the form's endpoint, and a server can check it with
 * `validateSubmission` against the same schema.
 */

/** Fields that take input. */
export type InputFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'password'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkboxes'
  | 'date'
  | 'time'
  | 'datetime'
  | 'range'
  | 'color'
  | 'file'
  | 'hidden';

/** Text between fields; sends nothing. */
export type ContentFieldType = 'heading' | 'paragraph';

export type FieldType = InputFieldType | ContentFieldType;

export const INPUT_TYPES: readonly InputFieldType[] = [
  'text',
  'email',
  'tel',
  'url',
  'number',
  'password',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'checkboxes',
  'date',
  'time',
  'datetime',
  'range',
  'color',
  'file',
  'hidden',
];
export const CONTENT_TYPES: readonly ContentFieldType[] = ['heading', 'paragraph'];
export const FIELD_TYPES: readonly FieldType[] = [...INPUT_TYPES, ...CONTENT_TYPES];

/** Types with a list of options. */
export const CHOICE_TYPES: readonly FieldType[] = ['select', 'radio', 'checkboxes'];
/** Types whose input is an `<input type=…>` with a text-like value. */
export const TEXT_LIKE: readonly FieldType[] = ['text', 'email', 'tel', 'url', 'password', 'textarea'];
/** Types with min / max / step. */
export const RANGE_TYPES: readonly FieldType[] = ['number', 'range', 'date', 'time', 'datetime'];

export const isContent = (t: FieldType): t is ContentFieldType => (CONTENT_TYPES as readonly string[]).includes(t);
export const hasOptions = (t: FieldType): boolean => CHOICE_TYPES.includes(t);

export type FieldWidth = 'full' | '1/2' | '1/3' | '2/3' | '1/4' | '3/4';
export const WIDTHS: readonly FieldWidth[] = ['full', '1/2', '1/3', '2/3', '1/4', '3/4'];

export interface FieldOption {
  label: string;
  value: string;
}

export interface FormField {
  /** Stable key in the editor (survives renames). */
  id: string;
  type: FieldType;
  /** Key of the value in a submission: `^[A-Za-z_][A-Za-z0-9_.\-\[\]]{0,63}$`, unique in its form. Content fields have none. */
  name: string;
  label?: string;
  /** The input's `placeholder`. */
  placeholder?: string;
  /** A line under the input. */
  help?: string;
  required?: boolean;
  /**
   * Default value; for `hidden` the value sent. May hold `{{placeholders}}`
   * (`{{page.slug}}`, `{{query.utm_source}}`, `{{url}}`…, see placeholders.ts).
   * `checkboxes`: values joined by `,`; `checkbox`: `1` checked.
   */
  value?: string;
  /** `select`, `radio`, `checkboxes`. */
  options?: FieldOption[];
  /** `select`: several values; `file`: several files. */
  multiple?: boolean;
  min?: string;
  max?: string;
  step?: string;
  minLength?: number;
  maxLength?: number;
  /** A regular expression the whole value must match (HTML `pattern`). */
  pattern?: string;
  /** `file`: `image/*,.pdf`. */
  accept?: string;
  autocomplete?: string;
  /** `textarea`: visible rows. */
  rows?: number;
  readonly?: boolean;
  disabled?: boolean;
  width?: FieldWidth;
  /** Extra attributes of the input (`data-*`, `aria-*`, `inputmode`, `class`…). `on*` are dropped. */
  attrs?: Record<string, string>;
  /** `heading` / `paragraph`: the text. */
  text?: string;
}

export interface FormSettings {
  /** Where the site posts: a full URL; empty — `<submitUrl>/forms/<id>/submissions` of the plugin options. */
  endpoint?: string;
  /** Shown after a successful submit (text). */
  successMessage?: string;
  /** Shown when the server refuses or cannot be reached. */
  errorMessage?: string;
  /** Opened after a successful submit instead of the message. */
  redirect?: string;
  /** Clear the form after a successful submit (default true). */
  reset?: boolean;
  /** A hidden trap field for bots (default true). */
  honeypot?: boolean;
  /** Text of the submit button. */
  submitLabel?: string;
}

export interface FormDef {
  id: string;
  name: string;
  fields: FormField[];
  settings: FormSettings;
  /** Extra attributes of the `<form>` (`data-*`, `class`, `autocomplete`…). */
  attrs?: Record<string, string>;
  version?: string | number;
  updatedAt?: string;
}

/* ------------------------------------------------------------------ */

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.\-[\]]{0,63}$/;
const ATTR_NAME_RE = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;
/** Attributes a field may not set: the plugin owns them, or they run code. */
const RESERVED_ATTRS = new Set(['id', 'name', 'type', 'value', 'for', 'form', 'formaction', 'srcdoc', 'action', 'method']);

/** A submission key from a label: `Your e-mail` → `your_e_mail`. */
export function fieldName(label: string): string {
  const s = String(label || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (!s) return '';
  return /^[a-z_]/.test(s) ? s : `f_${s}`.slice(0, 64);
}

/** `name`, or `name_2`, `name_3`… when taken. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name}_${n}`.slice(0, 64))) n++;
  return `${name}_${n}`.slice(0, 64);
}

/** Attributes with safe names and string values; `on*` handlers, reserved names and `javascript:` URLs dropped. */
export function cleanAttrs(raw: unknown, reserved: ReadonlySet<string> = RESERVED_ATTRS): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([k0, v]) => {
    const k = String(k0).trim();
    if (!ATTR_NAME_RE.test(k) || /^on/i.test(k) || reserved.has(k.toLowerCase())) return;
    if (v == null || typeof v === 'object') return;
    const s = String(v);
    if (/^\s*(javascript|vbscript|data:text\/html)/i.test(s)) return;
    out[k] = s;
  });
  return Object.keys(out).length ? out : undefined;
}

let seq = 0;
export const fieldId = (): string => `f${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const str = (v: unknown): string | undefined => (v == null || v === '' ? undefined : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined);
const int = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

/** Options from `[{label, value}]`, `['a', 'b']` or `"a\nb"`; empty and repeated values dropped. */
export function normalizeOptions(raw: unknown): FieldOption[] {
  const list = typeof raw === 'string' ? raw.split(/\r?\n/) : Array.isArray(raw) ? raw : [];
  const out: FieldOption[] = [];
  const seen = new Set<string>();
  list.forEach((o: any) => {
    let label: string | undefined;
    let value: string | undefined;
    if (typeof o === 'string' || typeof o === 'number') {
      const s = String(o).trim();
      // "value|Label" in the text form
      const i = s.indexOf('|');
      if (i > 0) {
        value = s.slice(0, i).trim();
        label = s.slice(i + 1).trim();
      } else value = label = s;
    } else if (o && typeof o === 'object') {
      value = str(o.value ?? o.label ?? o.text);
      label = str(o.label ?? o.text ?? o.value);
    }
    if (value == null || value === '' || seen.has(value)) return;
    seen.add(value);
    out.push({ label: label || value, value });
  });
  return out;
}

/** One field cleaned (unknown type → `text`); `null` for junk. Names are made unique by `normalizeFields`. */
export function normalizeField(f: any): FormField | null {
  if (!f || typeof f !== 'object') return null;
  const type: FieldType = (FIELD_TYPES as readonly string[]).includes(f.type) ? f.type : 'text';
  const out: FormField = { id: typeof f.id === 'string' && f.id ? f.id : fieldId(), type, name: '' };
  if (!isContent(type)) {
    out.name = typeof f.name === 'string' && NAME_RE.test(f.name) ? f.name : fieldName(f.name || f.label || '') || type;
  }
  const s = (k: keyof FormField): void => {
    const v = str(f[k]);
    if (v !== undefined) (out as any)[k] = v;
  };
  (['label', 'placeholder', 'help', 'value', 'min', 'max', 'step', 'pattern', 'accept', 'autocomplete', 'text'] as const).forEach(s);
  (['required', 'multiple', 'readonly', 'disabled'] as const).forEach((k) => {
    if (f[k] === true) out[k] = true;
  });
  (['minLength', 'maxLength', 'rows'] as const).forEach((k) => {
    const n = int(f[k]);
    if (n !== undefined) out[k] = n;
  });
  if ((WIDTHS as readonly string[]).includes(f.width) && f.width !== 'full') out.width = f.width;
  if (hasOptions(type)) out.options = normalizeOptions(f.options);
  const attrs = cleanAttrs(f.attrs);
  if (attrs) out.attrs = attrs;
  if (type === 'hidden') {
    delete out.required;
    delete out.placeholder;
    delete out.width;
  }
  if (isContent(type)) {
    (['required', 'placeholder', 'value', 'help'] as const).forEach((k) => delete out[k]);
    if (out.text === undefined && out.label) out.text = out.label;
    delete out.label;
  }
  return out;
}

/** The fields of a form: cleaned, names unique (`email`, `email_2`), ids unique. */
export function normalizeFields(raw: unknown): FormField[] {
  const out: FormField[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  (Array.isArray(raw) ? raw : []).forEach((x) => {
    const f = normalizeField(x);
    if (!f) return;
    if (ids.has(f.id)) f.id = fieldId();
    ids.add(f.id);
    if (!isContent(f.type)) {
      f.name = uniqueName(f.name, names);
      names.add(f.name);
    }
    out.push(f);
  });
  return out;
}

export function normalizeSettings(raw: any): FormSettings {
  const o = raw && typeof raw === 'object' ? raw : {};
  const out: FormSettings = {};
  (['endpoint', 'successMessage', 'errorMessage', 'redirect', 'submitLabel'] as const).forEach((k) => {
    const v = str(o[k]);
    if (v !== undefined && v.trim()) out[k] = v.trim();
  });
  if (out.endpoint && !isSafeUrl(out.endpoint)) delete out.endpoint;
  if (out.redirect && !isSafeUrl(out.redirect)) delete out.redirect;
  if (o.reset === false) out.reset = false;
  if (o.honeypot === false) out.honeypot = false;
  return out;
}

/** http(s), protocol-relative or a path; no `javascript:`. */
export const isSafeUrl = (u: string): boolean => /^(https?:\/\/|\/|\.{0,2}\/|\?|#)/i.test(u.trim()) || !/^[a-z][a-z0-9+.-]*:/i.test(u.trim());

export function normalizeForm(raw: any): FormDef {
  const o = raw && typeof raw === 'object' ? raw : {};
  const form: FormDef = {
    id: str(o.id) || '',
    name: (str(o.name) || '').trim() || 'Form',
    fields: normalizeFields(o.fields),
    settings: normalizeSettings(o.settings),
  };
  const attrs = cleanAttrs(o.attrs);
  if (attrs) form.attrs = attrs;
  if (o.version !== undefined && o.version !== null) form.version = o.version;
  if (typeof o.updatedAt === 'string') form.updatedAt = o.updatedAt;
  return form;
}

/** Fields that end up in a submission (no headings, no paragraphs). */
export const inputFields = (form: Pick<FormDef, 'fields'>): FormField[] => form.fields.filter((f) => !isContent(f.type));

export const fieldTitle = (f: FormField): string => f.label || f.text || f.name || f.type;

/* --------------------------- validation ---------------------------- */

export type ProblemCode = 'required' | 'email' | 'url' | 'number' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'option' | 'date' | 'time' | 'color';

export interface Problem {
  field: string;
  code: ProblemCode;
}

export type SubmissionData = Record<string, unknown>;

export interface ValidationResult {
  ok: boolean;
  problems: Problem[];
  /** `{ field: [code, …] }` — the shape of the API's 422 `errors`. */
  errors: Record<string, string[]>;
  /** Known fields only, trimmed; checkboxes as arrays, a checkbox as boolean, numbers as numbers. */
  data: SubmissionData;
  /** The trap field was filled: a bot. Answer as if all went well, keep nothing. */
  spam: boolean;
}

export const HONEYPOT = '_gjsf_hp';

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || v === false;

const toList = (v: unknown): string[] =>
  v == null || v === '' ? [] : Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x !== '') : String(v).split(',').map((x) => x.trim()).filter(Boolean);

const truthy = (v: unknown): boolean => v === true || v === 1 || (typeof v === 'string' && /^(1|true|on|yes)$/i.test(v.trim()));

/**
 * Checks a submission against its form, as a server would: required fields,
 * formats (e-mail, URL, number, date, time, colour), ranges, lengths,
 * patterns, options. Values of unknown names are dropped; files are not
 * looked into (a `file` field is required when its value is not empty).
 */
export function validateSubmission(form: Pick<FormDef, 'fields'>, raw: SubmissionData = {}): ValidationResult {
  const problems: Problem[] = [];
  const data: SubmissionData = {};
  const add = (field: string, code: ProblemCode): void => void problems.push({ field, code });
  const spam = !!raw && typeof raw[HONEYPOT] === 'string' && (raw[HONEYPOT] as string).trim() !== '';

  inputFields(form).forEach((f) => {
    const v = raw?.[f.name];
    if (f.type === 'checkbox') {
      const on = truthy(v);
      if (f.required && !on) add(f.name, 'required');
      data[f.name] = on;
      return;
    }
    if (f.type === 'checkboxes' || (f.type === 'select' && f.multiple)) {
      const list = toList(v);
      if (!list.length) {
        if (f.required) add(f.name, 'required');
        data[f.name] = [];
        return;
      }
      const allowed = new Set((f.options || []).map((o) => o.value));
      if (allowed.size && list.some((x) => !allowed.has(x))) add(f.name, 'option');
      data[f.name] = list;
      return;
    }
    if (f.type === 'file') {
      if (isEmpty(v)) {
        if (f.required) add(f.name, 'required');
        return;
      }
      data[f.name] = v;
      return;
    }
    const s = isEmpty(v) ? '' : Array.isArray(v) ? String(v[0] ?? '') : String(v);
    const val = f.type === 'textarea' || f.type === 'password' ? s : s.trim();
    if (!val) {
      if (f.required) add(f.name, 'required');
      data[f.name] = f.type === 'number' || f.type === 'range' ? null : '';
      return;
    }
    if (TEXT_LIKE.includes(f.type)) {
      if (f.minLength != null && val.length < f.minLength) add(f.name, 'minLength');
      if (f.maxLength != null && val.length > f.maxLength) add(f.name, 'maxLength');
    }
    if (f.type === 'email' && !EMAIL_RE.test(val)) add(f.name, 'email');
    if (f.type === 'url' && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(val)) add(f.name, 'url');
    if (f.type === 'color' && !COLOR_RE.test(val)) add(f.name, 'color');
    if (f.pattern && TEXT_LIKE.includes(f.type)) {
      try {
        if (!new RegExp(`^(?:${f.pattern})$`, 'u').test(val)) add(f.name, 'pattern');
      } catch {
        /* a broken pattern checks nothing (browsers ignore it too) */
      }
    }
    if (hasOptions(f.type)) {
      const allowed = new Set((f.options || []).map((o) => o.value));
      if (allowed.size && !allowed.has(val)) add(f.name, 'option');
    }
    if (f.type === 'number' || f.type === 'range') {
      const n = Number(val.replace(',', '.'));
      if (!Number.isFinite(n)) {
        add(f.name, 'number');
        data[f.name] = val;
        return;
      }
      if (f.min != null && f.min !== '' && n < Number(f.min)) add(f.name, 'min');
      if (f.max != null && f.max !== '' && n > Number(f.max)) add(f.name, 'max');
      data[f.name] = n;
      return;
    }
    const fmtRe = f.type === 'date' ? DATE_RE : f.type === 'time' ? TIME_RE : f.type === 'datetime' ? DT_RE : null;
    if (fmtRe) {
      if (!fmtRe.test(val)) add(f.name, f.type === 'time' ? 'time' : 'date');
      else {
        // ISO strings of one shape compare as text
        if (f.min && val < f.min) add(f.name, 'min');
        if (f.max && val > f.max) add(f.name, 'max');
      }
    }
    data[f.name] = val;
  });

  const errors: Record<string, string[]> = {};
  problems.forEach((p) => (errors[p.field] ||= []).push(p.code));
  return { ok: !problems.length, problems, errors, data, spam };
}
