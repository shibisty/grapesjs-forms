import type { BuildOptions } from './build';
import type { FormsLabels } from './i18n/types';
import type { FormDef, FormField, FormSettings, SubmissionData } from './schema';
import type { RestOptions } from './store/RestFormStore';
import type { FormStore, SubmissionMeta, SubmitResult } from './store/types';
import type { SurveyImport } from './surveyjs';

export interface FormsOptions {
  /** Your own backend (wins over `rest`). */
  store?: FormStore | null;
  /** A server of openapi.yaml: forms and submissions. `null` — IndexedDB in the browser. */
  rest?: RestOptions | null;
  /**
   * Base URL the published site posts to (`<submitUrl>/forms/<id>/submissions`).
   * Default: `rest.url`. A form's own `settings.endpoint` wins.
   */
  submitUrl?: string | null;
  /** IndexedDB database of the local store. */
  dbName?: string;
  /** Delay before an edit is saved, ms. */
  autosaveDelay?: number;
  /** Blocks of the forms (one per form + "New form"). */
  blocks?: boolean;
  /** Adds a small base stylesheet for forms to the project CSS once (it inherits the site's fonts and colours; restyle it freely). */
  baseCss?: boolean;
  /** Panel of the "Forms" button (`options` of the core layout); `null`/empty — auto. */
  panelId?: string | null;
  /** Texts (any key of the labels). */
  labels?: Partial<FormsLabels>;
  /** The plugin's own UI styles. */
  injectCss?: boolean;
}

export interface ResolvedOptions {
  store: FormStore | null;
  rest: RestOptions | null;
  submitUrl: string | null;
  dbName: string;
  autosaveDelay: number;
  blocks: boolean;
  baseCss: boolean;
  panelId: string | null;
  labels: Partial<FormsLabels>;
  injectCss: boolean;
}

export interface FormInit {
  id?: string;
  name?: string;
  fields?: Array<Partial<FormField>>;
  settings?: FormSettings;
  attrs?: Record<string, string>;
}

/** `editor.Forms` */
export interface FormsApi {
  store: FormStore;
  /** The forms (cached, sorted by name). */
  list(): FormDef[];
  get(id: string): FormDef | undefined;
  reload(): Promise<FormDef[]>;
  /** Creates a form (default fields: name, e-mail, message — unless `fields` is given). */
  create(init?: FormInit): Promise<FormDef>;
  /** Changes a form and saves it (debounced writes are flushed first). */
  update(id: string, patch: Partial<Omit<FormDef, 'id' | 'version' | 'updatedAt'>>): Promise<FormDef>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<FormDef>;
  /** Opens the forms editor (on a form). */
  open(id?: string): void;
  close(): void;
  /** Where a form posts on the site ('' — no endpoint: the site handles `gjsf:submit`). */
  actionOf(form: FormDef | string): string;
  /** The form as HTML (for servers, e-mails, sites without GrapesJS; `enhanceForms()` turns it on). */
  html(id: string, opts?: BuildOptions): string;
  /** Sends a submission through the store (what the preview does). */
  submit(id: string, data: SubmissionData, meta?: SubmissionMeta): Promise<SubmitResult>;
  /** Rebuilds the components of a form (all when no id) in the open project. */
  rebuild(id?: string): number;
  importSurveyJs(json: Record<string, unknown>, into?: string): Promise<SurveyImport>;
  exportSurveyJs(id: string): Record<string, unknown>;
  /** Writes pending edits. */
  flush(): Promise<void>;
}
