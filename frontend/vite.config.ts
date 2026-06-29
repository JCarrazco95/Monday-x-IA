import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Envuelve los require() de módulos CommonJS para resolver dependencias
    // circulares (p.ej. lodash dentro de recharts/RadarChart). Sin esto, el
    // bundle de producción rompía con "n is not a function" al cargar Coaching.
    commonjsOptions: {
      strictRequires: true
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})
