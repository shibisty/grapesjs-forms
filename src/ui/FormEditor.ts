import type { Translator } from '../i18n';
import type { FormsLabels } from '../i18n/types';
import { PLACEHOLDERS } from '../placeholders';
import { formScript } from '../runtime/script';
import {
  CHOICE_TYPES,
  CONTENT_TYPES,
  fieldId,
  fieldName,
  fieldTitle,
  INPUT_TYPES,
  isContent,
  RANGE_TYPES,
  TEXT_LIKE,
  uniqueName,
  WIDTHS,
  type FieldType,
  type FormDef,
  type FormField,
  type SubmissionData,
} from '../schema';
import type { Submission, SubmissionMeta, SubmissionPage, SubmitResult } from '../store/types';
import { StoreError } from '../store/types';
import { clone, fmt } from '../utils';
import { h } from './dom';

export interface EditorDeps {
  t: Translator;
  forms(): FormDef[];
  form(id: string): FormDef | undefined;
  create(): Promise<FormDef>;
  duplicate(id: string): Promise<FormDef>;
  remove(id: string): Promise<void>;
  /** The whole edited form: kept at once, saved after a pause. */
  change(form: FormDef): void;
  /** Where the form posts by default (the endpoint hint). */
  defaultAction(form: FormDef): string;
  previewHtml(form: FormDef): string;
  previewStyles(): { css: string; links: string[] };
  submit(id: string, data: SubmissionData, meta?: SubmissionMeta): Promise<SubmitResult>;
  /** `null` — the store does not list submissions. */
  submissions(id: string, page: { limit: number; offset: number }): Promise<SubmissionPage> | null;
  deleteSubmission(id: string, sid: string): Promise<void>;
  /** Replaces a form by JSON (own or SurveyJS); returns what was left out. */
  applyJson(id: string, json: Record<string, unknown>): Promise<string[]>;
  exportSurveyJs(id: string): Record<string, unknown>;
  onError(e: unknown): void;
}

type Tab = 'fields' | 'settings' | 'preview' | 'submissions' | 'json';

const ICONS: Record<FieldType, string> = {
  text: 'T',
  email: '@',
  tel: '☎',
  url: '🔗',
  number: '#',
  password: '•••',
  textarea: '¶',
  select: '▾',
  radio: '◉',
  checkbox: '☑',
  checkboxes: '☷',
  date: '📅',
  time: '⏱',
  datetime: '🗓',
  range: '⇔',
  color: '◐',
  file: '📎',
  hidden: '👁',
  heading: 'H',
  paragraph: '≡',
};

const PAGE = 50;

/**
 * The forms editor: a list of forms on the left; for the open one its
 * fields (palette → list → properties), settings, a preview styled like the
 * open page, its submissions, and its JSON (own or SurveyJS).
 */
