import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    minifyIdentifiers: false,
    keepNames: true,
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/link-service.ts'),
      name: 'link-service',
      fileName: 'link-service',
      formats: ['es']
    }
  }
})