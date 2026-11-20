import { afterEach, describe, expect, it } from 'vitest';
import grapesjs, { type Editor } from 'grapesjs';
import plugin, { META, VERSION } from '../src/index';
import { CONTROLS, definePlugin, type PluginControl } from '../src/contract';
import { createEditor, destroyEditor } from './helpers/editor';
import pkg from '../package.json';

const control = (ed: object): PluginControl => (ed as Record<symbol, Map<string, PluginControl>>)[CONTROLS].get(META.id)!;
let editor: Editor | undefined;
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
});

describe('plugin contract', () => {
  it('meta: id = npm name, version = package.json, registered by id', () => {
    expect(META.id).toBe(pkg.name);
    expect(VERSION).toBe(pkg.version);
    expect((plugin as unknown as { meta: unknown }).meta).toBe(META);
    (globalThis as { grapesjs?: unknown }).grapesjs = grapesjs;
    definePlugin(plugin, META);
    expect(grapesjs.plugins.get(META.id)).toBe(plugin);
  });

  it('reports options; autosaveDelay and submitUrl apply live, the store needs a reload', async () => {
    const s = await createEditor({ plugin: { rest: null } });
    editor = s.editor;
    const c = control(editor);
    expect(c.getOptions()).toMatchObject({ rest: null, submitUrl: '', dbName: 'gjs-forms', autosaveDelay: 5, blocks: true, baseCss: true });
    expect(c.setOptions({ autosaveDelay: 100, submitUrl: 'https://x.test', dbName: 'x' })).toEqual({ applied: ['autosaveDelay', 'submitUrl'], reload: ['dbName'] });
    expect(c.getOptions()).toMatchObject({ autosaveDelay: 100, submitUrl: 'https://x.test', dbName: 'gjs-forms' });
    const f = await s.api.create();
    expect(s.api.actionOf(f)).toBe(`https://x.test/forms/${f.id}/submissions`);
  });

  it('submitUrl defaults to rest.url', async () => {
    const { resolveOptions } = await import('../src/index');
    expect(resolveOptions({ rest: { url: '/api/forms' } }).submitUrl).toBe('/api/forms');
    expect(resolveOptions({ rest: { url: '/api/forms' }, submitUrl: 'https://public.test' }).submitUrl).toBe('https://public.test');
  });
});
