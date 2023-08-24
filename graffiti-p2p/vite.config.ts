import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'graffiti-p2p.js'),
      name: 'graffiti-p2p',
      fileName: 'graffiti-p2p',
      formats: ['es']
    }
  }
})
