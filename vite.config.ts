import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A pasta do projeto fica num volume que nao permite remover arquivos,
// entao usamos nomes fixos (sobrescreve em vez de recriar) e desligamos a
// limpeza da pasta de saida. O cache do navegador e resolvido por uma
// versao anexada no index.html a cada build (ver scripts/versao.mjs).
export default defineConfig({
  base: '/motor/',
  plugins: [react()],
  server: { port: 5181, open: true },
  build: {
    outDir: 'docs',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/motor.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/motor.[ext]',
      },
    },
  },
})
