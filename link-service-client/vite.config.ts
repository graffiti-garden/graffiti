import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'link-service.js'),
      name: 'link-service',
      fileName: 'link-service',
      formats: ['es']
    }
  }
})