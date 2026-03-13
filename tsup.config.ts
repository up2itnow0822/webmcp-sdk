import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      // Public entrypoints - each maps to a dist/*.js + dist/*.mjs + dist/*.d.ts output.
      // src/core.ts is intentionally NOT listed here: it is an internal module
      // bundled through src/index.ts (re-exported via `export { ... } from './core.js'`).
      // Adding core.ts as a separate entry would produce a redundant dist/core.js and
      // break consumers that import only from the package root.
      index: 'src/index.ts',
      react: 'src/react.ts',
      security: 'src/security.ts',
      testing: 'src/testing.ts',
      'middleware/express': 'src/middleware/express.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react'],
  },
]);
