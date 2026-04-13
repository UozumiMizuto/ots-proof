import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'verifier',
  publicDir: resolve(__dirname, 'verifier/public'),
  build: {
    outDir: resolve(__dirname, 'verifier/dist'),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'verifier/index.html'),
      },
    },
  },
})