export class FormEditor {
  readonly root: HTMLElement;
  private cur: FormDef | null = null;
  private tab: Tab = 'fields';
  private selField: string | null = null;
  private statusEl: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private propsEl: HTMLElement | null = null;
  private sideEl: HTMLElement | null = null;
  private subs: Submission[] = [];
  private subsTotal = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly d: EditorDeps) {
    this.root = h('div', { class: 'gjsf gjsf-ed' });
  }

  private get t(): Translator {
    return this.d.t;
  }

  /** Opens on a form (the first when none given). */
  show(id?: string | null): void {
    const forms = this.d.forms();
    const f = (id && this.d.form(id)) || (this.cur && this.d.form(this.cur.id)) || forms[0] || null;
    this.cur = f ? clone(f) : null;
    if (this.cur && !this.cur.fields.some((x) => x.id === this.selField)) this.selField = this.cur.fields[0]?.id || null;
    this.render();
  }

  get currentId(): string | null {
    return this.cur?.id || null;
  }

  /** The forms changed elsewhere (a save came back, a reload): the list follows; the open form only when `reload`. */
  setForms(reload = false): void {
    if (this.cur && reload) {
      const f = this.d.form(this.cur.id);
      this.cur = f ? clone(f) : this.d.forms()[0] ? clone(this.d.forms()[0]) : null;
      this.render();
      return;
    }
    if (this.cur && !this.d.form(this.cur.id)) {
      this.show(null);
      return;
    }
    this.renderSide();
  }

  flash(text: string, error = false): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('is-error', error);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    if (!error) this.flashTimer = setTimeout(() => this.statusEl && (this.statusEl.textContent = ''), 2500);
  }

  destroy(): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.root.replaceChildren();
  }

  /* ------------------------------------------------------------------ */

  private changed(): void {
    if (this.cur) this.d.change(clone(this.cur));
  }

  render(): void {
    const t = this.t;
    this.sideEl = h('div', { class: 'gjsf-side' });
    const main = h('div', { class: 'gjsf-main' });
    this.root.replaceChildren(this.sideEl, main);
    this.renderSide();
    const cur = this.cur;
    if (!cur) {
      main.append(h('div', { class: 'gjsf-empty' }, t('noForms')));
      return;
    }
    const name = h('input', { class: 'gjsf-input', value: cur.name, 'aria-label': t('formName'), 'data-role': 'form-name' }) as HTMLInputElement;
    name.addEventListener('input', () => {
      cur.name = name.value;
      this.changed();
      this.renderSide();
    });
    this.statusEl = h('span', { class: 'gjsf-status', 'aria-live': 'polite' });
    const head = h(
      'div',
      { class: 'gjsf-head' },
      name,
      this.statusEl,
      h('button', { class: 'gjsf-btn', type: 'button', 'data-role': 'duplicate', title: t('duplicateForm'), onclick: () => this.duplicate() }, '⧉'),
      h('button', { class: 'gjsf-btn is-danger', type: 'button', 'data-role': 'remove-form', title: t('removeForm'), onclick: () => this.removeForm() }, '🗑')
    );
    const tabs: Array<[Tab, keyof FormsLabels]> = [
      ['fields', 'fields'],
      ['settings', 'settings'],
      ['preview', 'preview'],
      ['submissions', 'submissions'],
      ['json', 'json'],
    ];
    const tabBar = h(
      'div',
      { class: 'gjsf-tabs', role: 'tablist' },
      ...tabs.map(([id, key]) =>
        h(
          'button',
          {
            class: `gjsf-tab${this.tab === id ? ' is-active' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': this.tab === id ? 'true' : 'false',
            'data-tab': id,
            onclick: () => {
              this.tab = id;
              this.render();
            },
          },
          t(key)
        )
      )
    );
    this.body = h('div', { class: 'gjsf-body' });
    main.append(head, tabBar, this.body);
    if (this.tab === 'fields') this.renderFields();
    else if (this.tab === 'settings') this.renderSettings();
    else if (this.tab === 'preview') this.renderPreview();
    else if (this.tab === 'submissions') void this.renderSubmissions(true);
    else this.renderJson();
  }

  private renderSide(): void {
    if (!this.sideEl) return;
    const t = this.t;
    const list = h(
      'ul',
      { class: 'gjsf-side-list' },
      ...this.d.forms().map((f) => {
        const name = this.cur && f.id === this.cur.id ? this.cur.name : f.name;
        return h(
          'li',
          {
            class: `gjsf-side-item${this.cur?.id === f.id ? ' is-active' : ''}`,
            tabindex: '0',
            'data-form': f.id,
            onclick: () => this.show(f.id),
            onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.show(f.id),
          },
          name || f.id
        );
      })
    );
    this.sideEl.replaceChildren(
      h(
        'button',
        {
          class: 'gjsf-btn is-primary',
          type: 'button',
          'data-role': 'new-form',
          onclick: () =>
            void this.d
              .create()
              .then((f) => {
                this.tab = 'fields';
                this.show(f.id);
              })
              .catch(this.d.onError),
        },
        `+ ${t('newForm')}`
      ),
      list
    );
  }

  private duplicate(): void {
    if (!this.cur) return;
    void this.d
      .duplicate(this.cur.id)
      .then((f) => this.show(f.id))
      .catch(this.d.onError);
  }

  private removeForm(): void {
    const cur = this.cur;
    if (!cur || !window.confirm(fmt(this.t('confirmRemoveForm'), cur.name))) return;
    void this.d
      .remove(cur.id)
      .then(() => {
        this.cur = null;
        this.show(null);
      })
      .catch(this.d.onError);
  }

  /* ------------------------------ fields ----------------------------- */

  private renderFields(): void {
    const t = this.t;
    const palette = h(
      'div',
      { class: 'gjsf-palette', 'aria-label': t('addField') },
      h('div', { class: 'gjsf-sec' }, t('addField')),
      ...[...INPUT_TYPES, ...CONTENT_TYPES].map((type) =>
        h(
          'button',
          { type: 'button', 'data-add': type, title: t(`type_${type}` as keyof FormsLabels), onclick: () => this.addField(type) },
          h('span', { class: 'gjsf-ico' }, ICONS[type]),
          t(`type_${type}` as keyof FormsLabels)
        )
      )
    );
    this.listEl = h('div', { class: 'gjsf-list' });
    this.propsEl = h('div', { class: 'gjsf-props' });
    this.body!.replaceChildren(h('div', { class: 'gjsf-cols' }, palette, this.listEl, this.propsEl));
    this.renderList();
    this.renderProps();
  }

  private addField(type: FieldType): void {
    const cur = this.cur!;
    const label = isContent(type) ? '' : this.t(`type_${type}` as keyof FormsLabels);
    const taken = new Set(cur.fields.map((f) => f.name));
    const f: FormField = { id: fieldId(), type, name: isContent(type) ? '' : uniqueName(fieldName(label) || type, taken) };
    if (isContent(type)) f.text = this.t(`type_${type}` as keyof FormsLabels);
    else if (type !== 'hidden') f.label = label;
    if (CHOICE_TYPES.includes(type)) f.options = [1, 2, 3].map((n) => ({ label: `${this.t('optionLabel')} ${n}`, value: `option_${n}` }));
    const at = this.selField ? cur.fields.findIndex((x) => x.id === this.selField) + 1 : cur.fields.length;
    cur.fields.splice(at > 0 ? at : cur.fields.length, 0, f);
    this.selField = f.id;
    this.changed();
    this.renderList();
    this.renderProps();
    this.propsEl?.querySelector<HTMLInputElement>('input,textarea')?.focus();
  }

  private renderList(): void {
    if (!this.listEl || !this.cur) return;
    const t = this.t;
    const fields = this.cur.fields;
    if (!fields.length) {
      this.listEl.replaceChildren(h('p', { class: 'gjsf-hint' }, t('noFields')));
      return;
    }
    const move = (i: number, by: number): void => {
      const j = i + by;
      if (j < 0 || j >= fields.length) return;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      this.changed();
      this.renderList();
    };
    this.listEl.replaceChildren(
      ...fields.map((f, i) =>
        h(
          'div',
          {
            class: `gjsf-row${f.id === this.selField ? ' is-active' : ''}`,
            'data-field': f.id,
            tabindex: '0',
            onclick: () => {
              this.selField = f.id;
              this.renderList();
              this.renderProps();
            },
          },
          h('span', { class: 'gjsf-ico', title: t(`type_${f.type}` as keyof FormsLabels) }, ICONS[f.type]),
          h(
            'div',
            { class: 'gjsf-row-main' },
            h('div', { class: 'gjsf-row-title' }, fieldTitle(f), f.required ? ' *' : ''),
            h('div', { class: 'gjsf-row-sub' }, isContent(f.type) ? t(`type_${f.type}` as keyof FormsLabels) : `${f.name} · ${f.type}`)
          ),
          this.act('↑', t('moveUp'), i === 0, () => move(i, -1)),
          this.act('↓', t('moveDown'), i === fields.length - 1, () => move(i, 1)),
          this.act('⧉', t('duplicate'), false, () => {
            const copy: FormField = { ...clone(f), id: fieldId() };
            if (!isContent(f.type)) copy.name = uniqueName(f.name, new Set(fields.map((x) => x.name)));
            fields.splice(i + 1, 0, copy);
            this.selField = copy.id;
            this.changed();
            this.renderList();
            this.renderProps();
          }),
          this.act('✕', t('remove'), false, () => {
            fields.splice(i, 1);
            if (this.selField === f.id) this.selField = fields[Math.min(i, fields.length - 1)]?.id || null;
            this.changed();
            this.renderList();
            this.renderProps();
          })
        )
      )
    );
  }

  private act(icon: string, title: string, disabled: boolean, run: () => void): HTMLButtonElement {
    return h(
      'button',
      {
        class: 'gjsf-act',
        type: 'button',
        title,
        'aria-label': title,
        disabled,
        onclick: (e: Event) => {
          e.stopPropagation();
          run();
        },
      },
      icon
    );
  }

  /** The title row of the open field changes as its label / name is typed. */
  private refreshRow(f: FormField): void {
    const row = this.listEl?.querySelector<HTMLElement>(`[data-field="${f.id}"]`);
    if (!row) return;
    const title = row.querySelector('.gjsf-row-title');
    const sub = row.querySelector('.gjsf-row-sub');
    if (title) title.textContent = fieldTitle(f) + (f.required ? ' *' : '');
    if (sub && !isContent(f.type)) sub.textContent = `${f.name} · ${f.type}`;
  }

  /** A labelled input bound to `obj[key]`. */
  private text(
    label: string,
    obj: Record<string, any>,
    key: string,
    o: { type?: string; area?: boolean; hint?: string; code?: boolean; onChange?: () => void; placeholder?: string; num?: boolean } = {}
  ): HTMLElement {
    const v = obj[key];
    const attrs: Record<string, string> = {
      class: `gjsf-input${o.code ? ' gjsf-code' : ''}`,
      'data-prop': key,
      ...(o.placeholder ? { placeholder: o.placeholder } : {}),
    };
    const input = (o.area ? h('textarea', { ...attrs, rows: '3' }) : h('input', { ...attrs, type: o.type || 'text' })) as HTMLInputElement;
    input.value = v == null ? '' : String(v);
    input.addEventListener('input', () => {
      const s = input.value;
      if (o.num) {
        const n = s.trim() === '' ? NaN : Number(s);
        if (Number.isInteger(n) && n >= 0) obj[key] = n;
        else delete obj[key];
      } else if (s === '') delete obj[key];
      else obj[key] = s;
      o.onChange?.();
      this.changed();
    });
    return h('label', { class: 'gjsf-f' }, h('span', {}, label), input, o.hint ? h('small', {}, o.hint) : null);
  }

  private check(label: string, obj: Record<string, any>, key: string, o: { invert?: boolean; onChange?: () => void } = {}): HTMLElement {
    const box = h('input', { type: 'checkbox', 'data-prop': key }) as HTMLInputElement;
    box.checked = o.invert ? obj[key] !== false : obj[key] === true;
    box.addEventListener('change', () => {
      if (o.invert) {
        if (box.checked) delete obj[key];
        else obj[key] = false;
      } else if (box.checked) obj[key] = true;
      else delete obj[key];
      o.onChange?.();
      this.changed();
    });
    return h('label', { class: 'gjsf-check' }, box, label);
  }

  /** Placeholder chips that insert into an input. */
  private chips(target: () => HTMLInputElement | null): HTMLElement {
    const t = this.t;
    return h(
      'div',
      {},
      h('small', { class: 'gjsf-hint' }, `${t('placeholders')}: ${t('placeholdersHint')}`),
      h(
        'div',
        { class: 'gjsf-chips' },
        ...PLACEHOLDERS.map((p) =>
          h(
            'button',
            {
              class: `gjsf-chip${p.at === 'build' ? ' is-build' : ''}`,
              type: 'button',
              'data-token': p.token,
              onclick: () => {
                const el = target();
                if (!el) return;
                const s = el.selectionStart ?? el.value.length;
                const e = el.selectionEnd ?? s;
                el.value = el.value.slice(0, s) + p.token + el.value.slice(e);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.focus();
              },
            },
            p.token
          )
        )
      )
    );
  }

  /** `{ name: value }` rows. */
  private kv(label: string, obj: Record<string, any>, key: string): HTMLElement {
    const t = this.t;
    const wrap = h('div', { class: 'gjsf-kvs', 'data-prop': key });
    const rows: Array<[string, string]> = Object.entries((obj[key] as Record<string, string>) || {});
    const write = (): void => {
      const out: Record<string, string> = {};
      rows.forEach(([k, v]) => {
        if (k.trim()) out[k.trim()] = v;
      });
      if (Object.keys(out).length) obj[key] = out;
      else delete obj[key];
      this.changed();
    };
    const draw = (): void => {
      wrap.replaceChildren(
        h('div', { class: 'gjsf-sec' }, label),
        ...rows.map((r, i) => {
          const k = h('input', { class: 'gjsf-input gjsf-code', placeholder: t('attrName'), value: r[0], 'aria-label': t('attrName') }) as HTMLInputElement;
          const v = h('input', { class: 'gjsf-input', placeholder: t('attrValue'), value: r[1], 'aria-label': t('attrValue') }) as HTMLInputElement;
          k.addEventListener('input', () => {
            r[0] = k.value;
            write();
          });
          v.addEventListener('input', () => {
            r[1] = v.value;
            write();
          });
          return h(
            'div',
            { class: 'gjsf-kv' },
            k,
            v,
            this.act('✕', t('remove'), false, () => {
              rows.splice(i, 1);
              write();
              draw();
            })
          );
        }),
        h(
          'button',
          {
            class: 'gjsf-btn',
            type: 'button',
            'data-role': 'add-attr',
            onclick: () => {
              rows.push(['data-', '']);
              draw();
              wrap.querySelectorAll<HTMLInputElement>('.gjsf-kv input')[rows.length * 2 - 2]?.focus();
            },
          },
          `+ ${t('addAttr')}`
        )
      );
    };
    draw();
    return wrap;
  }

  private optionsEditor(f: FormField): HTMLElement {
    const t = this.t;
    const wrap = h('div', { class: 'gjsf-opts', 'data-prop': 'options' });
    const list = (f.options ||= []);
    const draw = (): void => {
      wrap.replaceChildren(
        h('div', { class: 'gjsf-sec' }, t('options')),
        h('small', { class: 'gjsf-hint' }, t('optionsHint')),
        ...list.map((o, i) => {
          const l = h('input', { class: 'gjsf-input', value: o.label, placeholder: t('optionLabel'), 'aria-label': t('optionLabel') }) as HTMLInputElement;
          const v = h('input', { class: 'gjsf-input gjsf-code', value: o.value, placeholder: t('optionValue'), 'aria-label': t('optionValue') }) as HTMLInputElement;
          let auto = o.value === fieldName(o.label) || /^option_\d+$/.test(o.value);
          l.addEventListener('input', () => {
            o.label = l.value;
            if (auto) {
              o.value = fieldName(l.value) || o.value;
              v.value = o.value;
            }
            this.changed();
          });
          v.addEventListener('input', () => {
            auto = false;
            o.value = v.value;
            this.changed();
          });
          return h(
            'div',
            { class: 'gjsf-kv' },
            l,
            v,
            this.act('↑', t('moveUp'), i === 0, () => {
              [list[i - 1], list[i]] = [list[i], list[i - 1]];
              this.changed();
              draw();
            }),
            this.act('✕', t('remove'), false, () => {
              list.splice(i, 1);
              this.changed();
              draw();
            })
          );
        }),
        h(
          'button',
          {
            class: 'gjsf-btn',
            type: 'button',
            'data-role': 'add-option',
            onclick: () => {
              const n = list.length + 1;
              list.push({ label: `${t('optionLabel')} ${n}`, value: `option_${n}` });
              this.changed();
              draw();
            },
          },
          `+ ${t('addOption')}`
        )
      );
    };
    draw();
    return wrap;
  }

  private renderProps(): void {
    if (!this.propsEl || !this.cur) return;
    const t = this.t;
    const f = this.cur.fields.find((x) => x.id === this.selField);
    if (!f) {
      this.propsEl.replaceChildren(h('p', { class: 'gjsf-hint' }, t('noFieldSelected')));
      return;
    }
    const sync = (): void => this.refreshRow(f);
    const typeSel = h(
      'select',
      { class: 'gjsf-input', 'data-prop': 'type', 'aria-label': t('fieldType') },
      ...[...INPUT_TYPES, ...CONTENT_TYPES].map((x) => h('option', { value: x, selected: x === f.type }, t(`type_${x}` as keyof FormsLabels)))
    ) as HTMLSelectElement;
    typeSel.addEventListener('change', () => {
      const next = typeSel.value as FieldType;
      const was = f.type;
      f.type = next;
      if (isContent(next) && !isContent(was)) {
        f.text = f.label || f.text || '';
        f.name = '';
      } else if (!isContent(next) && isContent(was)) {
        f.label = f.text || t(`type_${next}` as keyof FormsLabels);
        f.name = uniqueName(fieldName(f.label) || next, new Set(this.cur!.fields.filter((x) => x !== f).map((x) => x.name)));
      }
      if (CHOICE_TYPES.includes(next) && !f.options?.length) f.options = [1, 2].map((n) => ({ label: `${t('optionLabel')} ${n}`, value: `option_${n}` }));
      this.changed();
      this.renderList();
      this.renderProps();
    });
    const out: Array<HTMLElement | null> = [h('label', { class: 'gjsf-f' }, h('span', {}, t('fieldType')), typeSel)];

    if (isContent(f.type)) {
      out.push(this.text(t('text'), f, 'text', { area: f.type === 'paragraph', onChange: sync }));
      out.push(this.kv(t('attrs'), f, 'attrs'));
      this.propsEl.replaceChildren(...(out.filter(Boolean) as HTMLElement[]));
      return;
    }

    let nameTouched = !!f.name && f.name !== fieldName(f.label || '') && !/^(text|email|tel|url|number|password|textarea|select|radio|checkbox|checkboxes|date|time|datetime|range|color|file|hidden)(_\d+)?$/.test(f.name);
    const nameBox = this.text(t('fieldName'), f, 'name', {
      code: true,
      hint: t('fieldNameHint'),
      onChange: () => {
        nameTouched = true;
        sync();
      },
    });
    const nameInput = nameBox.querySelector('input') as HTMLInputElement;
    nameInput.addEventListener('change', () => {
      const taken = new Set(this.cur!.fields.filter((x) => x !== f && !isContent(x.type)).map((x) => x.name));
      const clean = uniqueName(fieldName(nameInput.value) || (/^[A-Za-z_]/.test(nameInput.value) ? nameInput.value : '') || f.type, taken);
      if (clean !== f.name || nameInput.value !== clean) {
        f.name = clean;
        nameInput.value = clean;
        this.changed();
        sync();
      }
    });

    if (f.type !== 'hidden') {
      out.push(
        this.text(t('fieldLabel'), f, 'label', {
          onChange: () => {
            if (!nameTouched) {
              const taken = new Set(this.cur!.fields.filter((x) => x !== f && !isContent(x.type)).map((x) => x.name));
              const n = fieldName(f.label || '');
              if (n) {
                f.name = uniqueName(n, taken);
                nameInput.value = f.name;
              }
            }
            sync();
          },
        })
      );
    }
    out.push(nameBox);

    const valueBox = this.text(f.type === 'hidden' ? t('hiddenValue') : t('defaultValue'), f, 'value', { code: f.type === 'hidden' });
    const valueInput = (): HTMLInputElement | null => valueBox.querySelector('input');

    if (f.type === 'hidden') {
      out.push(valueBox, this.chips(valueInput));
      out.push(this.kv(t('attrs'), f, 'attrs'));
      this.propsEl.replaceChildren(...(out.filter(Boolean) as HTMLElement[]));
      return;
    }

    if (!['checkbox', 'radio', 'checkboxes', 'range', 'color', 'file', 'date', 'time', 'datetime'].includes(f.type)) out.push(this.text(t('placeholder'), f, 'placeholder'));
    out.push(this.text(t('help'), f, 'help'));
    out.push(this.check(t('required'), f, 'required', { onChange: sync }));
    if (CHOICE_TYPES.includes(f.type)) out.push(this.optionsEditor(f));
    if (f.type === 'select' || f.type === 'file') out.push(this.check(t('multiple'), f, 'multiple'));
    if (f.type !== 'file' && f.type !== 'password') out.push(valueBox, this.chips(valueInput));
    if (RANGE_TYPES.includes(f.type)) {
      const type = f.type === 'number' || f.type === 'range' ? 'number' : f.type === 'datetime' ? 'datetime-local' : f.type;
      out.push(h('div', { class: 'gjsf-grid' }, this.text(t('min'), f, 'min', { type }), this.text(t('max'), f, 'max', { type }), this.text(t('step'), f, 'step', { type: 'number' })));
    }
    if (TEXT_LIKE.includes(f.type)) {
      out.push(h('div', { class: 'gjsf-grid2' }, this.text(t('minLength'), f, 'minLength', { type: 'number', num: true }), this.text(t('maxLength'), f, 'maxLength', { type: 'number', num: true })));
      if (f.type !== 'textarea') out.push(this.text(t('pattern'), f, 'pattern', { code: true, placeholder: '[0-9]{5}' }));
    }
    if (f.type === 'textarea') out.push(this.text(t('rows'), f, 'rows', { type: 'number', num: true }));
    if (f.type === 'file') out.push(this.text(t('accept'), f, 'accept', { code: true, placeholder: 'image/*,.pdf' }));
    if (!['checkbox', 'radio', 'checkboxes', 'file', 'range', 'color'].includes(f.type)) out.push(this.text(t('autocomplete'), f, 'autocomplete', { code: true, placeholder: f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'name' }));

    const width = h('select', { class: 'gjsf-input', 'data-prop': 'width', 'aria-label': t('width') }, ...WIDTHS.map((w) => h('option', { value: w, selected: (f.width || 'full') === w }, w === 'full' ? '100%' : w))) as HTMLSelectElement;
    width.addEventListener('change', () => {
      if (width.value === 'full') delete f.width;
      else f.width = width.value as FormField['width'];
      this.changed();
    });
    out.push(h('label', { class: 'gjsf-f' }, h('span', {}, t('width')), width));
    out.push(h('div', { class: 'gjsf-grid2' }, this.check(t('readonly'), f, 'readonly'), this.check(t('disabled'), f, 'disabled')));
    out.push(this.kv(t('attrs'), f, 'attrs'));
    this.propsEl.replaceChildren(...(out.filter(Boolean) as HTMLElement[]));
  }

  /* ----------------------------- settings ---------------------------- */

  private renderSettings(): void {
    const t = this.t;
    const cur = this.cur!;
    const s = cur.settings;
    const def = this.d.defaultAction(cur);
    this.body!.replaceChildren(
      h(
        'div',
        { class: 'gjsf-pane' },
        this.text(t('endpoint'), s, 'endpoint', { code: true, placeholder: def || 'https://…', hint: fmt(t('endpointHint'), def || t('noEndpoint')) }),
        this.text(t('submitLabel'), s, 'submitLabel', { placeholder: t('submit') }),
        this.text(t('successMessage'), s, 'successMessage', { area: true, placeholder: t('success') }),
        this.text(t('errorMessage'), s, 'errorMessage', { area: true, placeholder: t('error') }),
        this.text(t('redirect'), s, 'redirect', { code: true, placeholder: '/thank-you' }),
        this.check(t('reset'), s, 'reset', { invert: true }),
        this.check(t('honeypot'), s, 'honeypot', { invert: true }),
        this.kv(t('formAttrs'), cur, 'attrs')
      )
    );
  }

  /* ------------------------------ preview ---------------------------- */

  private renderPreview(): void {
    const t = this.t;
    const cur = this.cur!;
    const { css, links } = this.d.previewStyles();
    const frame = h('iframe', { class: 'gjsf-frame', title: t('preview') }) as HTMLIFrameElement;
    const info = h('span', {}, t('previewHint'));
    this.body!.replaceChildren(h('div', { class: 'gjsf-frame-bar' }, info), frame);
    const esc = (u: string): string => u.replace(/"/g, '&quot;');
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">${links.map((l) => `<link rel="stylesheet" href="${esc(l)}">`).join('')}<style>${css.replace(/<\/style/gi, '<\\/style')}</style><style>body{padding:16px}</style></head><body>${this.d.previewHtml(cur)}</body></html>`;
    const wire = (): void => {
      const fdoc = frame.contentDocument;
      const form = fdoc?.querySelector<HTMLFormElement>('form[data-gjsf-form]');
      if (!form || (form as any).__gjsf) return;
      form.addEventListener('gjsf:submit', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        detail.promise = this.d
          .submit(cur.id, detail.data, { ...detail.meta, url: 'editor:preview' })
          .then((r) => {
            info.textContent = t('previewSent');
            return { ...r, message: r.message };
          })
          .catch((err: unknown) => {
            if (err instanceof StoreError) throw { status: err.status, body: { error: err.message, errors: err.errors } };
            throw { status: 0, body: { error: (err as Error)?.message } };
          });
      });
      formScript.call(form);
    };
    // Written into the frame's own document (same origin, no scripts in it): the parent turns the form on.
    const fdoc = frame.contentDocument;
    if (!fdoc) return;
    fdoc.open();
    fdoc.write(doc);
    fdoc.close();
    wire();
    frame.addEventListener('load', wire);
  }

  /* ---------------------------- submissions -------------------------- */

  private async renderSubmissions(fresh: boolean): Promise<void> {
    const t = this.t;
    const cur = this.cur!;
    const pane = h('div', { class: 'gjsf-pane', style: 'max-width:none' });
    this.body!.replaceChildren(pane);
    const req = this.d.submissions(cur.id, { limit: PAGE, offset: fresh ? 0 : this.subs.length });
    if (!req) {
      pane.append(h('p', { class: 'gjsf-hint' }, t('submissionsUnsupported')));
      return;
    }
    try {
      const page = await req;
      if (this.cur?.id !== cur.id || this.tab !== 'submissions') return;
      this.subs = fresh ? page.items : [...this.subs, ...page.items];
      this.subsTotal = page.total;
    } catch (e) {
      pane.append(h('p', { class: 'gjsf-err' }, (e as Error).message));
      return;
    }
    const cols = cur.fields.filter((f) => !isContent(f.type));
    const known = new Set(cols.map((c) => c.name));
    const extra = [...new Set(this.subs.flatMap((s) => Object.keys(s.data || {})))].filter((k) => !known.has(k));
    const heads: Array<{ key: string; title: string }> = [...cols.map((c) => ({ key: c.name, title: c.label || c.name })), ...extra.map((k) => ({ key: k, title: k }))];
    const cell = (v: unknown): string => (v == null ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '✓' : '') : typeof v === 'object' ? JSON.stringify(v) : String(v));
    const bar = h(
      'div',
      { class: 'gjsf-bar' },
      h('button', { class: 'gjsf-btn', type: 'button', 'data-role': 'refresh', onclick: () => void this.renderSubmissions(true) }, `↻ ${t('refresh')}`),
      h(
        'button',
        {
          class: 'gjsf-btn',
          type: 'button',
          'data-role': 'csv',
          disabled: !this.subs.length,
          onclick: () => download(`${cur.name || cur.id}.csv`, toCsv([t('date'), ...heads.map((x) => x.title)], this.subs.map((s) => [s.createdAt, ...heads.map((x) => cell(s.data?.[x.key]))])), 'text/csv'),
        },
        `⇩ ${t('downloadCsv')}`
      ),
      h('span', { class: 'gjsf-hint' }, fmt(t('shownOf'), this.subs.length, this.subsTotal))
    );
    pane.append(bar);
    if (!this.subs.length) {
      pane.append(h('p', { class: 'gjsf-hint' }, t('noSubmissions')));
      return;
    }
    const table = h(
      'table',
      { class: 'gjsf-table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('date')), ...heads.map((x) => h('th', {}, x.title)), h('th', {}, ''))),
      h(
        'tbody',
        {},
        ...this.subs.map((s) =>
          h(
            'tr',
            { 'data-submission': s.id },
            h('td', { title: String(s.meta?.url || '') }, new Date(s.createdAt).toLocaleString()),
            ...heads.map((x) => h('td', {}, cell(s.data?.[x.key]))),
            h(
              'td',
              {},
              this.act('✕', t('remove'), false, () => {
                if (!window.confirm(t('confirmDeleteSubmission'))) return;
                void this.d
                  .deleteSubmission(cur.id, s.id)
                  .then(() => this.renderSubmissions(true))
                  .catch(this.d.onError);
              })
            )
          )
        )
      )
    );
    pane.append(h('div', { class: 'gjsf-table-wrap' }, table));
    if (this.subs.length < this.subsTotal) pane.append(h('button', { class: 'gjsf-btn', type: 'button', 'data-role': 'more', onclick: () => void this.renderSubmissions(false) }, t('loadMore')));
  }

  /* ------------------------------- JSON ------------------------------ */

  private renderJson(): void {
    const t = this.t;
    const cur = this.cur!;
    const { id: _id, version: _v, updatedAt: _u, ...own } = cur;
    const area = h('textarea', { class: 'gjsf-input gjsf-code', rows: '22', 'data-role': 'json', spellcheck: 'false' }) as HTMLTextAreaElement;
    area.value = JSON.stringify(own, null, 2);
    const msg = h('p', { class: 'gjsf-hint', 'aria-live': 'polite' });
    this.body!.replaceChildren(
      h(
        'div',
        { class: 'gjsf-pane', style: 'max-width:none' },
        h('p', { class: 'gjsf-hint' }, t('jsonHint')),
        area,
        h(
          'div',
          { class: 'gjsf-bar' },
          h(
            'button',
            {
              class: 'gjsf-btn is-primary',
              type: 'button',
              'data-role': 'apply-json',
              onclick: () => {
                let json: Record<string, unknown>;
                try {
                  json = JSON.parse(area.value);
                } catch (e) {
                  msg.textContent = fmt(t('jsonError'), (e as Error).message);
                  msg.className = 'gjsf-err';
                  return;
                }
                void this.d
                  .applyJson(cur.id, json)
                  .then((skipped) => {
                    this.cur = clone(this.d.form(cur.id) || cur);
                    this.selField = this.cur.fields[0]?.id || null;
                    this.render();
                    if (skipped.length) this.flash(fmt(t('skipped'), skipped.join(', ')), true);
                    else this.flash(t('saved'));
                  })
                  .catch(this.d.onError);
              },
            },
            t('applyJson')
          ),
          h(
            'button',
            {
              class: 'gjsf-btn',
              type: 'button',
              'data-role': 'export-surveyjs',
              onclick: () => download(`${cur.name || cur.id}.survey.json`, JSON.stringify(this.d.exportSurveyJs(cur.id), null, 2), 'application/json'),
            },
            `⇩ ${t('exportSurveyJs')}`
          )
        ),
        msg
      )
    );
  }
}

/** RFC 4180 CSV with a BOM (Excel opens UTF-8). */
export function toCsv(head: string[], rows: string[][]): string {
  const q = (s: string): string => (/[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + [head, ...rows].map((r) => r.map((c) => q(String(c ?? ''))).join(',')).join('\r\n');
}

function download(name: string, text: string, type: string): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name.replace(/[\\/:*?"<>|]+/g, '_') });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* no Blob URLs (tests) */
  }
}
