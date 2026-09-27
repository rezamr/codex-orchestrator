import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // better-sqlite3 is a native addon. Running several isolated Vitest child
    // processes concurrently can crash the Windows runner before assertions run.
    // Serialize files on Windows while retaining normal parallelism elsewhere.
    fileParallelism: process.platform !== 'win32',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/main/index.ts']
    }
  }
})
