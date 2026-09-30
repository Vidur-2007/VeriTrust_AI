import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env for the whole project, at the repo root. Only VITE_* and DEMO_* variables reach
  // the browser; everything else in it (the Gemini key) stays on the server.
  envDir: '..',
  envPrefix: ['VITE_', 'DEMO_'],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // The FastAPI backend (uvicorn on :8000). SSE streams pass through unbuffered.
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
})
