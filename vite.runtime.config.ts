import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * The site side alone (no GrapesJS): `dist/runtime.js` (ES) and
 * `dist/runtime.iife.js` (`<script>` → window.gjsfRuntime). Built after the
 * main bundle, without emptying dist/.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/runtime/index.ts'),
      name: 'gjsfRuntime',
      fileName: (format) => (format === 'iife' ? 'runtime.iife.js' : 'runtime.js'),
      formats: ['es', 'iife'],
    },
    sourcemap: true,
  },
});
