import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      // UMD global: window.grapesjsForms = { default: pluginFn, enhanceForms, RestFormStore, ... }
      name: 'grapesjsForms',
      fileName: (format) => (format === 'umd' ? 'grapesjs-forms.umd.cjs' : 'grapesjs-forms.js'),
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // GrapesJS is never bundled: the plugin runs on the host page's instance.
      external: ['grapesjs'],
      output: { exports: 'named', globals: { grapesjs: 'grapesjs' } },
    },
    sourcemap: true,
  },
});
