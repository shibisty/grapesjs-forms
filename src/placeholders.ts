/**
 * `{{placeholders}}` in field values (above all in hidden fields).
 *
 * Two moments fill them:
 *  - when the editor builds the component (build time): `{{form.*}}` and,
 *    next to grapesjs-pages, `{{page.*}}` of the page the form is on;
 *  - in the visitor's browser (run time, the form's script): everything
 *    else — the address, the query string, cookies, the date…
 *
 * An unknown run-time placeholder becomes an empty string.
 */

export const TOKEN_RE = /\{\{\s*([A-Za-z_][\w.\-]*)\s*\}\}/g;

export interface BuildContext {
  form?: { id: string; name: string };
  /** The page of grapesjs-pages the form is on (any record fields: id, name, slug…). */
  page?: Record<string, unknown> | null;
}

const BUILD_HEADS = new Set(['form', 'page']);

/** Fills `{{form.*}}` and `{{page.*}}`; leaves run-time placeholders as they are. */
export function resolveBuild(tpl: string, ctx: BuildContext = {}): string {
  return String(tpl ?? '').replace(TOKEN_RE, (all, path: string) => {
    const [head, ...rest] = path.split('.');
    if (!BUILD_HEADS.has(head)) return all;
    const src = (head === 'form' ? ctx.form : ctx.page) as Record<string, unknown> | undefined | null;
    // Without grapesjs-pages `{{page.*}}` is left to the run time (the script knows `document.title`, the path).
    if (head === 'page' && !src) return all;
    let v: unknown = src;
    for (const k of rest) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
    return v == null || typeof v === 'object' ? '' : String(v);
  });
}

/** Whether a value still has placeholders for the visitor's browser. */
export const hasTokens = (s: string | undefined | null): boolean => !!s && new RegExp(TOKEN_RE.source).test(s);

/** The placeholders the editor lists in its help (`key` → description key of the labels). */
export const PLACEHOLDERS: ReadonlyArray<{ token: string; at: 'build' | 'run' }> = [
  { token: '{{url}}', at: 'run' },
  { token: '{{path}}', at: 'run' },
  { token: '{{host}}', at: 'run' },
  { token: '{{referrer}}', at: 'run' },
  { token: '{{title}}', at: 'run' },
  { token: '{{lang}}', at: 'run' },
  { token: '{{query.utm_source}}', at: 'run' },
  { token: '{{cookie.name}}', at: 'run' },
  { token: '{{storage.key}}', at: 'run' },
  { token: '{{date}}', at: 'run' },
  { token: '{{time}}', at: 'run' },
  { token: '{{datetime}}', at: 'run' },
  { token: '{{timestamp}}', at: 'run' },
  { token: '{{uuid}}', at: 'run' },
  { token: '{{form.id}}', at: 'build' },
  { token: '{{form.name}}', at: 'build' },
  { token: '{{page.id}}', at: 'build' },
  { token: '{{page.name}}', at: 'build' },
  { token: '{{page.slug}}', at: 'build' },
];
