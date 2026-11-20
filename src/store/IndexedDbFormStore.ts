import type { FormDef } from '../schema';
import { MemoryFormStore } from './MemoryFormStore';
import type { Submission } from './types';

const STORE = 'forms';
const VERSION = 1;

/**
 * Local backend: one IndexedDB database (object store `forms`, records
 * `{ key: 'form:<id>' | 'submission:<id>', value }`). Loaded into memory
 * once; every change is written through, key by key.
 *
 * Submissions kept here are the editor's own (the preview, the API): a
 * published site cannot reach the editor's IndexedDB — give it a REST
 * backend (`rest` / `submitUrl`).
 */
export class IndexedDbFormStore extends MemoryFormStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private loaded: Promise<void> | null = null;

  constructor(
    readonly dbName = 'gjs-forms',
    private readonly factory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined
  ) {
    super();
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbp) return this.dbp;
    const factory = this.factory;
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    this.dbp = new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(this.dbName, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          this.dbp = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    this.dbp.catch(() => (this.dbp = null));
    return this.dbp;
  }

  /** Loads the database into memory once. */
  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.open().then(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            req.onsuccess = () => {
              (req.result as Array<{ key: string; value: unknown }>).forEach(({ key, value }) => {
                if (key.startsWith('form:')) this.forms.set(key.slice(5), value as FormDef);
                else if (key.startsWith('submission:')) this.submissions.set(key.slice(11), value as Submission);
              });
              resolve();
            };
            req.onerror = () => reject(req.error);
          })
      );
      this.loaded.catch(() => (this.loaded = null));
    }
    return this.loaded;
  }

  protected async changed(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      if (value === null) s.delete(key);
      else s.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close(): void {
    void this.dbp?.then((db) => db.close());
    this.dbp = null;
    this.loaded = null;
  }
}

// Every read and write waits for the database to be loaded first.
for (const m of ['listForms', 'getForm', 'saveForm', 'deleteForm', 'submit', 'listSubmissions', 'deleteSubmission'] as const) {
  const base = MemoryFormStore.prototype[m] as (...a: unknown[]) => Promise<unknown>;
  (IndexedDbFormStore.prototype as any)[m] = async function (this: IndexedDbFormStore, ...args: unknown[]) {
    await this.load();
    return base.apply(this, args);
  };
}
