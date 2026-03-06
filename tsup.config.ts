import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
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
