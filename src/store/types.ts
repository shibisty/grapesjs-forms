import type { FormDef, SubmissionData } from '../schema';

/** What a form write sends. */
export interface FormWrite {
  id: string;
  name: string;
  fields: FormDef['fields'];
  settings: FormDef['settings'];
  attrs?: FormDef['attrs'];
}

/** What the site sends with the values. */
export interface SubmissionMeta {
  /** The page address the form was sent from. */
  url?: string;
  referrer?: string;
  /** grapesjs-pages record id of the page, when known. */
  pageId?: string;
  lang?: string;
  [key: string]: unknown;
}

export interface Submission {
  id: string;
  formId: string;
  data: SubmissionData;
  meta?: SubmissionMeta;
  createdAt: string;
}

/** What the backend answers to a submit. A server may send its own message or a redirect. */
export interface SubmitResult {
  id?: string;
  createdAt?: string;
  message?: string;
  redirect?: string;
}

export interface SubmissionPage {
  items: Submission[];
  total: number;
}

/** A write that hit a newer version (HTTP 412). */
export class ConflictError extends Error {
  readonly status = 412;
  constructor(message = 'The form was changed elsewhere (412)') {
    super(message);
    this.name = 'ConflictError';
  }
}

/** A request the backend refused (validation: 422 with `errors` per field). */
export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `{ email: ['email'], name: ['required'] }` */
    readonly errors: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/**
 * Where forms and their submissions live. Versions are opaque: a write with
 * `ifVersion` fails with `ConflictError` when the form moved on.
 */
export interface FormStore {
  listForms(): Promise<FormDef[]>;
  getForm(id: string): Promise<FormDef | undefined>;
  saveForm(form: FormWrite, ifVersion?: string | number | null): Promise<FormDef>;
  deleteForm(id: string): Promise<void>;

  /** What the site does: sends one submission. Refuses invalid data with `StoreError` 422. */
  submit(formId: string, data: SubmissionData, meta?: SubmissionMeta): Promise<SubmitResult>;
  /** Newest first. */
  listSubmissions?(formId: string, page?: { limit?: number; offset?: number }): Promise<SubmissionPage>;
  deleteSubmission?(formId: string, id: string): Promise<void>;
}
