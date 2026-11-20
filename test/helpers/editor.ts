import grapesjs, { type Editor } from 'grapesjs';
import formsPlugin, { getForms } from '../../src/index';
import { MemoryFormStore } from '../../src/store/MemoryFormStore';
import type { FormStore } from '../../src/store/types';
import type { FormsApi, FormsOptions } from '../../src/types';

export interface Setup {
  editor: Editor;
  api: FormsApi;
  store: FormStore;
}

/** A real grapesjs editor in jsdom with the plugin and an in-memory store. */
export async function createEditor(o: { plugin?: FormsOptions; html?: string; before?: (ed: Editor) => void; store?: FormStore } = {}): Promise<Setup> {
  const container = document.createElement('div');
  document.body.append(container);
  const store = o.store || o.plugin?.store || new MemoryFormStore();
  const editor = grapesjs.init({
    container,
    height: '600px',
    storageManager: false,
    telemetry: false,
    components: o.html ?? '',
    plugins: [
      (ed: Editor) => {
        o.before?.(ed);
        formsPlugin(ed, { autosaveDelay: 5, ...o.plugin, store });
      },
    ],
  } as Parameters<typeof grapesjs.init>[0]);
  await new Promise<void>((r) => editor.onReady(() => r()));
  await tick(10);
  return { editor, api: getForms(editor)!, store };
}

export async function destroyEditor(editor: Editor | undefined): Promise<void> {
  if (!editor) return;
  try {
    editor.select([]);
  } catch {
    /* gone */
  }
  await tick(30);
  try {
    editor.destroy();
  } catch {
    /* jsdom teardown noise */
  }
  document.body.innerHTML = '';
}

export const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const until = async (fn: () => boolean | Promise<boolean>, ms = 1500): Promise<void> => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('timed out');
    await tick(5);
  }
};

export function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
