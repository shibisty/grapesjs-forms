/**
 * The form's behaviour on the site. GrapesJS exports it with the page's
 * JS (it is the `script` of the form component), so it must stay
 * self-contained: no imports, no outer variables — GrapesJS copies its
 * source text, `this` is the `<form>`.
 *
 * What it does:
 *  - fills `data-gjsf-value` placeholders (`{{query.utm_source}}`, `{{url}}`…);
 *  - checks the form (the browser's own validation, plus "at least one" of
 *    required checkbox groups), sends it as JSON `{ data, meta }` (with
 *    files: multipart) to the form's `action`;
 *  - shows the server's per-field errors (422 `errors`), the message, or
 *    opens the redirect;
 *  - fires `gjsf:submit` (cancelable; a listener may set `detail.promise`
 *    to send it itself), `gjsf:success`, `gjsf:error` on the form.
 */
export function formScript(this: HTMLFormElement, _props?: unknown): void {
  const form = this as HTMLFormElement & { __gjsf?: boolean };
  if (!form || form.__gjsf || form.tagName !== 'FORM') return;
  form.__gjsf = true;
  const doc = form.ownerDocument;
  const win = (doc.defaultView || window) as Window & typeof globalThis;
  const loc = win.location;
  const all = <T extends Element = HTMLElement>(sel: string): T[] => Array.prototype.slice.call(form.querySelectorAll(sel));
  const attr = (n: string): string => form.getAttribute(n) || '';
  let codes: Record<string, string> = {};
  try {
    codes = JSON.parse(attr('data-gjsf-codes') || '{}') || {};
  } catch (_e) {
    codes = {};
  }

  const two = (n: number): string => (n < 10 ? '0' : '') + n;
  const cookie = (name: string): string => {
    const parts = (doc.cookie || '').split(';');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      const eq = p.indexOf('=');
      if (eq > 0 && decodeURIComponent(p.slice(0, eq)) === name) return decodeURIComponent(p.slice(eq + 1));
    }
    return '';
  };
  const uid = (): string => {
    const c = win.crypto as Crypto | undefined;
    if (c && typeof c.randomUUID === 'function') {
      try {
        return c.randomUUID();
      } catch (_e) {
        /* not a secure context */
      }
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 3) | 8).toString(16);
    });
  };
  const fill = (tpl: string): string =>
    String(tpl || '').replace(/\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g, (_m: string, path: string) => {
      const dot = path.indexOf('.');
      const head = dot < 0 ? path : path.slice(0, dot);
      const key = dot < 0 ? '' : path.slice(dot + 1);
      const now = new Date();
      let query: URLSearchParams | null = null;
      try {
        query = new URLSearchParams(loc.search);
      } catch (_e) {
        query = null;
      }
      switch (head) {
        case 'url':
          return loc.href;
        case 'path':
          return loc.pathname;
        case 'host':
          return loc.host;
        case 'referrer':
          return doc.referrer || '';
        case 'title':
          return doc.title || '';
        case 'lang':
          return doc.documentElement.lang || (win.navigator && win.navigator.language) || '';
        case 'query':
          return (query && query.get(key)) || '';
        case 'cookie':
          return cookie(key);
        case 'storage':
          try {
            return win.localStorage.getItem(key) || '';
          } catch (_e) {
            return '';
          }
        case 'date':
          return now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate());
        case 'time':
          return two(now.getHours()) + ':' + two(now.getMinutes());
        case 'datetime':
          return now.toISOString();
        case 'timestamp':
          return String(now.getTime());
        case 'uuid':
          return uid();
        case 'page':
          // Without grapesjs-pages the editor leaves {{page.*}} to the browser.
          return key === 'url' ? loc.href : key === 'path' || key === 'slug' ? loc.pathname : key === 'name' || key === 'title' ? doc.title || '' : '';
        default:
          return '';
      }
    });

  /** Fills placeholders; visible fields only once (the visitor may change them), hidden ones every time. */
  const applyValues = (hiddenOnly: boolean): void => {
    all<HTMLInputElement>('[data-gjsf-value]').forEach((el) => {
      const v = fill(el.getAttribute('data-gjsf-value') || '');
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') el.value = v;
      else if (hiddenOnly) return;
      else if (type === 'checkbox' || type === 'radio') {
        const list = v.split(',').map((x) => x.trim());
        el.checked = el.value === '1' && type === 'checkbox' ? /^(1|true|on|yes)$/i.test(v) : list.indexOf(el.value) >= 0;
      } else if (el.tagName === 'SELECT') {
        const list = v.split(',').map((x) => x.trim());
        Array.prototype.forEach.call((el as unknown as HTMLSelectElement).options, (o: HTMLOptionElement) => (o.selected = list.indexOf(o.value) >= 0));
      } else if (!el.value) el.value = v;
    });
  };
  applyValues(false);

  const msg = form.querySelector<HTMLElement>('.gjsf-message');
  const submitBtns = all<HTMLButtonElement>('[type="submit"]');
  const setState = (state: '' | 'sending' | 'success' | 'error', text?: string): void => {
    form.classList.remove('is-sending', 'is-success', 'is-error');
    if (state) form.classList.add('is-' + state);
    form.setAttribute('aria-busy', state === 'sending' ? 'true' : 'false');
    submitBtns.forEach((b) => (b.disabled = state === 'sending'));
    if (msg) {
      msg.textContent = text || '';
      if (text) msg.removeAttribute('hidden');
      else msg.setAttribute('hidden', '');
    }
  };
  const esc = (s: string): string => s.replace(/["\\]/g, '\\$&');
  const fieldBox = (name: string): HTMLElement | null => form.querySelector('[data-gjsf-field="' + esc(name) + '"]');
  const clearError = (name: string): void => {
    const box = fieldBox(name);
    if (box) box.classList.remove('has-error');
    const e = form.querySelector('[data-gjsf-error-for="' + esc(name) + '"]');
    if (e) e.textContent = '';
    all('[name="' + esc(name) + '"]').forEach((i) => i.removeAttribute('aria-invalid'));
  };
  const clearErrors = (): void => {
    all('[data-gjsf-field]').forEach((b) => clearError(b.getAttribute('data-gjsf-field') || ''));
  };
  /** Errors by field name: server messages, or codes (`required`) turned into the form's texts. */
  const showErrors = (errors: Record<string, string[] | string>): boolean => {
    let first: HTMLElement | null = null;
    let shown = false;
    Object.keys(errors || {}).forEach((name) => {
      const list = ([] as string[]).concat(errors[name] as string[]).map((c) => codes[c] || c);
      const box = fieldBox(name);
      const e = form.querySelector('[data-gjsf-error-for="' + esc(name) + '"]');
      if (!box && !e) return;
      shown = true;
      if (box) box.classList.add('has-error');
      if (e) e.textContent = list.join(' ');
      all<HTMLElement>('[name="' + esc(name) + '"]').forEach((i) => {
        i.setAttribute('aria-invalid', 'true');
        if (!first) first = i;
      });
    });
    if (first) (first as HTMLElement).focus();
    return shown;
  };

  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | null;
    if (t && t.name) clearError(t.name);
  });
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | null;
    if (t && t.name) clearError(t.name);
  });

  const emit = (type: string, detail: Record<string, unknown>, cancelable?: boolean): CustomEvent => {
    const ev = new (win.CustomEvent || CustomEvent)(type, { bubbles: true, cancelable: !!cancelable, detail });
    form.dispatchEvent(ev);
    return ev;
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (form.classList.contains('is-sending')) return;
    clearErrors();
    applyValues(true);
    // Required checkbox groups: at least one.
    const missing: Record<string, string[]> = {};
    all('[data-gjsf-required]').forEach((g) => {
      const name = g.getAttribute('data-gjsf-field') || '';
      if (!g.querySelector('input:checked')) missing[name] = ['required'];
    });
    if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
      if (typeof form.reportValidity === 'function') form.reportValidity();
      return;
    }
    if (Object.keys(missing).length) {
      showErrors(missing);
      return;
    }

    const fd = new FormData(form);
    const data: Record<string, unknown> = {};
    let hasFile = false;
    fd.forEach((v, k) => {
      if (typeof v !== 'string') {
        if (!(v as File).name && !(v as File).size) return; // an empty file input
        hasFile = true;
      }
      if (k in data) data[k] = ([] as unknown[]).concat(data[k], v);
      else data[k] = v;
    });
    all('[data-gjsf-field]').forEach((box) => {
      const name = box.getAttribute('data-gjsf-field') || '';
      const c = box.classList;
      if (c.contains('gjsf-field--checkboxes') || box.querySelector('select[multiple]')) data[name] = name in data ? ([] as unknown[]).concat(data[name]) : [];
      else if (c.contains('gjsf-field--checkbox')) data[name] = name in data;
    });
    const meta: Record<string, unknown> = { url: loc.href, referrer: doc.referrer || '', lang: doc.documentElement.lang || '' };
    if (attr('data-gjsf-page')) meta.page_id = attr('data-gjsf-page');
    const formId = attr('data-gjsf-form');
    const success = (j: Record<string, any>): void => {
      emit('gjsf:success', { formId, data, response: j });
      const to = (j && j.redirect) || attr('data-gjsf-redirect');
      if (to) {
        setState('success', '');
        loc.assign(to);
        return;
      }
      if (attr('data-gjsf-reset') !== 'false') {
        form.reset();
        applyValues(false);
      }
      setState('success', (j && j.message) || attr('data-gjsf-success'));
    };
    const failure = (status: number, j: Record<string, any>): void => {
      if (j && j.errors) showErrors(j.errors);
      emit('gjsf:error', { formId, data, status, response: j });
      setState('error', (j && (j.error || j.message)) || attr('data-gjsf-error'));
    };

    const detail: Record<string, any> = { formId, data, meta, formData: fd, promise: null };
    const sub = emit('gjsf:submit', detail, true);
    setState('sending');
    let p: Promise<unknown>;
    if (detail.promise) p = Promise.resolve(detail.promise);
    else if (sub.defaultPrevented) {
      setState('');
      return;
    } else {
      const action = form.getAttribute('action');
      if (!action) {
        failure(0, {});
        return;
      }
      let body: BodyInit;
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (hasFile) {
        fd.append('_meta', JSON.stringify(meta));
        body = fd;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ data, meta });
      }
      p = win.fetch(action, { method: 'POST', headers, body, credentials: 'same-origin' }).then((res) =>
        res.text().then((text) => {
          let j: Record<string, any> = {};
          try {
            j = text ? JSON.parse(text) : {};
          } catch (_e) {
            j = {};
          }
          if (!res.ok) throw { status: res.status, body: j };
          return j;
        })
      );
    }
    p.then(
      (j) => success((j || {}) as Record<string, any>),
      (e: any) => failure((e && e.status) || 0, (e && (e.body || (e.errors ? e : null))) || {})
    );
  });
}
