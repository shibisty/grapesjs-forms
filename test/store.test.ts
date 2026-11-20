import { describe, expect, it } from 'vitest';
import { IndexedDbFormStore } from '../src/store/IndexedDbFormStore';
import { MemoryFormStore } from '../src/store/MemoryFormStore';
import { RestFormStore, submitUrlOf } from '../src/store/RestFormStore';
import { ConflictError, StoreError, type FormStore } from '../src/store/types';
import { FakeFormServer } from './helpers/fakeFormServer';

const contact = { id: 'c1', name: 'Contact', fields: [{ id: 'a', type: 'email', name: 'email', required: true }] as any, settings: { successMessage: 'Thanks' } };

const suite = (name: string, make: () => FormStore | Promise<FormStore>) =>
  describe(name, () => {
    it('forms: save, version, list, get, conflict, delete', async () => {
      const s = await make();
      const f1 = await s.saveForm(contact);
      expect(f1).toMatchObject({ id: 'c1', name: 'Contact', settings: { successMessage: 'Thanks' } });
      expect(f1.fields[0]).toMatchObject({ type: 'email', name: 'email', required: true });
      const f2 = await s.saveForm({ ...contact, name: 'Contact 2' }, f1.version);
      expect(String(f2.version)).not.toBe(String(f1.version));
      await expect(s.saveForm({ ...contact, name: 'stale' }, f1.version)).rejects.toBeInstanceOf(ConflictError);
      expect((await s.listForms()).map((f) => f.name)).toEqual(['Contact 2']);
      expect((await s.getForm('c1'))?.name).toBe('Contact 2');
      expect(await s.getForm('nope')).toBeUndefined();
      await s.deleteForm('c1');
      expect(await s.listForms()).toEqual([]);
      await s.deleteForm('c1'); // twice is fine
    });

    it('submissions: checked, kept newest first, paged, deleted', async () => {
      const s = await make();
      await s.saveForm(contact);
      await expect(s.submit('c1', { email: 'nope' })).rejects.toMatchObject({ status: 422, errors: { email: ['email'] } });
      await expect(s.submit('missing', {})).rejects.toMatchObject({ status: 404 });
      const r1 = await s.submit('c1', { email: 'a@b.co', junk: 1 }, { url: 'https://site/x', pageId: 'p1' });
      expect(r1.id).toBeTruthy();
      await new Promise((r) => setTimeout(r, 5));
      await s.submit('c1', { email: 'c@d.co' });
      expect(await s.submit('c1', { email: 'bot@x.io', _gjsf_hp: 'spam' })).toEqual({});
      const p = await s.listSubmissions!('c1', { limit: 1 });
      expect(p.total).toBe(2);
      expect(p.items[0].data).toEqual({ email: 'c@d.co' });
      const p2 = await s.listSubmissions!('c1', { limit: 1, offset: 1 });
      expect(p2.items[0]).toMatchObject({ data: { email: 'a@b.co' }, meta: { url: 'https://site/x', pageId: 'p1' } });
      await s.deleteSubmission!('c1', p2.items[0].id);
      expect((await s.listSubmissions!('c1')).total).toBe(1);
    });
  });

suite('MemoryFormStore', () => new MemoryFormStore());
let n = 0;
suite('IndexedDbFormStore', () => new IndexedDbFormStore(`t-${n++}`));
suite('RestFormStore', () => {
  const srv = new FakeFormServer();
  return new RestFormStore({ url: srv.base + '/', fetch: srv.fetch });
});

describe('IndexedDbFormStore', () => {
  it('keeps forms and submissions across instances', async () => {
    const a = new IndexedDbFormStore('persist');
    await a.saveForm(contact);
    await a.submit('c1', { email: 'a@b.co' });
    a.close();
    const b = new IndexedDbFormStore('persist');
    expect((await b.getForm('c1'))?.name).toBe('Contact');
    expect((await b.listSubmissions('c1')).total).toBe(1);
    await b.deleteForm('c1');
    b.close();
    const c = new IndexedDbFormStore('persist');
    expect(await c.listForms()).toEqual([]);
    expect((await c.listSubmissions('c1')).total).toBe(0);
  });
});

describe('RestFormStore on the wire', () => {
  it('snake_case, If-Match, headers, the submit URL', async () => {
    const srv = new FakeFormServer();
    const s = new RestFormStore({ url: srv.base, fetch: srv.fetch, headers: () => ({ 'X-Token': 't' }) });
    const f = await s.saveForm(contact);
    await s.saveForm({ ...contact, name: 'B' }, f.version);
    expect(srv.calls[1]).toMatchObject({ method: 'PUT', path: '/forms/c1', headers: { 'If-Match': `"${f.version}"`, 'X-Token': 't' } });
    await s.submit('c1', { email: 'a@b.co' }, { pageId: 'p9', url: 'u' });
    expect(srv.calls[2]).toMatchObject({ method: 'POST', path: '/forms/c1/submissions', body: { data: { email: 'a@b.co' }, meta: { page_id: 'p9', url: 'u' } } });
    srv.reply = { message: 'Got it', redirect: '/thanks' };
    expect(await s.submit('c1', { email: 'b@b.co' })).toMatchObject({ message: 'Got it', redirect: '/thanks' });
    await expect(s.submit('c1', { email: 'x' })).rejects.toBeInstanceOf(StoreError);
    expect(submitUrlOf('https://api.test/x/', 'a b')).toBe('https://api.test/x/forms/a%20b/submissions');
  });

  it('files: multipart with _meta', async () => {
    const srv = new FakeFormServer();
    const s = new RestFormStore({ url: srv.base, fetch: srv.fetch });
    await s.saveForm({ id: 'u', name: 'Upload', fields: [{ id: 'f', type: 'file', name: 'cv' }] as any, settings: {} });
    await s.submit('u', { cv: new File(['x'], 'cv.pdf') }, { url: 'u' });
    const call = srv.calls[srv.calls.length - 1];
    expect(call.headers['Content-Type']).toBeUndefined();
    expect(call.body).toMatchObject({ cv: { file: 'cv.pdf' }, _meta: '{"url":"u"}' });
  });
});

describe('MemoryFormStore files', () => {
  it('keeps name, size and type of a file, not its content', async () => {
    const s = new MemoryFormStore();
    await s.saveForm({ id: 'u', name: 'U', fields: [{ id: 'f', type: 'file', name: 'cv' }] as any, settings: {} });
    await s.submit('u', { cv: new File(['abc'], 'cv.pdf', { type: 'application/pdf' }) });
    expect((await s.listSubmissions('u')).items[0].data.cv).toEqual({ name: 'cv.pdf', size: 3, type: 'application/pdf' });
  });
});
