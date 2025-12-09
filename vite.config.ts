import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [pages({
    entry: 'src/main.ts'
  })],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        client: 'src/client/index.ts',
      },
      output: {
        entryFileNames: 'static/[name].js',
        chunkFileNames: 'static/chunks/[name]-[hash].js',
        assetFileNames: 'static/assets/[name]-[hash][extname]'
      }
    }
  }
})




