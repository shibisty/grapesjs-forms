import { normalizeForm, validateSubmission, type FormDef, type SubmissionData } from '../schema';
import { clone, uuid } from '../utils';
import { ConflictError, type FormStore, type FormWrite, type Submission, type SubmissionMeta, type SubmissionPage, type SubmitResult, StoreError } from './types';

/**
 * Forms and submissions in memory (tests, demos; the base of the IndexedDB
 * store). Versions are numbers; a submit is checked against the form like a
 * server would (`validateSubmission`), a bot's (honeypot) is dropped.
 */
export class MemoryFormStore implements FormStore {
  protected forms = new Map<string, FormDef>();
  protected submissions = new Map<string, Submission>();

  /** Hook of persistent subclasses: a key changed (`null` value — deleted). */
  protected async changed(_key: string, _value: unknown): Promise<void> {}

  async listForms(): Promise<FormDef[]> {
    return [...this.forms.values()].map(clone);
  }

  async getForm(id: string): Promise<FormDef | undefined> {
    const f = this.forms.get(id);
    return f ? clone(f) : undefined;
  }

  async saveForm(w: FormWrite, ifVersion?: string | number | null): Promise<FormDef> {
    if (!w.id) throw new StoreError('A form needs an id', 422, { id: ['required'] });
    const cur = this.forms.get(w.id);
    if (ifVersion != null && cur && String(cur.version) !== String(ifVersion)) throw new ConflictError();
    const form = normalizeForm({ ...w, version: (Number(cur?.version) || 0) + 1, updatedAt: new Date().toISOString() });
    this.forms.set(form.id, form);
    await this.changed(`form:${form.id}`, form);
    return clone(form);
  }

  async deleteForm(id: string): Promise<void> {
    if (!this.forms.delete(id)) return;
    await this.changed(`form:${id}`, null);
    for (const [sid, s] of [...this.submissions]) {
      if (s.formId !== id) continue;
      this.submissions.delete(sid);
      await this.changed(`submission:${sid}`, null);
    }
  }

  async submit(formId: string, raw: SubmissionData, meta?: SubmissionMeta): Promise<SubmitResult> {
    const form = this.forms.get(formId);
    if (!form) throw new StoreError('No such form', 404);
    const v = validateSubmission(form, raw);
    if (v.spam) return {};
    if (!v.ok) throw new StoreError('The given data was invalid.', 422, v.errors);
    // Files are not kept here: their name, size and type are.
    const isBlob = (x: unknown): x is Blob => typeof Blob !== 'undefined' && x instanceof Blob;
    const fileInfo = (x: unknown): unknown => (isBlob(x) ? { name: (x as File).name || '', size: x.size, type: x.type } : Array.isArray(x) ? x.map(fileInfo) : x);
    const data = Object.fromEntries(Object.entries(v.data).map(([k, x]) => [k, fileInfo(x)]));
    const s: Submission = { id: uuid(), formId, data, createdAt: new Date().toISOString(), ...(meta ? { meta: clone(meta) } : {}) };
    this.submissions.set(s.id, s);
    await this.changed(`submission:${s.id}`, s);
    return { id: s.id, createdAt: s.createdAt };
  }

  async listSubmissions(formId: string, page: { limit?: number; offset?: number } = {}): Promise<SubmissionPage> {
    const all = [...this.submissions.values()].filter((s) => s.formId === formId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const offset = Math.max(0, page.offset || 0);
    const limit = Math.max(1, page.limit || 50);
    return { items: all.slice(offset, offset + limit).map(clone), total: all.length };
  }

  async deleteSubmission(formId: string, id: string): Promise<void> {
    const s = this.submissions.get(id);
    if (!s || s.formId !== formId) return;
    this.submissions.delete(id);
    await this.changed(`submission:${id}`, null);
  }
}
