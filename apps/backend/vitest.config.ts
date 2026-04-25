import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // SWC handles TS + decorators with emitDecoratorMetadata, which NestJS
  // dependency injection relies on. Vitest's default esbuild loader strips
  // that metadata.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'es2022',
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.e2e.spec.ts'],
    globals: true,
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
