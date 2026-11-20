import { MemoryFormStore } from '../../src/store/MemoryFormStore';
import { ConflictError, StoreError } from '../../src/store/types';

export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
}

/**
 * The REST contract (openapi.yaml) in memory, over a MemoryFormStore:
 * snake_case on the wire, If-Match → 412, 404s, 422 with `errors`.
 */
export class FakeFormServer {
  readonly store = new MemoryFormStore();
  calls: Call[] = [];

  constructor(readonly base = 'https://api.test/forms-api') {}

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname.slice(new URL(this.base).pathname.length);
    const method = (init.method || 'GET').toUpperCase();
    const headers = (init.headers || {}) as Record<string, string>;
    let body: any;
    if (init.body instanceof FormData) {
      body = {};
      init.body.forEach((v, k) => (body[k] = typeof v === 'string' ? v : { file: (v as File).name }));
    } else body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, path: path + url.search, headers, body });
    const json = (status: number, data?: unknown) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    const ifMatch = headers['If-Match'] ? headers['If-Match'].replace(/"/g, '') : null;
    const wf = (f: any) => ({ id: f.id, name: f.name, fields: f.fields, settings: f.settings, ...(f.attrs ? { attrs: f.attrs } : {}), version: f.version, updated_at: f.updatedAt });
    try {
      if (path === '/forms' && method === 'GET') return json(200, { items: (await this.store.listForms()).map(wf) });
      let m = path.match(/^\/forms\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const f = await this.store.getForm(id);
          return f ? json(200, wf(f)) : json(404, { error: 'Not found.' });
        }
        if (method === 'PUT') {
          const cur = await this.store.getForm(id);
          if (!body?.name) return json(422, { error: 'The given data was invalid.', errors: { name: ['required'] } });
          const f = await this.store.saveForm({ id, name: body.name, fields: body.fields || [], settings: body.settings || {}, attrs: body.attrs }, ifMatch);
          return json(cur ? 200 : 201, wf(f));
        }
        if (method === 'DELETE') {
          await this.store.deleteForm(id);
          return json(204);
        }
      }
      m = path.match(/^\/forms\/([^/]+)\/submissions(?:\/([^/]+))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (method === 'POST' && !m[2]) {
          const data = body?.data ?? body;
          const r = await this.store.submit(id, data, body?.meta);
          return json(201, { id: r.id, created_at: r.createdAt, ...(this.reply || {}) });
        }
        if (method === 'GET' && !m[2]) {
          const p = await this.store.listSubmissions(id, { limit: Number(url.searchParams.get('limit')) || 50, offset: Number(url.searchParams.get('offset')) || 0 });
          return json(200, { items: p.items.map((s) => ({ id: s.id, form_id: s.formId, data: s.data, meta: s.meta, created_at: s.createdAt })), total: p.total });
        }
        if (method === 'DELETE' && m[2]) {
          await this.store.deleteSubmission(id, decodeURIComponent(m[2]));
          return json(204);
        }
      }
      return json(404, { error: 'Not found.' });
    } catch (e) {
      if (e instanceof ConflictError) return json(412, { error: 'Precondition failed.' });
      if (e instanceof StoreError) return json(e.status, { error: e.message, errors: e.errors });
      throw e;
    }
  };

  /** Extra fields of the submit answer (`message`, `redirect`). */
  reply: Record<string, unknown> | null = null;
}
