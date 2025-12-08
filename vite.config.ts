import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [pages({
    entry: 'src/main.ts'
  })],
  build: {
    outDir: 'dist'
  }
})


