import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        vanilla: resolve(__dirname, 'graffiti-p2p.js'),
        vue: resolve(__dirname, 'plugins/vue/plugin.js'),
      },
      fileName: (fmt, name)=> `${name}.${fmt}.js`
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
