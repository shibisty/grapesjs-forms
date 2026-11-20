import { normalizeForm, type FormDef, type SubmissionData } from '../schema';
import { ConflictError, type FormStore, type FormWrite, type Submission, type SubmissionMeta, type SubmissionPage, type SubmitResult, StoreError } from './types';

export interface RestOptions {
  /** Base URL of a server that implements openapi.yaml (no trailing slash needed). */
  url: string;
  /** Extra headers for every request (an API key from your backend, a CSRF token). */
  headers?: (() => Record<string, string>) | null;
  /** `fetch` credentials, e.g. `include` for a cookie session on another origin. */
  credentials?: RequestCredentials;
  /** `fetch` implementation (tests). */
  fetch?: typeof fetch;
}

interface WireForm {
  id: string;
  name: string;
  fields?: unknown[];
  settings?: unknown;
  attrs?: unknown;
  version?: string | number;
  updated_at?: string;
}

interface WireSubmission {
  id: string;
  form_id: string;
  data?: SubmissionData;
  meta?: Record<string, unknown>;
  created_at: string;
}

const form = (w: WireForm): FormDef => normalizeForm({ ...w, updatedAt: w.updated_at });

const metaIn = (m: Record<string, unknown> | undefined): SubmissionMeta | undefined => {
  if (!m) return undefined;
  const { page_id, ...rest } = m;
  return { ...rest, ...(page_id != null ? { pageId: String(page_id) } : {}) };
};

export const metaOut = (m: SubmissionMeta | undefined): Record<string, unknown> | undefined => {
  if (!m) return undefined;
  const { pageId, ...rest } = m;
  return { ...rest, ...(pageId != null ? { page_id: pageId } : {}) };
};

const submission = (w: WireSubmission): Submission => ({
  id: w.id,
  formId: w.form_id,
  data: w.data || {},
  createdAt: w.created_at,
  ...(w.meta ? { meta: metaIn(w.meta) } : {}),
});

const isFile = (v: unknown): boolean => (typeof Blob !== 'undefined' && v instanceof Blob) || (Array.isArray(v) && v.some(isFile));

/** The public submit address of a form on a server of openapi.yaml. */
export const submitUrlOf = (base: string, formId: string): string => `${(base || '').trim().replace(/\/+$/, '')}/forms/${encodeURIComponent(formId)}/submissions`;

/** The contract in openapi.yaml over `fetch`. */
export class RestFormStore implements FormStore {
  constructor(private readonly opts: RestOptions) {}

  get base(): string {
    return (this.opts.url || '').trim().replace(/\/+$/, '');
  }

  async request<T>(method: string, path: string, { body, version, raw }: { body?: unknown; version?: string | number | null; raw?: FormData } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (version != null) headers['If-Match'] = `"${version}"`;
    Object.assign(headers, this.opts.headers?.() || {});
    const doFetch = this.opts.fetch || globalThis.fetch.bind(globalThis);
    const res = await doFetch(this.base + path, {
      method,
      headers,
      credentials: this.opts.credentials,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    if (res.status === 412) throw new ConflictError();
    if (!res.ok) {
      let msg = `${method} ${path}: HTTP ${res.status}`;
      let errors: Record<string, string[]> = {};
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
        else if (j?.message) msg = j.message;
        if (j?.errors) errors = j.errors;
      } catch {
        /* not JSON */
      }
      throw new StoreError(msg, res.status, errors);
    }
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async listForms(): Promise<FormDef[]> {
    const r = await this.request<{ items?: WireForm[] }>('GET', '/forms');
    return (r?.items || []).map(form);
  }

  async getForm(id: string): Promise<FormDef | undefined> {
    try {
      return form(await this.request<WireForm>('GET', `/forms/${encodeURIComponent(id)}`));
    } catch (e) {
      if (e instanceof StoreError && e.status === 404) return undefined;
      throw e;
    }
  }

  async saveForm(w: FormWrite, ifVersion?: string | number | null): Promise<FormDef> {
    const body: Record<string, unknown> = { name: w.name, fields: w.fields, settings: w.settings };
    if (w.attrs) body.attrs = w.attrs;
    return form(await this.request<WireForm>('PUT', `/forms/${encodeURIComponent(w.id)}`, { body, version: ifVersion }));
  }

  async deleteForm(id: string): Promise<void> {
    try {
      await this.request('DELETE', `/forms/${encodeURIComponent(id)}`);
    } catch (e) {
      if (!(e instanceof StoreError && e.status === 404)) throw e;
    }
  }

  /** JSON `{ data, meta }`; with files `multipart/form-data` (fields by name, `_meta` as JSON). */
  async submit(formId: string, data: SubmissionData, meta?: SubmissionMeta): Promise<SubmitResult> {
    const path = `/forms/${encodeURIComponent(formId)}/submissions`;
    let r: { id?: string; created_at?: string; message?: string; redirect?: string } | null;
    if (Object.values(data).some(isFile)) {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach((x) => (x instanceof Blob ? fd.append(k, x) : x != null && fd.append(k, String(x)))));
      if (meta) fd.append('_meta', JSON.stringify(metaOut(meta)));
      r = await this.request('POST', path, { raw: fd });
    } else r = await this.request('POST', path, { body: { data, ...(meta ? { meta: metaOut(meta) } : {}) } });
    return {
      ...(r?.id ? { id: r.id } : {}),
      ...(r?.created_at ? { createdAt: r.created_at } : {}),
      ...(r?.message ? { message: r.message } : {}),
      ...(r?.redirect ? { redirect: r.redirect } : {}),
    };
  }

  async listSubmissions(formId: string, page: { limit?: number; offset?: number } = {}): Promise<SubmissionPage> {
    const q = new URLSearchParams();
    if (page.limit) q.set('limit', String(page.limit));
    if (page.offset) q.set('offset', String(page.offset));
    const qs = q.toString();
    const r = await this.request<{ items?: WireSubmission[]; total?: number }>('GET', `/forms/${encodeURIComponent(formId)}/submissions${qs ? `?${qs}` : ''}`);
    const items = (r?.items || []).map(submission);
    return { items, total: typeof r?.total === 'number' ? r.total : items.length };
  }

  async deleteSubmission(formId: string, id: string): Promise<void> {
    try {
      await this.request('DELETE', `/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(id)}`);
    } catch (e) {
      if (!(e instanceof StoreError && e.status === 404)) throw e;
    }
  }
}
